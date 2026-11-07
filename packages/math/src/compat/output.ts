import { fail, OutputBudget } from "../model/limits.js";
import type { Limits, MathArtifact } from "../model/types.js";

export type RendererName = "native" | "katex" | "mathjax";

export interface CompatibleArtifact extends MathArtifact {
  readonly renderer: RendererName;
}

const namespace = "http://www.w3.org/1998/Math/MathML";
const elements = new Set(("math semantics annotation mrow mi mn mo mtext mspace ms mfrac msqrt mroot " +
  "mstyle mpadded mphantom mfenced menclose msub msup msubsup munder mover munderover mmultiscripts " +
  "mprescripts none mtable mtr mlabeledtr mtd maction maligngroup malignmark mstack mlongdiv msgroup " +
  "msrow mscarries mscarry msline").split(" "));
const blocked = /^(?:on|style$|href$|src$|altimg$|id$|class$)/i;
const tag = /<(\/?)([a-z][a-z0-9-]*)((?:\s+[a-z][\w:.-]*\s*=\s*"[^"<]*")*)\s*(\/?)>/g;
interface Frame {
  readonly name: string;
  readonly alignment: readonly string[] | undefined;
  column: number;
}

const attribute = /\s+([a-z][\w:.-]*)\s*=\s*"([^"<]*)"/g;

export function checkedMathML(
  source: string, rendered: string, renderer: Exclude<RendererName, "native">, limits: Limits,
): CompatibleArtifact {
  const start = rendered.indexOf("<math ");
  const end = rendered.lastIndexOf("</math>") + 7;
  if (start < 0 || end <= start) fail("compat-output", "The compatibility renderer did not emit MathML.");
  const markup = rendered.slice(start, end);
  const budget = new OutputBudget(limits.maxOutputBytes);
  const stack: Frame[] = [];
  let output = "";
  let nodes = 0;
  let position = 0;

  for (const match of markup.matchAll(tag)) {
    const [, closing, name, attributes, selfClosing] = match;
    const text = markup.slice(position, match.index);
    if (text.includes("<") || (stack.length === 0 && (text || nodes > 0))) {
      fail("compat-output", "Unexpected content outside the MathML tree.");
    }
    output += budget.add(text);
    position = match.index + match[0].length;
    if (closing) {
      if (stack.pop()?.name !== name || attributes || selfClosing) fail("compat-output", "Invalid MathML closing tag.");
      output += budget.add(`</${name}>`, true);
      continue;
    }
    if (!elements.has(name) || (stack.length === 0) !== (name === "math")) {
      fail("compat-output", "The renderer emitted an unsupported MathML element.");
    }
    if (stack.length > limits.maxDepth) fail("depth-limit", "Maximum MathML depth exceeded.");
    if (++nodes > limits.maxNodes) fail("node-limit", "Maximum MathML node count exceeded.");
    let safe = name === "math" ? ` xmlns="${namespace}"` : "";
    let alignment: readonly string[] | undefined;
    for (const [, key, value] of attributes.matchAll(attribute)) {
      if (key === "columnalign" && /^(?:left|center|right)(?: (?:left|center|right))*$/.test(value)) {
        alignment = value.split(" ");
      }
      if (!blocked.test(key) && !/^xmlns/i.test(key) && (!key.includes(":") || key === "xml:space")) {
        safe += ` ${key}="${value}"`;
      }
    }
    const parent = stack.at(-1);
    if (name === "mtr" && !alignment) alignment = parent?.alignment;
    if (name === "mtd" && parent?.name === "mtr") {
      const columns = parent.alignment;
      const cell = alignment?.[0] ?? columns?.[Math.min(parent.column, columns.length - 1)];
      parent.column++;
      if (cell === "left" || cell === "right") safe += ` class="mini-math-${cell}"`;
    }
    if (!selfClosing) stack.push({ name, alignment, column: 0 });
    output += budget.add(`<${name}${safe}${selfClosing ? "/" : ""}>`);
  }
  if (stack.length || position !== markup.length || !nodes) {
    fail("compat-output", "The renderer emitted incomplete MathML.");
  }
  return { mathml: output, text: budget.add(source), renderer };
}
