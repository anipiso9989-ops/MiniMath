import type { MathNode, Row, Table } from "../model/types.js";

export interface Metrics {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
}

interface Child {
  readonly x: number;
  readonly y: number;
  readonly box: Box;
}

type Paint =
  | { readonly kind: "glyph"; readonly value: string; readonly size: number; readonly italic: boolean; readonly stretch: number }
  | { readonly kind: "stroke"; readonly points: readonly (readonly [number, number])[]; readonly weight: number };

export interface Box extends Metrics {
  readonly children?: readonly Child[];
  readonly paint?: Paint;
}

const scriptSize = (size: number): number => Math.max(0.5, size * 0.72);
const relations = /^[=<>≤≥≠≈≡∈∉⊂⊆⊃⊇→←↔⇒⇐⇔∝]$/;
const binaries = /^[+−±∓×÷⋅∗∪∩∧∨]$/;
const narrow = /^[ilIjt.,:;!'′|]$/;
const wide = /^[mMwW∑∏∐⋃⋂]$/;
const mark = /^\p{M}$/u;

function glyph(value: string, size: number, italic = false, stretch = 1): Box {
  let advance = 0;
  for (const point of value) {
    if (mark.test(point)) continue;
    advance += point === " " || narrow.test(point) ? 0.31 : wide.test(point) ? 0.86 : 0.57;
  }
  return {
    width: advance * size, ascent: 0.78 * size * stretch, descent: 0.22 * size * stretch,
    paint: { kind: "glyph", value, size, italic, stretch },
  };
}

function row(boxes: readonly Box[]): Box {
  const children: Child[] = [];
  let width = 0;
  let ascent = 0;
  let descent = 0;
  for (const box of boxes) {
    children.push({ x: width, y: 0, box });
    width += box.width;
    ascent = Math.max(ascent, box.ascent);
    descent = Math.max(descent, box.descent);
  }
  return { width, ascent, descent, children };
}

function gap(width: number): Box {
  return { width, ascent: 0, descent: 0 };
}

function stroke(points: readonly (readonly [number, number])[], weight: number): Box {
  return { width: 0, ascent: 0, descent: 0, paint: { kind: "stroke", points, weight } };
}

function measured(width: number, children: readonly Child[]): Box {
  let ascent = 0;
  let descent = 0;
  for (const { y, box } of children) {
    ascent = Math.max(ascent, box.ascent - y);
    descent = Math.max(descent, box.descent + y);
  }
  return { width, ascent, descent, children };
}

function spaceAround(node: MathNode, previous: MathNode | undefined, next: MathNode | undefined): number {
  if (node.kind !== "atom" || node.role !== "operator" || !previous || !next) return 0;
  if (relations.test(node.value)) return 0.22;
  if (!binaries.test(node.value)) return 0;
  if (previous.kind === "atom" && previous.role === "operator" && !")]}|".includes(previous.value)) return 0;
  return 0.16;
}

function table(node: Table, size: number): Box {
  const cells = node.rows.map((row) => row.map((cell) => layout(cell, size, false)));
  const widths = cells[0].map((_, index) => cells.reduce((max, row) => Math.max(max, row[index].width), 0));
  const metrics = cells.map((row) => ({
    ascent: row.reduce((max, cell) => Math.max(max, cell.ascent), 0.78 * size),
    descent: row.reduce((max, cell) => Math.max(max, cell.descent), 0.22 * size),
  }));
  const columnGap = 0.55 * size;
  const rowGap = 0.32 * size;
  const width = widths.reduce((sum, width) => sum + width, 0) + columnGap * (widths.length - 1);
  const height = metrics.reduce((sum, row) => sum + row.ascent + row.descent, 0) + rowGap * (cells.length - 1);
  const children: Child[] = [];
  let y = -height / 2 - 0.25 * size;
  for (const [r, row] of cells.entries()) {
    y += metrics[r].ascent;
    let x = 0;
    for (const [c, box] of row.entries()) {
      const extra = widths[c] - box.width;
      const offset = node.alignment === "center" ? extra / 2 : node.alignment === "alternate" && c % 2 === 0 ? extra : 0;
      children.push({ x: x + offset, y, box });
      x += widths[c] + columnGap;
    }
    y += metrics[r].descent + rowGap;
  }
  return measured(width, children);
}

function layout(node: MathNode, size: number, display: boolean): Box {
  switch (node.kind) {
    case "atom": return glyph(node.value, display && (node.role === "large" || node.role === "integral") ? size * 1.22 : size, node.role === "identifier");
    case "space": return gap(node.width * size);
    case "row": {
      const boxes: Box[] = [];
      for (const [i, child] of node.children.entries()) {
        const spacing = spaceAround(child, node.children[i - 1], node.children[i + 1]);
        if (spacing) boxes.push(gap(spacing * size));
        boxes.push(layout(child, size, display));
        if (spacing) boxes.push(gap(spacing * size));
      }
      return row(boxes);
    }
    case "fraction": {
      const fractionSize = display ? size : scriptSize(size);
      const top = layout(node.top, fractionSize, false);
      const bottom = layout(node.bottom, fractionSize, false);
      const width = Math.max(top.width, bottom.width) + 0.24 * size;
      const axis = -0.26 * size;
      const separation = 0.15 * size;
      return measured(width, [
        { x: (width - top.width) / 2, y: axis - separation - top.descent, box: top },
        { x: 0, y: axis, box: stroke([[0, 0], [width, 0]], 0.055 * size) },
        { x: (width - bottom.width) / 2, y: axis + separation + bottom.ascent, box: bottom },
      ]);
    }
    case "root": {
      const body = layout(node.body, size, display);
      const index = node.index && layout(node.index, scriptSize(scriptSize(size)), false);
      const lead = index ? Math.max(0, index.width - 0.26 * size) : 0;
      const top = -Math.max(body.ascent, 0.65 * size) - 0.12 * size;
      const bottom = Math.max(body.descent, 0.1 * size);
      const prefix = 0.61 * size;
      const width = lead + prefix + body.width + 0.1 * size;
      const rule = stroke([[0, -0.12 * size], [0.14 * size, -0.2 * size], [0.32 * size, bottom], [prefix, top], [width - lead, top]], 0.055 * size);
      const children: Child[] = [
        { x: lead, y: 0, box: rule },
        { x: lead + prefix, y: 0, box: body },
      ];
      if (index) children.push({ x: 0, y: top + 0.36 * size, box: index });
      const box = measured(width, children);
      return { ...box, ascent: Math.max(box.ascent, -top), descent: Math.max(box.descent, bottom) };
    }
    case "script": {
      const base = layout(node.base, size, display);
      const sub = node.sub && layout(node.sub, scriptSize(size), false);
      const sup = node.sup && layout(node.sup, scriptSize(size), false);
      const limits = display && node.base.kind === "atom" && node.base.role === "large";
      const width = limits
        ? Math.max(base.width, sub?.width ?? 0, sup?.width ?? 0)
        : base.width + Math.max(sub?.width ?? 0, sup?.width ?? 0) + 0.07 * size;
      const children: Child[] = [{ x: limits ? (width - base.width) / 2 : 0, y: 0, box: base }];
      if (sup) {
        const up = limits ? base.ascent + sup.descent + 0.12 * size : Math.max(0.53 * size, base.ascent - 0.21 * size);
        children.push({ x: limits ? (width - sup.width) / 2 : base.width, y: -up, box: sup });
      }
      if (sub) {
        const down = limits ? base.descent + sub.ascent + 0.12 * size
          : Math.max(0.31 * size, base.descent + 0.12 * size, sub.ascent + 0.1 * size - (sup ? -children[1].y - sup.descent : 0.25 * size));
        children.push({ x: limits ? (width - sub.width) / 2 : base.width, y: down, box: sub });
      }
      return measured(width, children);
    }
    case "fence": {
      const body = layout(node.body, size, display);
      const stretch = Math.max(1, (body.ascent + body.descent) / size);
      const left = node.left ? glyph(node.left, size, false, stretch) : gap(0);
      const right = node.right ? glyph(node.right, size, false, stretch) : gap(0);
      const center = (body.descent - body.ascent) / 2;
      const y = stretch === 1 ? 0 : center + 0.28 * size * stretch;
      return measured(left.width + body.width + right.width, [
        { x: 0, y, box: left },
        { x: left.width, y: 0, box: body },
        { x: left.width + body.width, y, box: right },
      ]);
    }
    case "table": return table(node, size);
  }
}

export function layoutMath(node: Row, display: boolean): Box {
  return layout(node, 1, display);
}
