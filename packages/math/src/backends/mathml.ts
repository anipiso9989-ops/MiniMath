import { OutputBudget } from "../model/limits.js";
import type { Atom, MathNode, Row } from "../model/types.js";
import { escapeText } from "./markup.js";

export const mathNamespace = "http://www.w3.org/1998/Math/MathML";

export interface MathSink {
  open(tag: string, attribute?: string, value?: string): void;
  close(tag: string): void;
  text(value: string): void;
}

export function emitMathML(root: Row, display: boolean, sink: MathSink): void {
  if (display) sink.open("math", "display", "block");
  else sink.open("math");
  for (const node of root.children) emit(node, sink);
  sink.close("math");
}

export function serializeMathML(root: Row, display: boolean, budget: OutputBudget, mirror?: MathSink): string {
  let output = "";
  emitMathML(root, display, {
    open(tag, attribute, value) {
      const namespace = tag === "math" ? ` xmlns="${mathNamespace}"` : "";
      const attr = attribute ? ` ${attribute}="${value}"` : "";
      output += budget.add(`<${tag}${namespace}${attr}>`, true);
      mirror?.open(tag, attribute, value);
    },
    close(tag) {
      output += budget.add(`</${tag}>`, true);
      mirror?.close(tag);
    },
    text(value) {
      output += budget.add(escapeText(value));
      mirror?.text(value);
    },
  });
  return output;
}

function leaf(sink: MathSink, tag: string, value: string, attr?: string, attrValue?: string): void {
  sink.open(tag, attr, attrValue);
  sink.text(value);
  sink.close(tag);
}

function atom(node: Atom, sink: MathSink): void {
  switch (node.role) {
    case "number": return leaf(sink, "mn", node.value);
    case "identifier": return leaf(sink, "mi", node.value, node.upright ? "mathvariant" : undefined, "normal");
    case "function": return leaf(sink, "mi", node.value, "mathvariant", "normal");
    case "text": return leaf(sink, "mtext", node.value);
    case "large": return leaf(sink, "mo", node.value, "movablelimits", "true");
    case "integral": return leaf(sink, "mo", node.value);
    case "operator": return leaf(sink, "mo", node.value, "stretchy", "false");
  }
}

function emit(node: MathNode, sink: MathSink): void {
  switch (node.kind) {
    case "atom": return atom(node, sink);
    case "row":
      sink.open("mrow");
      for (const child of node.children) emit(child, sink);
      return sink.close("mrow");
    case "space":
      sink.open("mspace", "width", `${node.width}em`);
      return sink.close("mspace");
    case "fraction":
      if (node.display !== undefined) sink.open("mstyle", "displaystyle", String(node.display));
      if (node.bar === false) sink.open("mfrac", "linethickness", "0");
      else sink.open("mfrac");
      emit(node.top, sink);
      emit(node.bottom, sink);
      sink.close("mfrac");
      if (node.display !== undefined) sink.close("mstyle");
      return;
    case "root": {
      const tag = node.index ? "mroot" : "msqrt";
      sink.open(tag);
      emit(node.body, sink);
      if (node.index) emit(node.index, sink);
      return sink.close(tag);
    }
    case "script": {
      const limits = node.base.kind === "atom" && node.base.role === "large";
      const tag = limits
        ? node.sub && node.sup ? "munderover" : node.sub ? "munder" : "mover"
        : node.sub && node.sup ? "msubsup" : node.sub ? "msub" : "msup";
      sink.open(tag);
      emit(node.base, sink);
      if (node.sub) emit(node.sub, sink);
      if (node.sup) emit(node.sup, sink);
      return sink.close(tag);
    }
    case "fence":
      sink.open("mrow");
      if (node.left) leaf(sink, "mo", node.left, "stretchy", "true");
      emit(node.body, sink);
      if (node.right) leaf(sink, "mo", node.right, "stretchy", "true");
      return sink.close("mrow");
    case "table":
      sink.open("mtable");
      for (const row of node.rows) {
        sink.open("mtr");
        for (const [index, cell] of row.entries()) {
          if (node.alignment === "center") sink.open("mtd");
          else sink.open("mtd", "class", node.alignment === "left" || index % 2 ? "mini-math-left" : "mini-math-right");
          emit(cell, sink);
          sink.close("mtd");
        }
        sink.close("mtr");
      }
      return sink.close("mtable");
  }
}

export function readable(node: MathNode): string {
  switch (node.kind) {
    case "atom": return node.value;
    case "row": return node.children.map(readable).join(" ");
    case "space": return "";
    case "fraction": return node.bar === false
      ? `${readable(node.top)} choose ${readable(node.bottom)}`
      : `(${readable(node.top)}) / (${readable(node.bottom)})`;
    case "root": return node.index
      ? `root of order (${readable(node.index)}) of (${readable(node.body)})`
      : `square root of (${readable(node.body)})`;
    case "script": return readable(node.base) +
      (node.sub ? ` subscript (${readable(node.sub)})` : "") +
      (node.sup ? ` superscript (${readable(node.sup)})` : "");
    case "fence": return node.left + readable(node.body) + node.right;
    case "table": return (node.alignment === "center" ? "matrix" : "equations") + ": " +
      node.rows.map((row) => row.map(readable).join(", ")).join("; ");
  }
}
