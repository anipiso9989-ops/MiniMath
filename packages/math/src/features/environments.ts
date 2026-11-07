import { fail } from "../model/limits.js";
import type { EquationTag, MathNode, Range, Row, Table } from "../model/types.js";
import type { Token } from "../parse/lexer.js";
import type { Parser } from "../parse/parser.js";
import { diagram, proof } from "./diagrams.js";
import type { EquationExpression } from "./equations.js";

const matrices: Readonly<Record<string, readonly [string, string]>> = {
  matrix: ["", ""], pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"],
  vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], smallmatrix: ["", ""],
};
const aligned = new Set(["aligned", "align", "alignat", "alignedat", "flalign", "split"]);
const gathered = new Set(["gather", "gathered", "multline"]);
const numbered = new Set(["align", "alignat", "flalign", "gather", "multline"]);
const end = "\\end";
const rowBreaks = ["\\\\", "\\cr"];
const cellStops = ["&", ...rowBreaks, end];
const columnName = { l: "left", c: "center", r: "right" } as const;
type Column = (typeof columnName)[keyof typeof columnName];
type Rule = "solid" | "dashed";

function arraySpec(source: string, parser: Parser, origin: Range): {
  readonly columns: Column[];
  readonly rules: number[];
} {
  const columns: Column[] = [];
  const rules: number[] = [];
  let work = 0;

  function spend(): void {
    if (++work > parser.limits.maxInputBytes) fail("array-columns", "Array column expansion exceeds its limit.", origin);
  }

  function group(text: string, start: number): number {
    if (text[start] !== "{") fail("array-columns", "Expected a braced array repetition.", origin);
    let depth = 1;
    for (let i = start + 1; i < text.length; i++) {
      spend();
      if (text[i] === "{") depth++;
      if (text[i] === "}" && --depth === 0) return i;
    }
    return fail("array-columns", "Unclosed array repetition.", origin);
  }

  function append(text: string, depth: number): void {
    parser.depth(depth, origin);
    for (let i = 0; i < text.length; i++) {
      spend();
      const token = text[i];
      if (Object.hasOwn(columnName, token)) {
        if (columns.length >= parser.limits.maxNodes) fail("node-limit", "Maximum array column count exceeded.", origin);
        columns.push(columnName[token as keyof typeof columnName]);
      } else if (token === "|") {
        rules[columns.length] = Math.min(2, (rules[columns.length] ?? 0) + 1);
      } else if (token === "*") {
        const countEnd = group(text, i + 1);
        const count = text.slice(i + 2, countEnd);
        const bodyEnd = group(text, countEnd + 1);
        if (!/^\d{1,5}$/.test(count) || Number(count) > parser.limits.maxNodes) {
          fail("array-columns", "Invalid array repetition count.", origin);
        }
        const body = text.slice(countEnd + 2, bodyEnd);
        if (!body) fail("array-columns", "Array repetition needs a column specification.", origin);
        for (let n = 0; n < Number(count); n++) append(body, depth + 1);
        i = bodyEnd;
      } else {
        fail("array-columns", "Expected l, c, r, a rule, or a repeated column specification.", origin);
      }
    }
  }

  append(source.replace(/\s/g, ""), 0);
  if (!columns.length) fail("array-columns", "An array needs at least one column.", origin);
  return { columns, rules };
}

function close(parser: Parser, name: string, depth: number): void {
  const token = parser.expect(end, "Expected a closing environment command.");
  if (parser.rawGroup(depth + 1) !== name) fail("environment-mismatch", "Mismatched environment names.", token.range);
  parser.scope(false);
}

export function environment(
  equations: EquationExpression, custom: (parser: Parser, name: string, token: Token, depth: number) => Row | undefined,
  parser: Parser, token: Token, depth: number,
): MathNode {
  parser.scope(true);
  const name = parser.rawGroup(depth + 1);
  const replacement = custom(parser, name, token, depth);
  if (replacement) {
    parser.scope(false);
    return replacement;
  }
  const starred = name.endsWith("*");
  const family = starred ? name.slice(0, -1) : name;
  if (name === "CD" || name === "prooftree") {
    const body = (name === "CD" ? diagram : proof)(parser, token, depth + 1);
    close(parser, name, depth);
    return body;
  }
  if (family === "equation") {
    equations.structured();
    equations.open(!starred);
    const body = parser.sequence(depth + 1, [end]);
    close(parser, name, depth);
    const tag = equations.close(parser, token.range);
    return tag ? parser.create({ kind: "equation", body, tag }, token.range) : body;
  }

  const fences = Object.hasOwn(matrices, family) ? matrices[family] : undefined;
  const array = family === "array" || family === "darray";
  const cases = ["cases", "dcases", "rcases", "drcases"].includes(family);
  const align = aligned.has(family);
  const gather = gathered.has(family);
  if (!fences && !array && !cases && !align && !gather) {
    return fail("unknown-environment", "Unknown math environment.", token.range);
  }

  const spec = array ? arraySpec(parser.rawGroup(depth + 1, true), parser, token.range) : undefined;
  let matrixAlignment: Column = "center";
  if (fences && starred && parser.peek().value === "[") {
    parser.take();
    const column = parser.take();
    if (!Object.hasOwn(columnName, column.value)) fail("array-columns", "Expected a matrix column alignment.", column.range);
    matrixAlignment = columnName[column.value as keyof typeof columnName];
    parser.expect("]", "Expected the end of the alignment option.");
  }
  let declared = spec?.columns.length ?? (cases ? 2 : gather ? 1 : undefined);
  if (family === "alignat" || family === "alignedat") {
    const count = parser.rawGroup(depth + 1).trim();
    if (!/^[1-9]\d{0,3}$/.test(count) || Number(count) * 2 > parser.limits.maxNodes) {
      fail("table-shape", "Expected a positive alignment pair count.", token.range);
    }
    declared = Number(count) * 2;
  }
  const numberRows = numbered.has(family);
  const singleTag = family === "multline";
  if (numberRows) equations.structured();
  if (singleTag) equations.open(!starred);
  const rows: Row[][] = [];
  const tags: (EquationTag | undefined)[] = [];
  const lines: (Rule | undefined)[] = [];
  for (;;) {
    parser.scope(true);
    while (array && ["\\hline", "\\hdashline"].includes(parser.peek().value)) {
      lines[rows.length] = parser.take().value === "\\hline" ? "solid" : "dashed";
    }
    const first = parser.peek();
    if (!first.value) fail("syntax", "Unclosed math environment.", first.range);
    if (first.value === end && rows.length) {
      parser.scope(false);
      break;
    }
    if (numberRows && !singleTag) equations.open(!starred);
    const row: Row[] = [];
    for (;;) {
      row.push(parser.sequence(depth + 1, cellStops));
      parser.scope(false);
      if (parser.peek().value !== "&") break;
      parser.take();
      parser.scope(true);
    }
    if ((declared !== undefined && row.length > declared) ||
        (cases && row.length !== 2) ||
        (fences && rows.length && row.length !== rows[0].length)) {
      fail("table-shape", "The number of cells does not match the environment's columns.", first.range);
    }
    rows.push(row);
    if (numberRows && !singleTag) tags.push(equations.close(parser, first.range));
    if (!rowBreaks.includes(parser.peek().value)) break;
    parser.take();
  }
  close(parser, name, depth);
  if (singleTag) tags[rows.length - 1] = equations.close(parser, token.range);
  const width = declared ?? rows.reduce((max, row) => Math.max(max, row.length), 0);
  for (const row of rows) {
    while (row.length < width) row.push(parser.create({ kind: "row", children: [] }, token.range));
  }
  const table = parser.create<Table>({
    kind: "table", alignment: cases ? "left" : align ? "alternate" : matrixAlignment === "left" ? "left" : "center",
    rows, ...(spec && { columns: spec.columns, rules: spec.rules }),
    ...(matrixAlignment === "right" && { columns: Array<Column>(width).fill("right") }),
    ...(lines.length > 0 && { lines }), ...(tags.some(Boolean) && { tags }),
  }, token.range);
  let body: MathNode = table;
  if (fences && (fences[0] || fences[1])) {
    body = parser.create({ kind: "fence", left: fences[0], right: fences[1], body }, token.range);
  } else if (cases) {
    const right = family.endsWith("rcases");
    body = parser.create({ kind: "fence", left: right ? "" : "{", right: right ? "}" : "", body }, token.range);
  }
  if (family === "smallmatrix") return parser.create({ kind: "style", body, level: 1 }, token.range);
  if (family.startsWith("d") && (array || cases)) return parser.create({ kind: "style", body, display: true }, token.range);
  return body;
}
