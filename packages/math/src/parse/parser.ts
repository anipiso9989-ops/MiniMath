import { checkAbort, fail } from "../model/limits.js";
import type { Limits, MathNode, Range, Row } from "../model/types.js";
import { Lexer } from "./lexer.js";
import type { Token } from "./lexer.js";
import { blackboard, delimiter, space, symbol } from "./symbols.js";

export interface Extensions {
  readonly macro?: (lexer: Lexer, token: Token) => boolean;
  readonly scope?: (enter: boolean) => void;
  readonly environment?: (parser: Parser, token: Token, depth: number) => MathNode;
  readonly command?: (parser: Parser, token: Token, depth: number) => MathNode | null | undefined;
  readonly directive?: (parser: Parser, token: Token, depth: number) => Omit<Extract<MathNode, { kind: "style" }>, "kind" | "body"> | undefined;
  readonly infix?: (parser: Parser, token: Token, depth: number) =>
    { readonly bar?: false; readonly left?: string; readonly right?: string; readonly thickness?: number } | undefined;
  readonly finish?: (root: Row, parser: Parser) => Row;
}

const digit = /^[0-9]$/;
const letter = /^\p{L}$/u;
const mark = /^\p{M}$/u;
const operator = /^[\p{S}\p{P}]$/u;
const fixed = new Set(["frac", "dfrac", "tfrac", "binom", "dbinom", "tbinom", "mathbb", "sqrt", "text", "left", "right", "begin", "end"]);

export function isBuiltin(command: string): boolean {
  return fixed.has(command) || symbol(command) !== undefined || space(command) !== undefined;
}

export class Parser {
  #lookahead: Token | undefined;
  #nodes = 0;
  readonly #lexer: Lexer;

  constructor(
    source: string, readonly limits: Limits, readonly signal?: AbortSignal, readonly extensions?: Extensions,
    expansionBudget?: ConstructorParameters<typeof Lexer>[3],
  ) {
    this.#lexer = new Lexer(source, limits, undefined, expansionBudget);
  }

  peek(): Token {
    if (this.#lookahead) return this.#lookahead;
    for (;;) {
      const token = this.#lexer.read();
      if (token.value[0] !== "\\" || !this.extensions?.macro?.(this.#lexer, token)) return this.#lookahead = token;
      checkAbort(this.signal);
    }
  }

  take(): Token {
    const token = this.peek();
    this.#lookahead = undefined;
    return token;
  }

  expect(value: string, message: string): Token {
    const token = this.take();
    if (token.value !== value) fail("syntax", message, token.range);
    return token;
  }

  create<N extends MathNode>(node: N, range: Range): N {
    if (++this.#nodes > this.limits.maxNodes) fail("node-limit", "Maximum node count exceeded.", range);
    if ((this.#nodes & 63) === 0) checkAbort(this.signal);
    return node;
  }

  depth(depth: number, range: Range): void {
    if (depth > this.limits.maxDepth) fail("depth-limit", "Maximum nesting depth exceeded.", range);
  }

  scope(enter: boolean): void {
    this.extensions?.scope?.(enter);
  }

  get nodeCount(): number {
    return this.#nodes;
  }

  rawGroup(depth: number, preserveGroups = false): string {
    const open = this.expect("{", "Expected a braced argument.");
    this.depth(depth, open.range);
    return this.#lexer.rawGroup(open, depth, preserveGroups);
  }

  sourceGroup(depth: number): string {
    const open = this.expect("{", "Expected a braced argument.");
    this.depth(depth, open.range);
    return this.#lexer.rawGroup(open, depth, true, true);
  }

  expansion<T>(work: (lexer: Lexer) => T): T {
    if (this.#lookahead) throw new Error("Cannot insert an expansion after reading a lookahead token.");
    return work(this.#lexer);
  }

  verbatim(token: Token): string {
    return this.#lexer.verbatim(token.range);
  }

  sequence(depth: number, stops: readonly string[] = [], infixAllowed = true): Row {
    const first = this.peek();
    this.depth(depth, first.range);
    const children: MathNode[] = [];
    for (let token = first; token.value && !stops.includes(token.value); token = this.peek()) {
      this.take();
      const infix = token.value[0] === "\\" ? this.extensions?.infix?.(this, token, depth) : undefined;
      if (infix) {
        if (!infixAllowed) fail("syntax", "Only one infix fraction is allowed per group.", token.range);
        const top = this.create({ kind: "row", children }, first.range);
        const bottom = this.sequence(depth + 1, stops, false);
        const fraction = this.create<MathNode>({ kind: "fraction", top, bottom, ...(infix.bar === false && { bar: false }),
          ...(infix.thickness !== undefined && { thickness: infix.thickness }) }, token.range);
        const body = infix.left || infix.right ? this.create({ kind: "fence", left: infix.left ?? "", right: infix.right ?? "", body: fraction }, token.range) : fraction;
        return this.create({ kind: "row", children: [body] }, first.range);
      }
      const style = token.value[0] === "\\" ? this.extensions?.directive?.(this, token, depth) : undefined;
      if (style) {
        const body = this.sequence(depth + 1, stops, infixAllowed);
        children.push(this.create({ kind: "style", body, ...style }, token.range));
        break;
      }
      const base = digit.test(token.value) || (token.value === "." && digit.test(this.peek().value))
        ? this.#number(token)
        : this.#atom(token, depth);
      if (base) children.push(this.#scripts(base, depth));
    }
    return this.create({ kind: "row", children }, first.range);
  }

  #number(token: Token): MathNode {
    let value = token.value;
    let decimal = value === ".";
    for (let next = this.peek().value; digit.test(next) || (next === "." && !decimal); next = this.peek().value) {
      decimal ||= next === ".";
      value += this.take().value;
    }
    return this.create({ kind: "atom", role: "number", value }, token.range);
  }

  argument(depth: number): MathNode {
    const token = this.take();
    this.depth(depth, token.range);
    return this.#atom(token, depth) ?? fail("syntax", "Expected a math argument.", token.range);
  }

  #scripts(base: MathNode, depth: number): MathNode {
    let sub: MathNode | undefined;
    let sup: MathNode | undefined;
    const first = this.peek();
    let limits: boolean | undefined;
    if (this.extensions?.command && ["\\limits", "\\nolimits", "\\displaylimits"].includes(first.value)) {
      if (base.kind !== "atom" || !["large", "integral", "function"].includes(base.role)) {
        fail("syntax", "Limits require an operator.", first.range);
      }
      this.take();
      if (first.value !== "\\displaylimits") limits = first.value === "\\limits";
      else if (base.role !== "large") base = { ...base, role: "large" };
    }
    while (true) {
      const token = this.peek();
      if (token.value !== "_" && token.value !== "^" && token.value !== "'") break;
      this.take();
      if (token.value === "_") {
        if (sub) fail("duplicate-script", "Duplicate subscript.", token.range);
        sub = this.argument(depth + 1);
      } else {
        if (sup) fail("duplicate-script", "Duplicate superscript.", token.range);
        if (token.value === "^") {
          sup = this.argument(depth + 1);
        } else {
          this.depth(depth + 1, token.range);
          let value = "′";
          while (this.peek().value === "'") {
            this.take();
            value += "′";
          }
          sup = this.create({ kind: "atom", role: "operator", value }, token.range);
        }
      }
    }
    return sub || sup
      ? this.create({ kind: "script", base, ...(sub && { sub }), ...(sup && { sup }), ...(limits !== undefined && { limits }) }, first.range)
      : base;
  }

  #atom(token: Token, depth: number): MathNode | undefined {
    const { value, range } = token;
    if (value === "{") {
      this.scope(true);
      const row = this.sequence(depth + 1, ["}"]);
      this.expect("}", "Expected a closing brace.");
      this.scope(false);
      return row;
    }
    if (value[0] === "\\") return this.#command(token, depth);
    if (!value || "}_^&$#'".includes(value)) {
      return fail("syntax", value ? "Unexpected math token." : "Expected a math atom.", range);
    }
    if (digit.test(value)) return this.create({ kind: "atom", role: "number", value }, range);
    if (letter.test(value)) {
      let identifier = value;
      while (mark.test(this.peek().value)) identifier += this.take().value;
      return this.create({ kind: "atom", role: "identifier", value: identifier }, range);
    }
    if (operator.test(value)) {
      return this.create({ kind: "atom", role: "operator", value: value === "-" ? "−" : value }, range);
    }
    return fail("invalid-character", "Unsupported math character. Use a braced text command for prose.", range);
  }

  #command(token: Token, depth: number): MathNode | undefined {
    const { value, range } = token;
    const name = value.slice(1);
    switch (name) {
      case "frac":
      case "dfrac":
      case "tfrac":
      case "binom":
      case "dbinom":
      case "tbinom": {
        const binomial = name.endsWith("binom");
        const fraction = this.create<MathNode>({
          kind: "fraction", top: this.argument(depth + 1), bottom: this.argument(depth + 1),
          ...(binomial && { bar: false }), ...(name[0] === "d" && { display: true }),
          ...(name[0] === "t" && { display: false }),
        }, range);
        return binomial ? this.create({ kind: "fence", left: "(", right: ")", body: fraction }, range) : fraction;
      }
      case "mathbb":
        return blackboard(this.argument(depth + 1));
      case "sqrt": {
        let index: MathNode | undefined;
        if (this.peek().value === "[") {
          this.take();
          index = this.sequence(depth + 1, ["]"]);
          this.expect("]", "Expected a closing bracket after the root index.");
        }
        return this.create({ kind: "root", body: this.argument(depth + 1), ...(index && { index }) }, range);
      }
      case "text":
        return this.create({ kind: "atom", role: "text", value: this.rawGroup(depth + 1) }, range);
      case "left": {
        const left = this.#fence();
        const body = this.sequence(depth + 1, ["\\right"]);
        this.expect("\\right", "Expected a matching right delimiter command.");
        return this.create({ kind: "fence", left, right: this.#fence(), body }, range);
      }
      case "begin":
        if (this.extensions?.environment) return this.extensions.environment(this, token, depth);
        return fail("feature-required", "Environments are available from @mini/math/advanced.", range);
      case "right":
      case "end":
        return fail("syntax", "Unexpected closing command.", range);
    }
    const width = space(name);
    if (width !== undefined) return this.create({ kind: "space", width }, range);
    const resolved = symbol(name);
    if (resolved) return this.create({ kind: "atom", role: resolved[0], value: resolved[1] }, range);
    const extended = this.extensions?.command?.(this, token, depth);
    if (extended === undefined) fail("unknown-command", "Unknown math command.", range);
    return extended ?? undefined;
  }

  #fence(): string {
    const token = this.take();
    return delimiter(token.value) ?? fail("syntax", "Expected a delimiter.", token.range);
  }
}
