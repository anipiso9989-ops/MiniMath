import { withMath } from "../engine.js";
import { layoutMath } from "../layout/boxes.js";
import type { Box, Metrics } from "../layout/boxes.js";
import { OutputBudget } from "../model/limits.js";
import type { MathArtifact, RenderOptions, Result } from "../model/types.js";
import type { Extensions } from "../parse/parser.js";
import { escapeAttribute, escapeText } from "./markup.js";
import { readable, serializeMathML } from "./mathml.js";

export type { Metrics } from "../layout/boxes.js";

export interface VisualArtifact extends MathArtifact {
  readonly svg: string;
  readonly metrics: Metrics;
}

const num = (value: number): number => Math.round(value * 1_000) / 1_000;

function serializeSVG(box: Box, description: string, budget: OutputBudget): string {
  const padding = 0.1;
  const width = num(Math.max(0, box.width) + padding * 2);
  const height = num(box.ascent + box.descent + padding * 2);
  let svg = budget.add(
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" width="${width}em" height="${height}em" viewBox="0 0 ${width} ${height}" fill="currentColor" font-family="STIX Two Math, Cambria Math, Latin Modern Math, serif"><title>`, true);
  svg += budget.add(escapeText(description || "Empty expression"));
  svg += budget.add("</title>", true);

  function draw(box: Box, x: number, y: number): void {
    if (box.target) svg += budget.add(`<a href="#${escapeAttribute(box.target)}">`);
    if (box.color) svg += budget.add(`<g color="${escapeAttribute(box.color)}">`);
    if (box.background && box.width > 0) {
      svg += budget.add(`<rect x="${num(x)}" y="${num(y - box.ascent)}" width="${num(box.width)}" height="${num(box.ascent + box.descent)}" fill="${escapeAttribute(box.background)}"/>`);
    }
    const paint = box.paint;
    if (paint?.kind === "glyph" && box.width) {
      const transform = paint.stretch === 1 ? "" : ` transform="translate(${num(x)} ${num(y)}) scale(1 ${num(paint.stretch)})"`;
      const italic = paint.italic ? ' font-style="italic"' : "";
      svg += budget.add(`<text x="${transform ? 0 : num(x)}" y="${transform ? 0 : num(y)}" font-size="${num(paint.size)}" textLength="${num(box.width)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve"${italic}${transform}>`, true);
      svg += budget.add(escapeText(paint.value));
      svg += budget.add("</text>", true);
    } else if (paint?.kind === "shape") {
      const attr = ` fill="none" stroke="currentColor" stroke-width="${num(paint.weight)}"`;
      svg += budget.add(paint.shape === "circle"
        ? `<ellipse cx="${num(x + paint.width / 2)}" cy="${num(y + paint.top + paint.height / 2)}" rx="${num(paint.width / 2)}" ry="${num(paint.height / 2)}"${attr}/>`
        : `<rect x="${num(x)}" y="${num(y + paint.top)}" width="${num(paint.width)}" height="${num(paint.height)}" rx="${num(Math.min(paint.height, paint.width) * 0.18)}"${attr}/>`, true);
    } else if (paint?.kind === "stroke") {
      const points = paint.points.map(([dx, dy]) => `${num(x + dx)},${num(y + dy)}`).join(" ");
      svg += budget.add(`<polyline points="${points}" fill="none" stroke="currentColor" stroke-width="${num(paint.weight)}" stroke-linejoin="round"/>`, true);
    }
    if (box.children) {
      for (const child of box.children) draw(child.box, x + child.x, y + child.y);
    }
    if (box.color) svg += budget.add("</g>", true);
    if (box.target) svg += budget.add("</a>", true);
  }

  draw(box, padding, padding + box.ascent);
  return svg + budget.add("</svg>", true);
}

export function visualMath(source: string, options: RenderOptions, extensions?: Extensions): Result<VisualArtifact> {
  return withMath(source, options, extensions, (root, limits) => {
    const budget = new OutputBudget(limits.maxOutputBytes);
    const display = options.display === true;
    const mathml = serializeMathML(root, display, budget);
    const text = budget.add(readable(root));
    const box = layoutMath(root, display);
    const svg = serializeSVG(box, text, budget);
    return { mathml, text, svg, metrics: { width: num(box.width), ascent: num(box.ascent), descent: num(box.descent) } };
  });
}

export function renderVisual(source: string, options: RenderOptions = {}): Result<VisualArtifact> {
  return visualMath(source, options);
}
