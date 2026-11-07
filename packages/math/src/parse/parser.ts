import { checkAbort, fail } from "../model/limits.js";
import type { Limits, MathNode, Range, Row } from "../model/types.js";
import { Lexer } from "./lexer.js";
import type { Token } from "./lexer.js";
import { delimiter, space, symbol } from "./symbols.js";

export interface Extensions {
  readonly macro?: (lexer: Lexer, token: Token) => boolean;
  readonly scope?: (enter: boolean) => void;
  readonly environment?: (parser: Parser, token: Token, depth: number) => MathNode;
}

const digit = /^[0-9]$/;
const letter = /^\p{L}$/u;
const mark = /^\p{M}$/u;
const operator = /^[\p{S}\p{P}]$/u;
const fixed = new Set(["frac", "sqrt", "text", "left", "right", "begin", "end"]);

export function isBuiltin(command: string): boolean {
  return fixed.has(command) || symbol(command) !== undefined || space(command) !== undefined;
}

export class Parser {
  #lookahead: Token | undefined;
  #nodes = 0;
  readonly #lexer: Lexer;

  constructor(source: string, readonly limits: Limits, readonly signal?: AbortSignal, readonly extensions?: Extensions) {
    this.#lexer = new Lexer(source, limits);
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

  rawGroup(depth: number): string {
    const open = this.expect("{", "Expected a braced argument.");
    this.depth(depth, open.range);
    return this.#lexer.rawGroup(open, depth);
  }

  sequence(depth: number, stops: readonly string[] = []): Row {
    const first = this.peek();
    this.depth(depth, first.range);
    const children: MathNode[] = [];
    for (let token = first; token.value && !stops.includes(token.value); token = this.peek()) {
      this.take();
      const base = digit.test(token.value) || (token.value === "." && digit.test(this.peek().value))
        ? this.#number(token)
        : this.#atom(token, depth);
      children.push(this.#scripts(base, depth));
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

  #argument(depth: number): MathNode {
    const token = this.take();
    this.depth(depth, token.range);
    return this.#atom(token, depth);
  }

  #scripts(base: MathNode, depth: number): MathNode {
    let sub: MathNode | undefined;
    let sup: MathNode | undefined;
    const first = this.peek();
    while (true) {
      const token = this.peek();
      if (token.value !== "_" && token.value !== "^" && token.value !== "'") break;
      this.take();
      if (token.value === "_") {
        if (sub) fail("duplicate-script", "Duplicate subscript.", token.range);
        sub = this.#argument(depth + 1);
      } else {
        if (sup) fail("duplicate-script", "Duplicate superscript.", token.range);
        if (token.value === "^") {
          sup = this.#argument(depth + 1);
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
      ? this.create({ kind: "script", base, ...(sub && { sub }), ...(sup && { sup }) }, first.range)
      : base;
  }

  #atom(token: Token, depth: number): MathNode {
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

  #command(token: Token, depth: number): MathNode {
    const { value, range } = token;
    const name = value.slice(1);
    switch (name) {
      case "frac":
        return this.create({
          kind: "fraction", top: this.#argument(depth + 1), bottom: this.#argument(depth + 1),
        }, range);
      case "sqrt": {
        let index: MathNode | undefined;
        if (this.peek().value === "[") {
          this.take();
          index = this.sequence(depth + 1, ["]"]);
          this.expect("]", "Expected a closing bracket after the root index.");
        }
        return this.create({ kind: "root", body: this.#argument(depth + 1), ...(index && { index }) }, range);
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
    return fail("unknown-command", "Unknown math command.", range);
  }

  #fence(): string {
    const token = this.take();
    return delimiter(token.value) ?? fail("syntax", "Expected a delimiter.", token.range);
  }
}
