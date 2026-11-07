import { fail } from "../model/limits.js";
import type { MathNode } from "../model/types.js";
import { mapMath } from "../model/visit.js";
import type { Token } from "../parse/lexer.js";
import type { Extensions, Parser } from "../parse/parser.js";

const chemistryArrows = {
  "<=>>": "⇌", "<<=>": "⇋", "<=>": "⇌", "<->": "↔", "-->": "→", "<--": "←", "->": "→", "<-": "←", "=>": "⇒",
} as const;

const commands = new Set([
  "ce", "pu", "qty", "quantity", "abs", "norm", "eval", "comm", "acomm", "anticommutator", "commutator",
  "poissonbracket", "bra", "ket", "braket", "ketbra", "matrixel", "expval", "expectationvalue", "mel",
  "dv", "derivative", "pdv", "partialderivative", "fdv", "functionalderivative", "dd", "differential",
  "vb", "vectorbold", "va", "vectorarrow", "vu", "vectorunit", "SI", "si", "num", "unit", "nicefrac",
]);

export function isScienceCommand(token: string): boolean {
  return commands.has(token.slice(1));
}

function build(parser: Parser, token: Token) {
  const create = <N extends MathNode>(node: N): N => parser.create(node, token.range);
  const text = (value: string): MathNode => create({ kind: "atom", role: "text", value });
  const op = (value: string, stretchy = false): MathNode =>
    create({ kind: "atom", role: "operator", value, ...(stretchy && { stretchy: true }) });
  const num = (value: string): MathNode => create({ kind: "atom", role: "number", value });
  const row = (children: readonly MathNode[]): MathNode => create({ kind: "row", children });
  const fence = (left: string, right: string, body: MathNode): MathNode => create({ kind: "fence", left, right, body });
  const gap = (): MathNode => create({ kind: "space", width: 0.167 });
  return { create, text, op, num, row, fence, gap };
}

function chemical(parser: Parser, token: Token, depth: number, source: string): MathNode {
  const { create, text, op, num, row, fence, gap } = build(parser, token);
  let i = 0;

  function take(pattern: RegExp): string | undefined {
    const value = pattern.exec(source.slice(i))?.[0];
    if (value) i += value.length;
    return value;
  }

  function label(): MathNode | undefined {
    if (source[i] !== "[") return;
    const begin = ++i;
    let level = 1;
    while (i < source.length) {
      const char = source[i++];
      if (char === "[") parser.depth(depth + ++level, token.range);
      if (char === "]" && --level === 0) return text(source.slice(begin, i - 1).trim());
    }
    return fail("chemistry-syntax", "Unclosed chemical arrow label.", token.range);
  }

  function sequence(nesting: number, stop = ""): MathNode {
    parser.depth(depth + nesting, token.range);
    const nodes: MathNode[] = [];
    let coefficient = true;
    while (i < source.length) {
      if (stop && source[i] === stop) {
        i++;
        return row(nodes);
      }
      if (take(/^\s+/)) continue;
      const arrow = take(/^(?:<=>>|<<=>|<=>|<->|-->|<--|->|<-|=>)/) as keyof typeof chemistryArrows | undefined;
      if (arrow) {
        const above = label();
        const below = label();
        const base = op(chemistryArrows[arrow], true);
        nodes.push(above || below ? create({ kind: "stack", base, ...(above && { above }), ...(below && { below }) }) : base);
        coefficient = true;
        continue;
      }
      if ("+·.".includes(source[i])) {
        const sign = source[i++];
        nodes.push(op(sign === "+" ? "+" : "⋅"));
        coefficient = true;
        continue;
      }
      if (coefficient) {
        const quantity = take(/^\d+(?:\.\d+)?(?:\/\d+)?/);
        if (quantity) {
          const [top, bottom] = quantity.split("/");
          nodes.push(bottom ? create({ kind: "fraction", top: num(top), bottom: num(bottom) }) : num(top), gap());
          coefficient = false;
          continue;
        }
      }
      coefficient = false;
      const phase = take(/^\((?:aq|s|l|g|cr)\)/);
      if (phase) {
        nodes.push(text(phase));
        continue;
      }
      let base: MathNode;
      const char = source[i];
      if ("([{".includes(char)) {
        i++;
        const close = char === "(" ? ")" : char === "[" ? "]" : "}";
        const group = sequence(nesting + 1, close);
        base = char === "{" ? group : fence(char, close, group);
      } else {
        const element = take(/^(?:[A-Z][a-z]{0,2}|e(?=[+\-^\s]|$))/);
        if (!element) {
          const bond = take(/^[=~#-]/);
          if (!bond) fail("chemistry-syntax", "Expected an element, bond, reaction arrow, or group.", token.range);
          nodes.push(op(bond === "-" ? "−" : bond === "#" ? "≡" : bond));
          continue;
        }
        base = create({ kind: "atom", role: "identifier", value: element, upright: true });
      }

      const count = take(/^\d+/);
      const sub = count ? num(count) : undefined;
      let sup: MathNode | undefined;
      if (source[i] === "^") {
        i++;
        const charge = take(/^(?:\{[A-Za-z0-9+−-]+\}|\d*[+−-]|[IVX]+|\d+)/);
        if (!charge) fail("chemistry-syntax", "Expected a chemical charge or oxidation state.", token.range);
        sup = text(charge.replace(/[{}]/g, "").replace(/-/g, "−"));
      } else if ((source[i] === "+" || source[i] === "-") && /^(?:\s*(?:[+<)]|->|$))/.test(source.slice(i + 1))) {
        sup = op(source[i++] === "-" ? "−" : "+");
      }
      nodes.push(sub || sup ? create({ kind: "script", base, ...(sub && { sub }), ...(sup && { sup }) }) : base);
    }
    if (stop) fail("chemistry-syntax", "Unclosed chemical group.", token.range);
    return row(nodes);
  }

  return sequence(0);
}

function units(parser: Parser, token: Token, source: string): MathNode {
  const { create, num, text, op, row, gap } = build(parser, token);
  const nodes: MathNode[] = [];
  const value = source.trim();
  const quantity = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))(?:[eE]([+-]?\d+))?/.exec(value);
  if (quantity) {
    nodes.push(num(quantity[1].replace(/-/g, "−")));
    if (quantity[2]) nodes.push(op("×"), create({ kind: "script", base: num("10"), sup: num(quantity[2].replace(/-/g, "−")) }));
  }
  const rest = value.slice(quantity?.[0].length ?? 0).trim();
  if (rest && nodes.length) nodes.push(gap());
  let position = 0;
  for (const part of rest.matchAll(/\s+|[*/·⋅]|([\p{L}%°Ωµ]+)(?:\^?\{?([+−-]?\d+)\}?)?/gu)) {
    if (part.index !== position) fail("unit-syntax", "Unsupported physical unit syntax.", token.range);
    position += part[0].length;
    if (!part[1]) nodes.push(part[0].trim() ? op(part[0] === "*" ? "⋅" : part[0]) : gap());
    else {
      const base = text(part[1]);
      nodes.push(part[2] ? create({ kind: "script", base, sup: num(part[2].replace(/-/g, "−")) }) : base);
    }
  }
  if (position !== rest.length) fail("unit-syntax", "Unsupported physical unit syntax.", token.range);
  return row(nodes);
}

export const scienceCommand: NonNullable<Extensions["command"]> = (parser, token, depth) => {
  const name = token.value.slice(1);
  if (!commands.has(name)) return;
  const d = depth + 1;
  const { create, op, num, row, fence, gap } = build(parser, token);
  const argument = (): MathNode => parser.argument(d);
  const upright = (node: MathNode): MathNode =>
    mapMath(node, (item) => item.kind === "atom" && item.role === "identifier" ? { ...item, upright: true } : item);

  switch (name) {
    case "ce": return chemical(parser, token, d, parser.sourceGroup(d));
    case "pu":
    case "num":
    case "si":
    case "unit": return units(parser, token, parser.sourceGroup(d));
    case "SI": return row([units(parser, token, parser.sourceGroup(d)), gap(), units(parser, token, parser.sourceGroup(d))]);
    case "qty":
    case "quantity": {
      const next = parser.peek().value;
      if (next === "(" || next === "[" || next === "|") {
        parser.take();
        const close = next === "(" ? ")" : next === "[" ? "]" : "|";
        const body = parser.sequence(d, [close]);
        parser.expect(close, "Expected a closing quantity delimiter.");
        return fence(next, close, body);
      }
      const body = argument();
      return parser.peek().value === "{" ? row([body, gap(), upright(argument())]) : fence("{", "}", body);
    }
    case "abs": return fence("|", "|", argument());
    case "norm": return fence("‖", "‖", argument());
    case "eval": return fence("", "|", argument());
    case "comm":
    case "commutator":
    case "acomm":
    case "anticommutator":
    case "poissonbracket": {
      const square = name === "comm" || name === "commutator";
      return fence(square ? "[" : "{", square ? "]" : "}", row([argument(), op(","), argument()]));
    }
    case "bra": return fence("⟨", "|", argument());
    case "ket": return fence("|", "⟩", argument());
    case "braket": return fence("⟨", "⟩", row([argument(), op("|", true), argument()]));
    case "ketbra": return row([fence("|", "⟩", argument()), fence("⟨", "|", argument())]);
    case "matrixel":
    case "mel": return fence("⟨", "⟩", row([argument(), op("|", true), argument(), op("|", true), argument()]));
    case "expval":
    case "expectationvalue": return fence("⟨", "⟩", argument());
    case "va":
    case "vectorarrow":
    case "vu":
    case "vectorunit": return create({
      kind: "stack", base: argument(), above: op(name === "vu" || name === "vectorunit" ? "^" : "→"), accent: true,
    });
    case "vb":
    case "vectorbold":
      return mapMath(argument(), (item) => {
        if (item.kind !== "atom" || item.role !== "identifier") return item;
        const value = item.value.replace(/[A-Za-z]/g, (char) =>
          String.fromCodePoint(char <= "Z" ? 0x1d400 + char.charCodeAt(0) - 65 : 0x1d41a + char.charCodeAt(0) - 97));
        return { ...item, value, upright: true };
      });
    case "nicefrac": return row([argument(), op("/"), argument()]);
  }

  const partial = name === "pdv" || name === "partialderivative";
  const functional = name === "fdv" || name === "functionalderivative";
  const differential = create({ kind: "atom", role: "identifier", value: partial ? "∂" : functional ? "δ" : "d", upright: true });
  const inline = parser.peek().value === "*";
  if (inline) parser.take();
  let order: MathNode | undefined;
  if (parser.peek().value === "[") {
    parser.take();
    order = parser.sequence(d, ["]"]);
    parser.expect("]", "Expected the end of the derivative order.");
  }
  const raised = (base: MathNode, sup: MathNode | undefined): MathNode =>
    sup ? create({ kind: "script", base, sup }) : base;
  if (name === "dd" || name === "differential") {
    return parser.peek().value === "{" ? row([gap(), raised(differential, order), argument()]) : row([gap(), raised(differential, order)]);
  }
  const first = argument();
  const withFunction = parser.peek().value === "{";
  const variable = withFunction ? argument() : first;
  const second = partial && parser.peek().value === "{" ? argument() : undefined;
  const top = row([raised(differential, second && !order ? num("2") : order), ...(withFunction ? [first] : [])]);
  const bottom = row([differential, raised(variable, order), ...(second ? [differential, second] : [])]);
  return inline ? row([top, op("/"), bottom]) : create({ kind: "fraction", top, bottom });
};
