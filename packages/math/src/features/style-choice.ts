import type { MathNode, Row } from "../model/types.js";

type Style = 0 | 1 | 2 | 3;

export function choose(node: MathNode, style: Style): MathNode {
  const script: Style = style >= 2 ? 3 : 2;
  const child = (item: MathNode, next: Style = style): MathNode => choose(item, next);
  switch (node.kind) {
    case "choice": return child(node.variants[style]);
    case "row": return { ...node, children: node.children.map((item) => child(item)) };
    case "style": {
      const next = node.level === 2 ? 3 : node.level === 1 ? 2 :
        node.display !== undefined ? node.display ? 0 : 1 : style;
      return { ...node, body: child(node.body, next) };
    }
    case "fraction": {
      const effective = node.display === undefined ? style : node.display ? 0 : Math.max(1, style);
      const next = Math.min(3, effective + 1) as Style;
      return { ...node, top: child(node.top, next), bottom: child(node.bottom, next) };
    }
    case "root": return { ...node, body: child(node.body), ...(node.index && { index: child(node.index, 3) }) };
    case "script": return { ...node, base: child(node.base),
      ...(node.sub && { sub: child(node.sub, script) }), ...(node.sup && { sup: child(node.sup, script) }) };
    case "prescript": return { ...node, base: child(node.base), sub: child(node.sub, script), sup: child(node.sup, script),
      ...(node.postSub && { postSub: child(node.postSub, script) }), ...(node.postSup && { postSup: child(node.postSup, script) }) };
    case "stack": return { ...node, base: child(node.base),
      ...(node.below && { below: child(node.below, node.accent ? style : script) }),
      ...(node.above && { above: child(node.above, node.accent ? style : script) }) };
    case "fence":
    case "padding":
    case "enclosure":
    case "phantom": return { ...node, body: child(node.body) };
    case "table": return { ...node, rows: node.rows.map((row) => row.map((item) => child(item, style || 1) as Row)) };
    case "equation": return { ...node, body: child(node.body) };
    default: return node;
  }
}
