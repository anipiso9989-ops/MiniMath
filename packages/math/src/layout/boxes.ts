import type { EquationTag, MathNode, Row, Table } from "../model/types.js";

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
  | { readonly kind: "shape"; readonly shape: "circle" | "roundedbox"; readonly width: number; readonly top: number; readonly height: number; readonly weight: number }
  | { readonly kind: "stroke"; readonly points: readonly (readonly [number, number])[]; readonly weight: number };

export interface Box extends Metrics {
  readonly children?: readonly Child[];
  readonly paint?: Paint;
  readonly color?: string;
  readonly background?: string;
  readonly target?: string;
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
  const tagged = node.tags?.some(Boolean);
  const cells = node.rows.map((row, index) => {
    const boxes = row.map((cell) => layout(cell, size, false));
    if (tagged) boxes.push(tagBox(node.tags?.[index], size));
    return boxes;
  });
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
  const top = -height / 2 - 0.25 * size;
  let y = top;
  for (const [r, row] of cells.entries()) {
    if (node.lines?.[r]) children.push({ x: 0, y, box: stroke([[0, 0], [width, 0]], 0.04 * size) });
    y += metrics[r].ascent;
    let x = 0;
    for (const [c, box] of row.entries()) {
      const extra = widths[c] - box.width;
      const alignment = tagged && c === row.length - 1 ? "right" :
        node.columns?.[c] ?? (node.alignment === "alternate" ? c % 2 ? "left" : "right" : node.alignment);
      const offset = alignment === "center" ? extra / 2 : alignment === "right" ? extra : 0;
      if (r === 0 && node.rules?.[c]) {
        children.push({ x: x - (c ? columnGap / 2 : 0), y: top, box: stroke([[0, 0], [0, height]], 0.04 * size) });
      }
      children.push({ x: x + offset, y, box });
      x += widths[c] + columnGap;
    }
    y += metrics[r].descent + rowGap;
  }
  if (node.rules?.[widths.length]) children.push({ x: width, y: top, box: stroke([[0, 0], [0, height]], 0.04 * size) });
  if (node.lines?.[cells.length]) children.push({ x: 0, y: top + height, box: stroke([[0, 0], [width, 0]], 0.04 * size) });
  return measured(width, children);
}

function tagBox(tag: EquationTag | undefined, size: number): Box {
  if (!tag) return gap(0);
  const value = layout(tag.value, size, false);
  return tag.bare ? value : row([glyph("(", size), value, glyph(")", size)]);
}

function layout(node: MathNode, size: number, display: boolean): Box {
  switch (node.kind) {
    case "atom": return glyph(node.value, display && (node.role === "large" || node.role === "integral") ? size * 1.22 : size, node.role === "identifier" && !node.upright);
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
      const fractionSize = (node.display ?? display) ? size : scriptSize(size);
      const top = layout(node.top, fractionSize, false);
      const bottom = layout(node.bottom, fractionSize, false);
      const width = Math.max(top.width, bottom.width) + 0.24 * size;
      const axis = -0.26 * size;
      const weight = (node.thickness ?? 0.055) * size;
      const separation = Math.max(0.15 * size, weight / 2 + 0.05 * size);
      return measured(width, [
        { x: (width - top.width) / 2, y: axis - separation - top.descent, box: top },
        ...(node.bar === false ? [] : [{ x: 0, y: axis, box: stroke([[0, 0], [width, 0]], weight) }]),
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
      const operator = node.base.kind === "prescript" ? node.base.base : node.base;
      const limits = node.limits ?? (display && operator.kind === "atom" && operator.role === "large");
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
    case "choice": return layout(node.variants[display ? 0 : 1], size, display);
    case "prescript": {
      const base = layout(node.base, size, display);
      const sub = layout(node.sub, scriptSize(size), false);
      const sup = layout(node.sup, scriptSize(size), false);
      const lead = Math.max(sub.width, sup.width);
      const children: Child[] = [
        { x: lead, y: 0, box: base },
        { x: lead - sup.width, y: -0.56 * size, box: sup },
        { x: lead - sub.width, y: 0.38 * size, box: sub },
      ];
      const right = lead + base.width;
      const postSub = node.postSub && layout(node.postSub, scriptSize(size), false);
      const postSup = node.postSup && layout(node.postSup, scriptSize(size), false);
      if (postSub) children.push({ x: right, y: 0.38 * size, box: postSub });
      if (postSup) children.push({ x: right, y: -0.56 * size, box: postSup });
      return measured(right + Math.max(postSub?.width ?? 0, postSup?.width ?? 0), children);
    }
    case "stack": {
      let base = layout(node.base, size, display);
      let above = node.above && layout(node.above, node.accent ? size : scriptSize(size), false);
      let below = node.below && layout(node.below, node.accent ? size : scriptSize(size), false);
      if (node.base.kind === "atom" && node.base.stretchy) {
        base = { ...base, width: Math.max(1.15 * size, (above?.width ?? 0) + 0.35 * size, (below?.width ?? 0) + 0.35 * size) };
      }
      if (above && node.above?.kind === "atom" && node.above.stretchy) above = { ...above, width: Math.max(above.width, base.width) };
      if (below && node.below?.kind === "atom" && node.below.stretchy) below = { ...below, width: Math.max(below.width, base.width) };
      const width = Math.max(base.width, above?.width ?? 0, below?.width ?? 0);
      const children: Child[] = [{ x: (width - base.width) / 2, y: 0, box: base }];
      if (above) children.push({ x: (width - above.width) / 2, y: -base.ascent - above.descent, box: above });
      if (below) children.push({ x: (width - below.width) / 2, y: base.descent + below.ascent, box: below });
      return measured(width, children);
    }
    case "style": {
      const scaled = node.level === 1 ? scriptSize(size) : node.level === 2 ? scriptSize(scriptSize(size)) : size;
      return { ...layout(node.body, scaled, node.display ?? display),
        ...(node.color && { color: node.color }), ...(node.background && { background: node.background }) };
    }
    case "padding": {
      const body = layout(node.body, size, display);
      const offset = node.align === "right" ? -body.width : node.align === "center" ? -body.width / 2 : 0;
      const raise = (node.raise ?? 0) * size;
      return { width: node.align ? 0 : body.width, ascent: node.zeroHeight ? 0 : Math.max(0, body.ascent + raise),
        descent: node.zeroDepth ? 0 : Math.max(0, body.descent - raise), children: [{ x: offset, y: -raise, box: body }] };
    }
    case "rule": {
      const height = node.height * size;
      const width = node.width * size;
      const raise = node.raise * size;
      const bar = stroke([[0, -height / 2], [width, -height / 2]], height);
      return { width, ascent: Math.max(0, height + raise), descent: Math.max(0, -raise), children: [{ x: 0, y: -raise, box: bar }] };
    }
    case "phantom": {
      const body = layout(node.body, size, display);
      return {
        width: node.axis === "vertical" ? 0 : body.width,
        ascent: node.axis === "horizontal" ? 0 : body.ascent,
        descent: node.axis === "horizontal" ? 0 : body.descent,
      };
    }
    case "enclosure": {
      const body = layout(node.body, size, display);
      const pad = 0.12 * size;
      const width = body.width + 2 * pad;
      const top = -body.ascent - pad;
      const bottom = body.descent + pad;
      const children: Child[] = [{ x: pad, y: 0, box: body }];
      const add = (points: readonly (readonly [number, number])[]): void => {
        children.push({ x: 0, y: 0, box: stroke(points, 0.045 * size) });
      };
      const shapes = new Set(node.notation.split(" "));
      if (shapes.has("box")) add([[0, top], [width, top], [width, bottom], [0, bottom], [0, top]]);
      for (const shape of ["circle", "roundedbox"] as const) {
        if (shapes.has(shape)) children.push({ x: 0, y: 0, box: { width: 0, ascent: 0, descent: 0,
          paint: { kind: "shape", shape, width, top, height: bottom - top, weight: 0.045 * size } } });
      }
      if (shapes.has("left") || shapes.has("actuarial") || shapes.has("longdiv")) add([[0, bottom], [0, top]]);
      if (shapes.has("right") || shapes.has("madruwb")) add([[width, top], [width, bottom]]);
      if (shapes.has("top") || shapes.has("actuarial") || shapes.has("longdiv") || shapes.has("radical")) add([[0, top], [width, top]]);
      if (shapes.has("bottom") || shapes.has("madruwb") || shapes.has("phasorangle")) add([[0, bottom], [width, bottom]]);
      if (shapes.has("horizontalstrike")) add([[0, (top + bottom) / 2], [width, (top + bottom) / 2]]);
      if (shapes.has("verticalstrike")) add([[width / 2, top], [width / 2, bottom]]);
      if (shapes.has("updiagonalstrike") || shapes.has("updiagonalarrow") || shapes.has("phasorangle")) add([[0, bottom], [width, top]]);
      if (shapes.has("downdiagonalstrike")) add([[0, top], [width, bottom]]);
      if (shapes.has("updiagonalarrow")) add([[width - pad, top], [width, top], [width, top + pad]]);
      return { width, ascent: -top, descent: bottom, children };
    }
    case "reference": return glyph(node.parenthesized ? "(??)" : "??", size);
    case "link": return { ...glyph(node.value, size), target: node.target };
    case "equation": return row([layout(node.body, size, display), gap(size), tagBox(node.tag, size)]);
    case "table": return table(node, size);
  }
}

export function layoutMath(node: Row, display: boolean): Box {
  return layout(node, 1, display);
}
