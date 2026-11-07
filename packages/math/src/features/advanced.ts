import { parseMath, renderMath } from "../engine.js";
import { fail } from "../model/limits.js";
import type { MathArtifact, MathNode, RenderOptions, Result, Row, Table } from "../model/types.js";
import type { Token } from "../parse/lexer.js";
import type { Extensions, Parser } from "../parse/parser.js";
import { macroExtensions } from "./macros.js";
import type { MacroDefinition } from "./macros.js";

export type { MacroDefinition } from "./macros.js";

export interface AdvancedOptions extends RenderOptions {
  readonly macros?: Readonly<Record<string, MacroDefinition>>;
}

const matrixFences: Readonly<Record<string, readonly [string, string]>> = {
  matrix: ["", ""], pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"],
  vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"],
};
const rowBreak = "\\\\";
const end = "\\end";
const cellStops = ["&", rowBreak, end];

function close(parser: Parser, name: string, depth: number): void {
  const token = parser.expect(end, "Expected a closing environment command.");
  if (parser.rawGroup(depth + 1) !== name) fail("environment-mismatch", "Mismatched environment names.", token.range);
}

function environment(parser: Parser, token: Token, depth: number): MathNode {
  parser.scope(true);
  const name = parser.rawGroup(depth + 1);
  if (name === "equation" || name === "equation*") {
    const body = parser.sequence(depth + 1, [end]);
    close(parser, name, depth);
    parser.scope(false);
    return body;
  }
  const fences = Object.hasOwn(matrixFences, name) ? matrixFences[name] : undefined;
  const alignment = name === "cases" ? "left" : name === "aligned" || name === "align" || name === "align*" ? "alternate" : undefined;
  if (!fences && !alignment) return fail("unknown-environment", "Unknown math environment.", token.range);

  const rows: Row[][] = [];
  const start = parser.peek();
  let cellStart = start;
  let cells: Row[] = [];
  do {
    if (!cellStart.value) fail("syntax", "Unclosed math environment.", cellStart.range);
    cells.push(parser.sequence(depth + 1, cellStops));
    const next = parser.peek();
    if (next.value === "&") {
      parser.take();
    } else {
      if (cells.length !== (alignment === "left" ? 2 : rows[0]?.length ?? cells.length)) {
        fail("table-shape", "Table rows must have the same number of columns. Cases require two columns.", cellStart.range);
      }
      rows.push(cells);
      cells = [];
      if (next.value !== rowBreak) break;
      parser.take();
    }
    cellStart = parser.peek();
  } while (cells.length || cellStart.value !== end);
  close(parser, name, depth);
  parser.scope(false);
  const table = parser.create<Table>({ kind: "table", alignment: alignment ?? "center", rows }, start.range);
  if (fences && (fences[0] || fences[1])) {
    return parser.create({ kind: "fence", left: fences[0], right: fences[1], body: table }, token.range);
  }
  if (alignment === "left") return parser.create({ kind: "fence", left: "{", right: "", body: table }, token.range);
  return table;
}

export function advancedExtensions(macros?: AdvancedOptions["macros"]): Extensions {
  return { environment, ...macroExtensions(macros) };
}

export function parseAdvanced(source: string, options: AdvancedOptions = {}): Result<Row> {
  return parseMath(source, options, advancedExtensions(options.macros));
}

export function renderAdvanced(source: string, options: AdvancedOptions = {}): Result<MathArtifact> {
  return renderMath(source, options, advancedExtensions(options.macros));
}
