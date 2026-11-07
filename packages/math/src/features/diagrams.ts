import { fail } from "../model/limits.js";
import type { MathNode, Row } from "../model/types.js";
import type { Token } from "../parse/lexer.js";
import type { Parser } from "../parse/parser.js";

const inference: Readonly<Record<string, number>> = {
  "\\UnaryInfC": 1, "\\BinaryInfC": 2, "\\TrinaryInfC": 3, "\\QuaternaryInfC": 4, "\\QuinaryInfC": 5,
  "\\UnaryInf": 1, "\\BinaryInf": 2, "\\TrinaryInf": 3, "\\QuaternaryInf": 4, "\\QuinaryInf": 5,
};

export function proof(parser: Parser, open: Token, depth: number): MathNode {
  const premises: { readonly node: MathNode; readonly height: number }[] = [];
  let left: MathNode | undefined;
  let right: MathNode | undefined;
  let bar = true;
  const create = <N extends MathNode>(node: N): N => parser.create(node, open.range);

  function argument(): Row {
    parser.expect("{", "Expected a braced proof expression.");
    parser.scope(true);
    const math = parser.peek().value === "$";
    if (math) parser.take();
    const body = parser.sequence(depth, [math ? "$" : "}"]);
    if (math) parser.expect("$", "Expected the closing math delimiter.");
    parser.expect("}", "Expected a closing proof argument.");
    parser.scope(false);
    return body;
  }

  while (parser.peek().value !== "\\end") {
    const token = parser.take();
    switch (token.value) {
      case "\\Axiom":
      case "\\AxiomC": premises.push({ node: argument(), height: 0 }); break;
      case "\\LeftLabel":
      case "\\LL": left = argument(); break;
      case "\\RightLabel":
      case "\\RL": right = argument(); break;
      case "\\noLine":
      case "\\alwaysNoLine": bar = false; break;
      case "\\singleLine":
      case "\\alwaysSingleLine": bar = true; break;
      default: {
        const arity = inference[token.value];
        if (!arity) fail("proof-syntax", "Expected a proof axiom, label, or inference.", token.range);
        if (premises.length < arity) fail("proof-premises", "An inference is missing premises.", token.range);
        const input = premises.splice(-arity);
        const height = 1 + Math.max(...input.map((premise) => premise.height));
        parser.depth(depth + height, token.range);
        const top: MathNode[] = [];
        for (const premise of input) {
          if (top.length) top.push(create({ kind: "space", width: 1 }));
          top.push(premise.node);
        }
        const rule = create({ kind: "fraction", top: create({ kind: "row", children: top }), bottom: argument(), ...(!bar && { bar: false }) });
        const node = left || right ? create({ kind: "row", children: [...(left ? [left] : []), rule, ...(right ? [right] : [])] }) : rule;
        premises.push({ node, height });
        left = undefined;
        right = undefined;
      }
    }
  }
  if (premises.length !== 1 || left || right) fail("proof-premises", "A proof tree must have one conclusion.", open.range);
  return premises[0].node;
}

const directions = { ">": "→", "<": "←", V: "↓", A: "↑", "=": "=", "|": "‖" } as const;
const stops = ["@", "\\\\", "\\cr", "\\end"];
const rowStops = ["\\\\", "\\cr"];

export function diagram(parser: Parser, open: Token, depth: number): MathNode {
  const rows: Row[][] = [];
  const create = <N extends MathNode>(node: N): N => parser.create(node, open.range);
  const cell = (...children: MathNode[]): Row => create({ kind: "row", children });
  let width = 0;
  for (;;) {
    const cells: Row[] = [];
    let previousVertical = false;
    for (;;) {
      const body = parser.sequence(depth, stops);
      if (body.children.length) {
        cells.push(body);
        previousVertical = false;
      }
      if (parser.peek().value !== "@") break;
      parser.take();
      const direction = parser.take();
      const value = direction.value as keyof typeof directions;
      const vertical = value === "V" || value === "A" || value === "|" || direction.value === ".";
      if (vertical && previousVertical && !body.children.length) cells.push(cell());
      previousVertical = vertical;
      if (direction.value === ".") {
        cells.push(cell());
        continue;
      }
      if (!Object.hasOwn(directions, value)) fail("diagram-syntax", "Expected a commutative diagram arrow.", direction.range);
      const base = create({ kind: "atom", role: "operator", value: directions[value], stretchy: true });
      if (value === "=" || value === "|") {
        cells.push(cell(base));
        continue;
      }
      const above = parser.sequence(depth + 1, [value, ...stops]);
      parser.expect(value, "Expected the second diagram arrow delimiter.");
      const below = parser.sequence(depth + 1, [value, ...stops]);
      parser.expect(value, "Expected the third diagram arrow delimiter.");
      if (vertical) cells.push(cell(above, base, below));
      else cells.push(cell(create({ kind: "stack", base,
        ...(above.children.length && { above }), ...(below.children.length && { below }),
        ...(!above.children.length && !below.children.length && { above }),
      })));
    }
    if (!parser.peek().value) fail("diagram-syntax", "Unclosed commutative diagram.", open.range);
    if (cells.length) {
      rows.push(cells);
      width = Math.max(width, cells.length);
    }
    if (!rowStops.includes(parser.peek().value)) break;
    parser.take();
  }
  if (!rows.length) return cell();
  for (const row of rows) while (row.length < width) row.push(cell());
  return create({ kind: "table", alignment: "center", rows });
}
