import { byteLength, fail } from "../model/limits.js";
import type { Range } from "../model/types.js";
import { Lexer } from "../parse/lexer.js";
import type { Token } from "../parse/lexer.js";
import { isBuiltin } from "../parse/parser.js";
import type { Extensions } from "../parse/parser.js";

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
const declarations = new Set(["\\newcommand", "\\renewcommand", "\\providecommand", "\\def", "\\gdef", "\\let"]);

function protectedName(name: string): boolean {
  return declarations.has(name) || isBuiltin(name.slice(1));
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

function substitute(
  lexer: Lexer, template: Template, args: readonly (readonly string[])[], origin: Range,
): void {
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

  for (const part of template.parts) {
    if (typeof part === "string") append(part);
    else for (const token of args[part - 1]) append(token);
  }
  lexer.expand(source, origin);
}

function configured(macros: Readonly<Record<string, MacroDefinition>>): Map<string, Definition> {
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

function define(lexer: Lexer, declaration: Token): {
  readonly name: Token;
  readonly definition: Definition;
} {
  const primitive = declaration.value === "\\def" || declaration.value === "\\gdef";
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
    const arity = optionalGroup(lexer)?.join("").trim();
    if (arity !== undefined) {
      if (!/^[0-9]$/.test(arity)) fail("macro-parameter", "Expected a macro argument count between zero and nine.", name.range);
      count = Number(arity);
      if (count > 0) defaultValue = optionalGroup(lexer);
    }
    open = lexer.read();
  }
  if (open.value !== "{") fail("macro-syntax", "Expected a braced macro replacement.", open.range);
  const template = compile(readGroup(lexer, open, "}"), name.range, count);
  return {
    name,
    definition: { template, ...(defaultValue && { defaultValue }), ...(parameters && { parameters }) },
  };
}

export function macroExtensions(macros?: Readonly<Record<string, MacroDefinition>>): Pick<Extensions, "macro" | "scope"> {
  const scopes: (Map<string, Definition> | undefined)[] = [macros && configured(macros)];
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

  return {
    scope(enter) {
      if (enter) scopes.push(undefined);
      else scopes.pop();
    },
    macro(lexer, token) {
      if (declarations.has(token.value)) {
        lexer.expand("", token.range);
        if (token.value === "\\let") {
          const name = lexer.read();
          if (!commandWord.test(name.value)) fail("macro-syntax", "Expected a letter-only macro name.", name.range);
          let target = lexer.read();
          if (target.value === "=") target = lexer.read();
          const existing = lookup(target.value);
          if (!target.value || (target.value[0] === "\\" && !existing && !protectedName(target.value))) {
            fail("macro-argument", "Expected a token or a defined command after the alias.", target.range);
          }
          set(name, existing ?? { template: { parts: [target.value], count: 0 } });
          return true;
        }
        const { name, definition } = define(lexer, token);
        const existing = lookup(name.value);
        const reserved = protectedName(name.value);
        if (token.value === "\\providecommand" && (reserved || existing)) return true;
        if (token.value === "\\newcommand" && existing) {
          fail("macro-conflict", "This macro name is already defined.", name.range);
        }
        if (token.value === "\\renewcommand" && !existing) {
          fail("macro-conflict", "Cannot renew an undefined macro.", name.range);
        }
        set(name, definition, token.value === "\\gdef");
        return true;
      }
      const definition = lookup(token.value);
      if (!definition) return false;
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
      substitute(lexer, template, args, token.range);
      return true;
    },
  };
}
