import { byteLength, fail } from "../model/limits.js";
import type { Range, Row } from "../model/types.js";
import { Lexer } from "../parse/lexer.js";
import type { Token } from "../parse/lexer.js";
import { isBuiltin } from "../parse/parser.js";
import type { Extensions, Parser } from "../parse/parser.js";

export type MacroDefinition = string | readonly [
  replacement: string, argumentCount: number, defaultFirstArgument?: string,
];

type Template = {
  readonly parts: readonly (string | number)[];
  readonly count: number;
};

interface Definition {
  readonly replacement?: string;
  readonly count?: number;
  readonly defaultValue?: string | readonly string[];
  readonly parameters?: readonly (readonly string[])[];
  template?: Template;
}

const commandWord = /^\\[A-Za-z]+$/;
const definitions = new Set(["\\def", "\\gdef", "\\edef", "\\xdef"]);
const environmentDeclarations = new Set(["\\newenvironment", "\\renewenvironment", "\\provideenvironment"]);
const declarations = new Set([...definitions, ...environmentDeclarations, "\\newcommand", "\\renewcommand", "\\providecommand", "\\let", "\\global"]);
const primitives = new Set(["\\noexpand", "\\expandafter", "\\csname", "\\endcsname", "\\relax"]);
const endCustom = "\\minimathInternalEnd";
const environmentName = /^[A-Za-z][A-Za-z0-9*._-]{0,63}$/;

interface EnvironmentDefinition {
  readonly begin: Definition;
  readonly end: Template;
}

interface OpenEnvironment {
  readonly name: string;
  readonly end: Template;
  readonly args: readonly (readonly string[])[];
  closed?: true;
}

export interface MacroExtensions extends Pick<Extensions, "macro" | "scope"> {
  customEnvironment(parser: Parser, name: string, token: Token, depth: number): Row | undefined;
}

function readGroup(lexer: Lexer, open: Token, close: "}" | "]"): string[] {
  const tokens: string[] = [];
  let depth = 0;
  for (let token = lexer.read(true); token.value; token = lexer.read(true)) {
    if (depth === 0 && token.value === close) return tokens;
    if (token.value === "{") {
      if (++depth > lexer.limits.maxDepth) fail("depth-limit", "Maximum macro group depth exceeded.", token.range);
    } else if (token.value === "}" && --depth < 0) {
      fail("macro-syntax", "Unexpected closing brace in a macro group.", token.range);
    }
    tokens.push(token.value);
  }
  return fail("macro-syntax", "Unclosed macro group.", open.range);
}

function readArgument(lexer: Lexer): string[] {
  const token = lexer.read();
  if (token.value === "{") return readGroup(lexer, token, "}");
  if (token.value && token.value !== "}") return [token.value];
  return fail("macro-argument", "Expected a macro argument.", token.range);
}

function readDelimited(lexer: Lexer, delimiter: readonly string[], origin: Range): string[] {
  // Match the delimiter in linear time, even for long repeated prefixes.
  const fallback = [0];
  for (let i = 1, matched = 0; i < delimiter.length; i++) {
    while (matched && delimiter[i] !== delimiter[matched]) matched = fallback[matched - 1];
    if (delimiter[i] === delimiter[matched]) matched++;
    fallback.push(matched);
  }
  const tokens: string[] = [];
  let matched = 0;
  let firstGroupEnd = -1;
  let depth = 0;
  for (let token = lexer.read(); token.value; token = lexer.read(true)) {
    tokens.push(token.value);
    if (token.value === "{") {
      depth++;
      if (depth > lexer.limits.maxDepth) fail("depth-limit", "Maximum macro group depth exceeded.", token.range);
      matched = 0;
    } else if (token.value === "}") {
      if (--depth < 0) fail("macro-argument", "Expected a macro argument delimiter.", token.range);
      if (depth === 0 && firstGroupEnd === -1 && tokens[0] === "{") firstGroupEnd = tokens.length;
    } else if (depth === 0) {
      while (matched && token.value !== delimiter[matched]) matched = fallback[matched - 1];
      if (token.value === delimiter[matched] && ++matched === delimiter.length) {
        tokens.length -= delimiter.length;
        return firstGroupEnd === tokens.length ? tokens.slice(1, -1) : tokens;
      }
    }
  }
  return fail("macro-argument", "Expected a macro argument delimiter.", origin);
}

function optionalGroup(lexer: Lexer): string[] | undefined {
  const open = lexer.read();
  if (open.value === "[") return readGroup(lexer, open, "]");
  lexer.unread(open);
}

function compile(tokens: readonly string[], origin: Range, count?: number): Template {
  const parts: (string | number)[] = [];
  let inferred = 0;
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i];
    if (value !== "#") {
      parts.push(value);
      continue;
    }
    const parameter = tokens[++i];
    if (parameter === "#") {
      parts.push("#");
      continue;
    }
    if (!/^[1-9]$/.test(parameter ?? "") || (count !== undefined && Number(parameter) > count)) {
      fail("macro-parameter", "Invalid macro parameter. Use #1 through the declared argument count.", origin);
    }
    const index = Number(parameter);
    inferred = Math.max(inferred, index);
    parts.push(index);
  }
  return { parts, count: count ?? inferred };
}

function tokenize(source: string, lexer: Lexer, origin: Range): string[] {
  const limit = lexer.limits.maxInputBytes;
  if (source.length > limit || byteLength(source) > limit) {
    fail("expansion-limit", "Macro definition exceeds the UTF-8 byte limit.", origin);
  }
  const reader = new Lexer(source, lexer.limits, origin);
  const tokens: string[] = [];
  for (let token = reader.read(true); token.value; token = reader.read(true)) tokens.push(token.value);
  return tokens;
}

function joinTokens(lexer: Lexer, tokens: Iterable<string>, origin: Range): string {
  let bytes = 0;
  let source = "";
  let afterCommand = false;

  function append(token: string): void {
    // The lexer must see the same control-word boundary that TeX's token list preserves.
    const separator = afterCommand && /^[A-Za-z]/.test(token);
    bytes += byteLength(token) + Number(separator);
    if (bytes > lexer.limits.maxInputBytes) {
      fail("expansion-limit", "Expanded macro text exceeds the UTF-8 byte limit.", origin);
    }
    if (separator) source += " ";
    source += token;
    afterCommand = commandWord.test(token);
  }

  for (const token of tokens) append(token);
  return source;
}

function* substitute(template: Template, args: readonly (readonly string[])[]): Iterable<string> {
  for (const part of template.parts) {
    if (typeof part === "string") yield part;
    else yield* args[part - 1];
  }
}

function configured(
  macros: Readonly<Record<string, MacroDefinition>>, protectedName: (name: string) => boolean,
): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  for (const [name, value] of Object.entries(macros)) {
    if (!commandWord.test(name) || protectedName(name)) {
      throw new TypeError("Macros need a new letter-only command name.");
    }
    if (typeof value === "string") {
      definitions.set(name, { replacement: value });
      continue;
    }
    if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
      throw new TypeError("Expected a macro string or a replacement and argument count.");
    }
    const [replacement, count, defaultValue] = value;
    if (typeof replacement !== "string" || !Number.isInteger(count) || count < 0 || count > 9 ||
        (defaultValue !== undefined && (count === 0 || typeof defaultValue !== "string"))) {
      throw new TypeError("Macros take zero to nine arguments and can have a string default for the first argument.");
    }
    definitions.set(name, { replacement, count, ...(defaultValue !== undefined && { defaultValue }) });
  }
  return definitions;
}

function readArity(lexer: Lexer, range: Range): { count: number; defaultValue?: string[] } {
  const arity = optionalGroup(lexer)?.join("").trim();
  if (arity === undefined) return { count: 0 };
  if (!/^[0-9]$/.test(arity)) fail("macro-parameter", "Expected a macro argument count between zero and nine.", range);
  const count = Number(arity);
  const defaultValue = count ? optionalGroup(lexer) : undefined;
  return { count, ...(defaultValue && { defaultValue }) };
}

function braced(lexer: Lexer, message: string): string[] {
  const open = lexer.read();
  if (open.value !== "{") fail("macro-syntax", message, open.range);
  return readGroup(lexer, open, "}");
}

function define(lexer: Lexer, declaration: Token): {
  readonly name: Token;
  readonly definition: Definition;
  readonly tokens: readonly string[];
  readonly count: number;
} {
  const primitive = definitions.has(declaration.value);
  let name = lexer.read();
  if (!primitive && name.value === "*") name = lexer.read();
  if (!primitive && name.value === "{") {
    name = lexer.read();
    const close = lexer.read();
    if (close.value !== "}") fail("macro-syntax", "Expected a closing brace after the macro name.", close.range);
  }
  if (!commandWord.test(name.value)) fail("macro-syntax", "Expected a letter-only macro name.", name.range);
  let defaultValue: string[] | undefined;
  let parameters: string[][] | undefined;
  let open: Token;
  let count = 0;
  if (primitive) {
    parameters = [[]];
    open = lexer.read();
    while (open.value && open.value !== "{") {
      if (open.value === "#") {
        if (++count > 9 || lexer.read().value !== String(count)) {
          fail("macro-parameter", "Expected consecutive positional parameters in a macro definition.", open.range);
        }
        parameters.push([]);
      } else if (open.value === "}") {
        fail("macro-syntax", "Expected a braced macro replacement.", open.range);
      } else {
        parameters[count].push(open.value);
      }
      open = lexer.read();
    }
  } else {
    ({ count, defaultValue } = readArity(lexer, name.range));
    open = lexer.read();
  }
  if (open.value !== "{") fail("macro-syntax", "Expected a braced macro replacement.", open.range);
  return {
    name, tokens: readGroup(lexer, open, "}"), count,
    definition: { ...(defaultValue && { defaultValue }), ...(parameters && { parameters }) },
  };
}

export function macroExtensions(
  macros?: Readonly<Record<string, MacroDefinition>>, extensionCommand?: (name: string) => boolean,
): MacroExtensions {
  const protectedName = (name: string): boolean =>
    declarations.has(name) || primitives.has(name) || name === endCustom || isBuiltin(name.slice(1));
  const knownName = (name: string): boolean => protectedName(name) || extensionCommand?.(name) === true;
  const scopes: (Map<string, Definition> | undefined)[] = [macros && configured(macros, protectedName)];
  const environmentScopes: (Map<string, EnvironmentDefinition> | undefined)[] = [undefined];
  const opened: OpenEnvironment[] = [];
  let work = 0;

  function spend(lexer: Lexer, amount: number, range: Range): void {
    work += amount;
    if (work > 4 * lexer.limits.maxInputBytes) {
      fail("expansion-limit", "Macro substitution work limit exceeded.", range);
    }
  }

  function lookup(name: string): Definition | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const definition = scopes[i]?.get(name);
      if (definition) return definition;
    }
  }

  function set(name: Token, definition: Definition, global = false): void {
    if (protectedName(name.value)) fail("macro-conflict", "This macro name is protected.", name.range);
    if (global) for (const scope of scopes) scope?.delete(name.value);
    const level = global ? 0 : scopes.length - 1;
    (scopes[level] ??= new Map()).set(name.value, definition);
  }

  function findEnvironment(name: string): EnvironmentDefinition | undefined {
    for (let i = environmentScopes.length - 1; i >= 0; i--) {
      const definition = environmentScopes[i]?.get(name);
      if (definition) return definition;
    }
  }

  function invoke(lexer: Lexer, token: Token, definition: Definition): readonly (readonly string[])[] {
    if (!definition.template) {
      const replacement = definition.replacement!;
      spend(lexer, replacement.length, token.range);
      definition.template = compile(tokenize(replacement, lexer, token.range), token.range, definition.count);
    }
    const template = definition.template;
    spend(lexer, template.parts.length, token.range);
    const args: (readonly string[])[] = [];
    for (const prefix of definition.parameters?.[0] ?? []) {
      const next = lexer.read();
      if (next.value !== prefix) fail("macro-argument", "Expected the macro's literal prefix.", next.range);
    }
    if (definition.defaultValue !== undefined) {
      const fallback = definition.defaultValue;
      const supplied = optionalGroup(lexer);
      if (!supplied && typeof fallback === "string") spend(lexer, fallback.length, token.range);
      args.push(supplied ?? (typeof fallback === "string" ? tokenize(fallback, lexer, token.range) : fallback));
    }
    while (args.length < template.count) {
      const delimiter = definition.parameters?.[args.length + 1];
      if (delimiter?.length) {
        spend(lexer, delimiter.length, token.range);
        args.push(readDelimited(lexer, delimiter, token.range));
      } else {
        args.push(readArgument(lexer));
      }
    }
    lexer.expand(joinTokens(lexer, substitute(template, args), token.range), token.range);
    return args;
  }

  function expand(lexer: Lexer, token: Token, depth = 0): boolean {
    if (depth > lexer.limits.maxDepth) fail("depth-limit", "Maximum expansion nesting depth exceeded.", token.range);
    if (token.value === "\\relax") return true;
    if (token.value === "\\expandafter") {
      lexer.expand("", token.range);
      const first = lexer.read();
      const second = lexer.read();
      if (!second.value) fail("macro-argument", "Expected two tokens after expandafter.", token.range);
      if (!expand(lexer, second, depth + 1)) lexer.insert(second.value, second.range);
      lexer.insert(first.value, first.range);
      return true;
    }
    if (token.value === "\\csname") {
      lexer.expand("", token.range);
      let name = "";
      for (let part = lexer.read(); part.value !== "\\endcsname"; part = lexer.read()) {
        if (expand(lexer, part, depth + 1)) continue;
        if (!/^[A-Za-z]$/.test(part.value)) fail("macro-argument", "Expected letters in a constructed command name.", part.range);
        name += part.value;
      }
      if (!name) fail("macro-argument", "Expected a constructed command name.", token.range);
      const command = "\\" + name;
      if (!lookup(command) && !knownName(command)) {
        set({ value: command, range: token.range }, { template: { parts: [], count: 0 } });
      }
      lexer.insert(command, token.range);
      return true;
    }
    const definition = lookup(token.value);
    if (!definition) return false;
    invoke(lexer, token, definition);
    return true;
  }

  function eager(lexer: Lexer, tokens: readonly string[], range: Range): string[] {
    const input = lexer.fork(joinTokens(lexer, tokens, range), range);
    const output: string[] = [];
    for (let token = input.read(true); token.value; token = input.read(true)) {
      spend(lexer, 1, range);
      if (token.value === "\\noexpand") {
        const literal = input.read();
        if (!literal.value) fail("macro-syntax", "Expected a token after the expansion guard.", range);
        output.push(literal.value);
      } else if (!expand(input, token)) {
        output.push(token.value);
      }
    }
    return output;
  }

  return {
    scope(enter) {
      if (enter) {
        scopes.push(undefined);
        environmentScopes.push(undefined);
      } else {
        scopes.pop();
        environmentScopes.pop();
      }
    },
    customEnvironment(parser, name, token, depth) {
      const definition = findEnvironment(name);
      if (!definition) return;
      const args = parser.expansion((lexer) => invoke(lexer, token, definition.begin));
      const active: OpenEnvironment = { name, end: definition.end, args };
      opened.push(active);
      const body = parser.sequence(depth + 1, [endCustom, "\\end"]);
      if (!active.closed || parser.peek().value !== endCustom) {
        fail("environment-mismatch", "Expected the matching end of the custom environment.", parser.peek().range);
      }
      parser.take();
      return body;
    },
    macro(lexer, token) {
      if (token.value === "\\end" && opened.length) {
        const active = opened[opened.length - 1];
        const name = braced(lexer, "Expected a braced environment name.").join("").trim();
        if (!environmentName.test(name)) fail("macro-syntax", "Invalid environment name.", token.range);
        if (name !== active.name) {
          lexer.insert(`{${name}}`, token.range);
          return false;
        }
        active.closed = true;
        opened.pop();
        lexer.insert(endCustom, token.range);
        lexer.expand(joinTokens(lexer, substitute(active.end, active.args), token.range), token.range);
        return true;
      }
      if (!declarations.has(token.value)) return expand(lexer, token);
      lexer.expand("", token.range);
      const globalPrefix = token.value === "\\global";
      const declaration = globalPrefix ? lexer.read() : token;
      const operation = declaration.value;
      if (globalPrefix && !definitions.has(operation) && operation !== "\\let") {
        fail("macro-syntax", "Expected a definition or alias after the global prefix.", declaration.range);
      }
      if (environmentDeclarations.has(operation)) {
        const star = lexer.read();
        if (star.value !== "*") lexer.unread(star);
        const name = braced(lexer, "Expected a braced environment name.").join("").trim();
        if (!environmentName.test(name)) fail("macro-syntax", "Invalid environment name.", token.range);
        const { count, defaultValue } = readArity(lexer, token.range);
        const begin = compile(braced(lexer, "Expected a braced environment opening."), token.range, count);
        const end = compile(braced(lexer, "Expected a braced environment closing."), token.range, count);
        const existing = findEnvironment(name);
        if (operation === "\\provideenvironment" && existing) return true;
        if (operation === "\\newenvironment" && existing) fail("macro-conflict", "This environment is already defined.", token.range);
        if (operation === "\\renewenvironment" && !existing) fail("macro-conflict", "Cannot renew an undefined environment.", token.range);
        (environmentScopes[environmentScopes.length - 1] ??= new Map()).set(name, {
          begin: { template: begin, ...(defaultValue && { defaultValue }) }, end,
        });
        return true;
      }
      if (operation === "\\let") {
        const name = lexer.read();
        if (!commandWord.test(name.value)) fail("macro-syntax", "Expected a letter-only macro name.", name.range);
        let target = lexer.read();
        if (target.value === "=") target = lexer.read();
        const existing = lookup(target.value);
        if (!target.value || (target.value[0] === "\\" && !existing && !knownName(target.value))) {
          fail("macro-argument", "Expected a token or a defined command after the alias.", target.range);
        }
        set(name, existing ?? { template: { parts: [target.value], count: 0 } }, globalPrefix);
        return true;
      }
      const { name, definition, tokens, count } = define(lexer, declaration);
      const existing = lookup(name.value);
      const reserved = protectedName(name.value);
      if (operation === "\\providecommand" && (reserved || existing)) return true;
      if (operation === "\\newcommand" && existing) {
        fail("macro-conflict", "This macro name is already defined.", name.range);
      }
      if (operation === "\\renewcommand" && !existing && !knownName(name.value)) {
        fail("macro-conflict", "Cannot renew an undefined macro.", name.range);
      }
      const expanded = operation === "\\edef" || operation === "\\xdef" ? eager(lexer, tokens, name.range) : tokens;
      definition.template = compile(expanded, name.range, count);
      set(name, definition, globalPrefix || operation === "\\gdef" || operation === "\\xdef");
      return true;
    },
  };
}
