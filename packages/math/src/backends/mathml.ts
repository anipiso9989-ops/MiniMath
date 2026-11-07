import { OutputBudget } from "../model/limits.js";
import type { Atom, EquationTag, MathNode, Row, Table } from "../model/types.js";
import { escapeAttribute, escapeText } from "./markup.js";

export const mathNamespace = "http://www.w3.org/1998/Math/MathML";
export const htmlNamespace = "http://www.w3.org/1999/xhtml";

export interface MathSink {
  open(tag: string, attribute?: string, value?: string, other?: string, otherValue?: string): void;
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
    open(tag, attribute, value, other, otherValue) {
      const namespace = tag === "math" ? ` xmlns="${mathNamespace}"` : "";
      const attr = attribute ? ` ${attribute}="${escapeAttribute(value!)}"` : "";
      const extra = other ? ` ${other}="${escapeAttribute(otherValue!)}"` : "";
      output += budget.add(`<${tag}${namespace}${attr}${extra}>`);
      mirror?.open(tag, attribute, value, other, otherValue);
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

function atom(node: Atom, sink: MathSink, fixedLimits = false): void {
  switch (node.role) {
    case "number": return leaf(sink, "mn", node.value);
    case "identifier": return leaf(sink, "mi", node.value, node.upright ? "mathvariant" : undefined, "normal");
    case "function": return leaf(sink, "mi", node.value, "mathvariant", "normal");
    case "text": return leaf(sink, "mtext", node.value);
    case "large": return leaf(sink, "mo", node.value, "movablelimits", fixedLimits ? "false" : "true");
    case "integral": return leaf(sink, "mo", node.value);
    case "operator": return leaf(sink, "mo", node.value, "stretchy", node.stretchy ? "true" : "false");
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
      if (node.width < 0) {
        sink.open("mpadded", "width", `${node.width}em`);
        return sink.close("mpadded");
      }
      sink.open("mspace", "width", `${node.width}em`);
      return sink.close("mspace");
    case "fraction":
      if (node.display !== undefined) sink.open("mstyle", "displaystyle", String(node.display));
      if (node.bar === false) sink.open("mfrac", "linethickness", "0");
      else if (node.thickness !== undefined) sink.open("mfrac", "linethickness", `${node.thickness}em`);
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
      const base = node.base.kind === "prescript" ? node.base.base : node.base;
      const limits = node.limits ?? (base.kind === "atom" && base.role === "large");
      const tag = limits
        ? node.sub && node.sup ? "munderover" : node.sub ? "munder" : "mover"
        : node.sub && node.sup ? "msubsup" : node.sub ? "msub" : "msup";
      sink.open(tag);
      if (node.limits === true && node.base.kind === "atom") atom(node.base, sink, true);
      else emit(node.base, sink);
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
    case "choice": return emit(node.variants[1], sink);
    case "prescript": {
      const side = (script?: MathNode): void => {
        if (!script || (script.kind === "row" && script.children.length === 0)) {
          sink.open("none");
          sink.close("none");
        } else emit(script, sink);
      };
      sink.open("mmultiscripts");
      emit(node.base, sink);
      if (node.postSub || node.postSup) {
        side(node.postSub);
        side(node.postSup);
      }
      sink.open("mprescripts");
      sink.close("mprescripts");
      side(node.sub);
      side(node.sup);
      return sink.close("mmultiscripts");
    }
    case "stack": {
      const tag = node.below ? node.above ? "munderover" : "munder" : "mover";
      if (node.accent) sink.open(tag, node.above ? "accent" : "accentunder", "true");
      else sink.open(tag);
      emit(node.base, sink);
      if (node.below) emit(node.below, sink);
      if (node.above) emit(node.above, sink);
      return sink.close(tag);
    }
    case "style":
      if (node.color || node.background) {
        sink.open("mstyle", node.color ? "mathcolor" : undefined, node.color,
          node.background ? "mathbackground" : undefined, node.background);
      } else {
        sink.open("mstyle", "displaystyle", String(node.display === true), "scriptlevel", String(node.level ?? 0));
      }
      emit(node.body, sink);
      return sink.close("mstyle");
    case "enclosure":
      sink.open("menclose", "notation", node.notation);
      emit(node.body, sink);
      return sink.close("menclose");
    case "padding": {
      if (node.raise !== undefined) sink.open("mpadded", "voffset", `${node.raise}em`);
      else if (node.align) {
        const offset = node.align === "right" ? "-1width" : node.align === "center" ? "-0.5width" : undefined;
        sink.open("mpadded", "width", "0", offset ? "lspace" : undefined, offset);
      } else sink.open("mpadded", node.zeroHeight ? "height" : undefined, "0", node.zeroDepth ? "depth" : undefined, "0");
      emit(node.body, sink);
      return sink.close("mpadded");
    }
    case "rule":
      if (node.raise) sink.open("mpadded", "voffset", `${node.raise}em`);
      sink.open("mstyle", "mathbackground", "currentColor");
      sink.open("mspace", "width", `${node.width}em`, "height", `${node.height}em`);
      sink.close("mspace");
      sink.close("mstyle");
      if (node.raise) sink.close("mpadded");
      return;
    case "phantom":
      if (node.axis === "horizontal") sink.open("mpadded", "height", "0", "depth", "0");
      if (node.axis === "vertical") sink.open("mpadded", "width", "0");
      sink.open("mphantom");
      emit(node.body, sink);
      sink.close("mphantom");
      if (node.axis !== "both") sink.close("mpadded");
      return;
    case "reference":
      return leaf(sink, "mtext", node.parenthesized ? "(??)" : "??");
    case "link":
      sink.open("mtext");
      sink.open("a", "xmlns", htmlNamespace, "href", "#" + node.target);
      sink.text(node.value);
      sink.close("a");
      return sink.close("mtext");
    case "equation":
      sink.open("mtable", "class", "mini-math-numbered");
      sink.open("mtr", node.tag.id ? "id" : undefined, node.tag.id);
      sink.open("mtd");
      emit(node.body, sink);
      sink.close("mtd");
      tagCell(node.tag, sink);
      sink.close("mtr");
      return sink.close("mtable");
    case "table": return emitTable(node, sink);
  }
}

function tagCell(tag: EquationTag | undefined, sink: MathSink): void {
  sink.open("mtd", "class", "mini-math-tag");
  if (tag) {
    if (!tag.bare) leaf(sink, "mo", "(");
    emit(tag.value, sink);
    if (!tag.bare) leaf(sink, "mo", ")");
  }
  sink.close("mtd");
}

function emitTable(node: Table, sink: MathSink): void {
  const tagged = node.tags?.some(Boolean);
  if (tagged) sink.open("mtable", "class", "mini-math-numbered");
  else sink.open("mtable");
  for (const [r, row] of node.rows.entries()) {
    const label = node.tags?.[r];
    const line = node.lines?.[r];
    sink.open("mtr", label?.id ? "id" : undefined, label?.id, line ? "class" : undefined, line && `mini-math-line-${line}`);
    for (const [index, cell] of row.entries()) {
      const alignment = node.columns?.[index] ??
        (node.alignment === "alternate" ? index % 2 ? "left" : "right" : node.alignment);
      const classes = [
        alignment === "center" ? "" : `mini-math-${alignment}`,
        node.rules?.[index] ? node.rules[index] === 2 ? "mini-math-double-left" : "mini-math-rule-left" : "",
        index === row.length - 1 && node.rules?.[row.length] ? node.rules[row.length] === 2 ? "mini-math-double-right" : "mini-math-rule-right" : "",
        r === node.rows.length - 1 && node.lines?.[r + 1] ? `mini-math-last-${node.lines[r + 1]}` : "",
      ].filter(Boolean).join(" ");
      sink.open("mtd", classes ? "class" : undefined, classes);
      emit(cell, sink);
      sink.close("mtd");
    }
    if (tagged) tagCell(label, sink);
    sink.close("mtr");
  }
  sink.close("mtable");
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
    case "choice": return readable(node.variants[1]);
    case "prescript": return `prescript ${readable(node.sub)} ${readable(node.sup)} on ${readable(node.base)}` +
      (node.postSub ? ` subscript (${readable(node.postSub)})` : "") +
      (node.postSup ? ` superscript (${readable(node.postSup)})` : "");
    case "stack": return readable(node.base) +
      (node.below ? ` with ${readable(node.below)} below` : "") +
      (node.above ? ` with ${readable(node.above)} above` : "");
    case "style":
    case "enclosure":
    case "padding": return readable(node.body);
    case "rule":
    case "phantom": return "";
    case "reference": return node.parenthesized ? "(??)" : "??";
    case "link": return node.value;
    case "equation": return readable(node.body) + " " + readableTag(node.tag);
    case "fence": return node.left + readable(node.body) + node.right;
    case "table": return (node.alignment === "center" ? "matrix" : "equations") + ": " +
      node.rows.map((row, index) => row.map(readable).join(", ") +
        (node.tags?.[index] ? " " + readableTag(node.tags[index]!) : "")).join("; ");
  }
}

function readableTag(tag: EquationTag): string {
  const text = readable(tag.value);
  return tag.bare ? text : `(${text})`;
}
