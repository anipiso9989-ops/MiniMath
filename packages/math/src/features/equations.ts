import { readable } from "../backends/mathml.js";
import { fail } from "../model/limits.js";
import type { EquationTag, MathNode, Range, Row } from "../model/types.js";
import { mapMath } from "../model/visit.js";
import type { Token } from "../parse/lexer.js";
import type { Parser } from "../parse/parser.js";
import { choose } from "./style-choice.js";

export type Numbering = "none" | "ams" | "all";

export interface NumberingOptions {
  readonly numbering?: Numbering;
  readonly startNumber?: number;
  readonly idPrefix?: string;
}

export interface EquationLabel {
  readonly label: string;
  readonly id: string;
  readonly text: string;
}

interface Mark {
  readonly automatic: boolean;
  suppressed?: true;
  explicit?: EquationTag;
  label?: { readonly name: string; readonly range: Range };
}

const labelPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const commands = new Set(["\\label", "\\ref", "\\eqref", "\\tag", "\\notag", "\\nonumber"]);

export function isEquationCommand(name: string): boolean {
  return commands.has(name);
}

export class EquationBook {
  readonly labels = new Map<string, EquationLabel>();
  readonly mode: Numbering;
  readonly #prefix: string;
  #next: number;

  constructor(options: NumberingOptions) {
    this.mode = options.numbering ?? "none";
    this.#prefix = options.idPrefix ?? "mini-eq-";
    this.#next = options.startNumber ?? 1;
    if (!["none", "ams", "all"].includes(this.mode)) throw new TypeError("Invalid equation numbering mode.");
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(this.#prefix)) throw new TypeError("Invalid equation ID prefix.");
    if (!Number.isSafeInteger(this.#next) || this.#next < 0) throw new RangeError("Invalid starting equation number.");
  }

  tag(mark: Mark, parser: Parser, range: Range): EquationTag | undefined {
    let tag = mark.explicit && { ...mark.explicit, value: choose(mark.explicit.value, 1) };
    if (!tag && mark.automatic && !mark.suppressed) {
      if (!Number.isSafeInteger(this.#next)) fail("number-limit", "The equation number exceeds the supported range.", range);
      tag = { value: parser.create({ kind: "atom", role: "number", value: String(this.#next++) }, range) };
    }
    if (!mark.label) return tag;
    const { name, range: location } = mark.label;
    if (!tag) fail("unlabeled-equation", "The label needs a numbered equation or an explicit tag.", location);
    if (this.labels.has(name)) fail("duplicate-label", "This equation label is already defined.", location);
    const id = this.#prefix + name;
    this.labels.set(name, { label: name, id, text: readable(tag.value) });
    return { ...tag, id };
  }

  resolve(root: Row): Row {
    return mapMath(root, (node) => {
      if (node.kind !== "reference") return node;
      const target = this.labels.get(node.label);
      if (!target) fail("unknown-reference", "The equation reference has no matching label.", node.range);
      const value = node.parenthesized ? `(${target.text})` : target.text;
      return { kind: "link", value, target: target.id };
    }) as Row;
  }
}

export class EquationExpression {
  readonly #rows: Mark[];
  #insideTag = false;
  #references = false;

  constructor(readonly book: EquationBook, readonly display: boolean) {
    this.#rows = [{ automatic: book.mode === "all" && display }];
  }

  get hasReferences(): boolean {
    return this.#references;
  }

  structured(): void {
    this.#rows[0].suppressed = true;
  }

  open(numbered: boolean): void {
    this.#rows.push({ automatic: numbered && this.book.mode !== "none" });
  }

  close(parser: Parser, range: Range): EquationTag | undefined {
    return this.book.tag(this.#rows.pop()!, parser, range);
  }

  finish(root: Row, parser: Parser): Row {
    const range = parser.peek().range;
    const tag = this.close(parser, range);
    return tag ? parser.create({ kind: "row", children: [parser.create({ kind: "equation", body: root, tag }, range)] }, range) : root;
  }

  command(parser: Parser, token: Token, depth: number): MathNode | null | undefined {
    if (!isEquationCommand(token.value)) return;
    if (this.#insideTag) fail("nested-tag", "Equation metadata cannot appear inside an equation tag.", token.range);
    const mark = this.#rows[this.#rows.length - 1];
    switch (token.value) {
      case "\\notag":
      case "\\nonumber":
        mark.suppressed = true;
        return null;
      case "\\tag": {
        if (mark.explicit) fail("duplicate-tag", "An equation can have only one tag.", token.range);
        const bare = parser.peek().value === "*";
        if (bare) parser.take();
        this.#insideTag = true;
        parser.expect("{", "Expected a braced equation tag.");
        parser.scope(true);
        const value = parser.sequence(depth + 1, ["}"]);
        parser.expect("}", "Expected a closing brace after the equation tag.");
        parser.scope(false);
        this.#insideTag = false;
        mark.explicit = { value, ...(bare && { bare: true }) };
        return null;
      }
    }
    const label = parser.rawGroup(depth + 1).trim();
    if (!labelPattern.test(label)) fail("invalid-label", "Expected a safe equation label.", token.range);
    if (token.value === "\\label") {
      if (mark.label) fail("duplicate-label", "An equation can have only one label.", token.range);
      mark.label = { name: label, range: token.range };
      return null;
    }
    this.#references = true;
    return parser.create({ kind: "reference", label, parenthesized: token.value === "\\eqref", range: token.range }, token.range);
  }
}
