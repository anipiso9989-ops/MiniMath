import type { MathNode, Row } from "./types.js";

export function mapMath(node: MathNode, transform: (node: MathNode) => MathNode): MathNode {
  const map = (child: MathNode): MathNode => mapMath(child, transform);
  switch (node.kind) {
    case "row": return transform({ ...node, children: node.children.map(map) });
    case "fence":
    case "style":
    case "enclosure":
    case "padding":
    case "phantom": return transform({ ...node, body: map(node.body) });
    case "root": return transform({ ...node, body: map(node.body), ...(node.index && { index: map(node.index) }) });
    case "fraction": return transform({ ...node, top: map(node.top), bottom: map(node.bottom) });
    case "choice": return transform({ ...node, variants: [
      map(node.variants[0]), map(node.variants[1]), map(node.variants[2]), map(node.variants[3]),
    ] });
    case "prescript": return transform({ ...node, base: map(node.base), sub: map(node.sub), sup: map(node.sup),
      ...(node.postSub && { postSub: map(node.postSub) }), ...(node.postSup && { postSup: map(node.postSup) }) });
    case "script": return transform({
      ...node, base: map(node.base), ...(node.sub && { sub: map(node.sub) }), ...(node.sup && { sup: map(node.sup) }),
    });
    case "stack": return transform({
      ...node, base: map(node.base), ...(node.below && { below: map(node.below) }), ...(node.above && { above: map(node.above) }),
    });
    case "table": return transform({
      ...node, rows: node.rows.map((row) => row.map((cell) => map(cell) as Row)),
      ...(node.tags && { tags: node.tags.map((tag) => tag && { ...tag, value: map(tag.value) }) }),
    });
    case "equation": return transform({ ...node, body: map(node.body), tag: { ...node.tag, value: map(node.tag.value) } });
    default: return transform(node);
  }
}
