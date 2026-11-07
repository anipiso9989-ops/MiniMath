import { readable } from "../backends/mathml.js";
import { fail } from "../model/limits.js";
import type { Atom, MathNode, Row } from "../model/types.js";
import { mapMath } from "../model/visit.js";
import type { Token } from "../parse/lexer.js";
import { delimiter } from "../parse/symbols.js";
import type { Extensions, Parser } from "../parse/parser.js";

const arrows: Readonly<Record<string, string>> = {
  xrightarrow: "→", xleftarrow: "←", xleftrightarrow: "↔", xRightarrow: "⇒", xLeftarrow: "⇐",
  xLeftrightarrow: "⇔", xmapsto: "↦", xhookrightarrow: "↪", xhookleftarrow: "↩",
  xleftharpoonup: "↼", xleftharpoondown: "↽", xrightharpoonup: "⇀", xrightharpoondown: "⇁",
  xrightleftharpoons: "⇌", xleftrightharpoons: "⇋", xtwoheadrightarrow: "↠", xtwoheadleftarrow: "↞",
  xrightleftarrows: "⇄", xleftrightarrows: "⇆", xlongequal: "=",
};
const accents: Readonly<Record<string, string>> = {
  acute: "´", grave: "`", hat: "^", widehat: "^", check: "ˇ", widecheck: "ˇ", tilde: "~", widetilde: "~",
  breve: "˘", bar: "¯", overline: "¯", vec: "→", dot: "˙", ddot: "¨", dddot: "⃛", ddddot: "⃜",
  mathring: "˚", overbrace: "⏞", overgroup: "⏠", overbracket: "⎴", overleftarrow: "←",
  overrightarrow: "→", overleftrightarrow: "↔", overleftharpoon: "↼", overrightharpoon: "⇀",
  underline: "_", underbrace: "⏟", undergroup: "⏡", underbracket: "⎵", underleftarrow: "←",
  underrightarrow: "→", underleftrightarrow: "↔", utilde: "~",
};
const enclosures = {
  boxed: "box", fbox: "box", cancel: "updiagonalstrike", bcancel: "downdiagonalstrike",
  xcancel: "updiagonalstrike downdiagonalstrike",
} as const;
const phantoms = { phantom: "both", hphantom: "horizontal", vphantom: "vertical" } as const;
const styles = {
  displaystyle: { display: true, level: 0 }, textstyle: { display: false, level: 0 },
  scriptstyle: { display: false, level: 1 }, scriptscriptstyle: { display: false, level: 2 },
} as const;

interface Alphabet {
  readonly upper: number;
  readonly lower: number;
  readonly digits?: number;
  readonly greek?: number;
  readonly exceptions?: Readonly<Record<string, string>>;
}

const scriptExceptions = { B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ", e: "ℯ", g: "ℊ", o: "ℴ" };
const alphabets: Readonly<Record<string, Alphabet>> = {
  mathbf: { upper: 0x1d400, lower: 0x1d41a, digits: 0x1d7ce, greek: 0x1d6a8 },
  mathit: { upper: 0x1d434, lower: 0x1d44e, greek: 0x1d6e2, exceptions: { h: "ℎ" } },
  bm: { upper: 0x1d468, lower: 0x1d482, digits: 0x1d7ce, greek: 0x1d71c },
  boldsymbol: { upper: 0x1d468, lower: 0x1d482, digits: 0x1d7ce, greek: 0x1d71c },
  mathcal: { upper: 0x1d49c, lower: 0x1d4b6, exceptions: scriptExceptions },
  mathscr: { upper: 0x1d49c, lower: 0x1d4b6, exceptions: scriptExceptions },
  mathfrak: { upper: 0x1d504, lower: 0x1d51e, exceptions: { C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" } },
  mathsf: { upper: 0x1d5a0, lower: 0x1d5ba, digits: 0x1d7e2 },
  mathtt: { upper: 0x1d670, lower: 0x1d68a, digits: 0x1d7f6 },
};

const symbols: Readonly<Record<string, string>> = {
  lt: "<", gt: ">", colon: ":", gets: "←", iff: "⟺", implies: "⟹", impliedby: "⟸",
  longleftarrow: "⟵", longrightarrow: "⟶", longleftrightarrow: "⟷", Longleftarrow: "⟸",
  Longrightarrow: "⟹", Longleftrightarrow: "⟺", longmapsto: "⟼", hookleftarrow: "↩", hookrightarrow: "↪",
  uparrow: "↑", downarrow: "↓", updownarrow: "↕", Uparrow: "⇑", Downarrow: "⇓", Updownarrow: "⇕",
  nearrow: "↗", searrow: "↘", swarrow: "↙", nwarrow: "↖", rightleftharpoons: "⇌", leftrightharpoons: "⇋",
  leftharpoonup: "↼", leftharpoondown: "↽", rightharpoonup: "⇀", rightharpoondown: "⇁",
  twoheadleftarrow: "↞", twoheadrightarrow: "↠", leftleftarrows: "⇇", rightrightarrows: "⇉",
  leftrightarrows: "⇆", rightleftarrows: "⇄", rightsquigarrow: "⇝", leftrightsquigarrow: "↭",
  nleftarrow: "↚", nrightarrow: "↛", nleftrightarrow: "↮", nLeftarrow: "⇍", nRightarrow: "⇏",
  nLeftrightarrow: "⇎", leqslant: "⩽", geqslant: "⩾", ll: "≪", gg: "≫", lll: "⋘", ggg: "⋙",
  lesssim: "≲", gtrsim: "≳", lessapprox: "⪅", gtrapprox: "⪆", lessgtr: "≶", gtrless: "≷",
  prec: "≺", succ: "≻", preceq: "⪯", succeq: "⪰", nprec: "⊀", nsucc: "⊁",
  cong: "≅", asymp: "≍", doteq: "≐", models: "⊨", vdash: "⊢", dashv: "⊣", Vdash: "⊩", Vvdash: "⊪",
  nvdash: "⊬", nvDash: "⊭", nVdash: "⊮", nVDash: "⊯", parallel: "∥", nparallel: "∦", perp: "⊥",
  mid: "∣", nmid: "∤", shortmid: "∣", shortparallel: "∥", therefore: "∴", because: "∵",
  nsubseteq: "⊈", nsupseteq: "⊉", subsetneq: "⊊", supsetneq: "⊋", sqsubset: "⊏", sqsupset: "⊐",
  sqsubseteq: "⊑", sqsupseteq: "⊒", sqcup: "⊔", sqcap: "⊓", uplus: "⊎", smallsetminus: "∖",
  nsubset: "⊄", nsupset: "⊅", ni: "∋", owns: "∋", notni: "∌", nowns: "∌", nexists: "∄",
  complement: "∁", varnothing: "∅", top: "⊤", bot: "⊥", lnot: "¬", wedge: "∧", vee: "∨",
  doublecap: "⋒", doublecup: "⋓", Cup: "⋓", Cap: "⋒", star: "⋆", bullet: "∙", diamond: "⋄",
  oplus: "⊕", ominus: "⊖", otimes: "⊗", oslash: "⊘", odot: "⊙", circledast: "⊛",
  circledcirc: "⊚", circleddash: "⊝", boxplus: "⊞", boxminus: "⊟", boxtimes: "⊠", boxdot: "⊡",
  triangleleft: "◃", triangleright: "▹", lhd: "⊲", rhd: "⊳", unlhd: "⊴", unrhd: "⊵",
  triangle: "△", bigtriangleup: "△", bigtriangledown: "▽", blacktriangle: "▴", blacktriangledown: "▾",
  square: "□", Box: "□", blacksquare: "■", lozenge: "◊", blacklozenge: "⧫", checkmark: "✓",
  clubsuit: "♣", diamondsuit: "♢", heartsuit: "♡", spadesuit: "♠", flat: "♭", natural: "♮", sharp: "♯",
  angle: "∠", measuredangle: "∡", sphericalangle: "∢", backslash: "∖", setminus: "∖",
  dotsb: "⋯", dotsc: "…", dotsi: "⋯", dotsm: "⋯", dotso: "…", ldotp: ".", cdotp: "⋅", coloncolon: "∷",
  hbar: "ℏ", hslash: "ℏ", ell: "ℓ", wp: "℘", Re: "ℜ", Im: "ℑ", aleph: "ℵ", beth: "ℶ", gimel: "ℷ", daleth: "ℸ",
  imath: "ı", jmath: "ȷ", eth: "ð", mho: "℧", Finv: "Ⅎ", Game: "⅁", backprime: "‵",
};
const named = new Set(["arccot", "arcsec", "arccsc", "arg", "deg", "dim", "hom", "ker", "lg", "Pr", "coth", "sech", "csch"]);
const large = { bigvee: "⋁", bigwedge: "⋀", biguplus: "⨄", bigsqcup: "⨆", bigoplus: "⨁", bigotimes: "⨂", bigodot: "⨀" };
const integrals = { idotsint: "∫⋯∫", iiiint: "⨌", oiint: "∯", oiiint: "∰" };
const extras = new Set([
  "mathrm", "textnormal", "textrm", "textbf", "textit", "textsf", "texttt", "operatorname", "mathop",
  "overset", "underset", "stackrel", "substack", "textcolor", "color", "colorbox", "fcolorbox",
  "limits", "nolimits", "displaylimits", "hspace", "kern", "mkern", "hskip", "mskip", "verb", "not",
  "pmod", "pod", "bmod", "mod", "enspace", "enskip", "thinspace", "medspace", "thickspace",
  "negthinspace", "negmedspace", "negthickspace", "!", ">", "~",
  "char", "genfrac", "mathchoice", "prescript", "sideset", "cancelto", "enclose", "raisebox", "rule", "smash", "llap", "rlap", "clap", "mathllap", "mathrlap", "mathclap",
]);

const infixes = {
  "\\over": {}, "\\atop": { bar: false }, "\\choose": { bar: false, left: "(", right: ")" },
  "\\brace": { bar: false, left: "{", right: "}" }, "\\brack": { bar: false, left: "[", right: "]" },
} as const;

const delimiterInfixes = new Set(["\\overwithdelims", "\\atopwithdelims", "\\abovewithdelims"]);
const enclosureNames = new Set("box roundedbox circle left right top bottom horizontalstrike verticalstrike updiagonalstrike downdiagonalstrike updiagonalarrow longdiv radical actuarial madruwb phasorangle".split(" "));

export const notationInfix: NonNullable<Extensions["infix"]> = (parser, token, depth) => {
  const name = token.value;
  if (Object.hasOwn(infixes, name)) return infixes[name as keyof typeof infixes];
  const explicit = delimiterInfixes.has(name);
  if (!explicit && name !== "\\above") return;
  const fence = (): string => {
    const next = parser.take();
    return delimiter(next.value) ?? fail("syntax", "Expected an infix fraction delimiter.", next.range);
  };
  const sides = explicit ? { left: fence(), right: fence() } : {};
  if (name === "\\atopwithdelims") return { ...sides, bar: false };
  if (name === "\\overwithdelims") return sides;
  const thickness = length(parser, token, depth, false);
  if (thickness < 0) fail("invalid-length", "A fraction rule cannot have a negative thickness.", token.range);
  return thickness ? { ...sides, thickness } : { ...sides, bar: false };
};

export function isNotationCommand(token: string): boolean {
  const name = token.slice(1);
  return extras.has(name) || named.has(name) || Object.hasOwn(infixes, token) || delimiterInfixes.has(token) || token === "\\above" ||
    [arrows, accents, enclosures, phantoms, styles, alphabets, symbols, large, integrals].some((family) => Object.hasOwn(family, name));
}

function optional(parser: Parser, depth: number): MathNode | undefined {
  if (parser.peek().value !== "[") return;
  parser.take();
  const value = parser.sequence(depth, ["]"]);
  parser.expect("]", "Expected a closing bracket.");
  return value;
}

function alphabet(node: MathNode, data?: Alphabet): MathNode {
  return mapMath(node, (atom) => {
    if (atom.kind !== "atom" || (atom.role !== "identifier" && atom.role !== "number")) return atom;
    if (!data) return { ...atom, upright: true };
    const value = atom.value.replace(/[A-Za-z0-9Α-Ωα-ωϵϑϰϕϱϖ]/g, (char) => {
      const exception = data.exceptions?.[char];
      if (exception) return exception;
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(data.upper + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(data.lower + code - 97);
      if (code <= 57 && data.digits) return String.fromCodePoint(data.digits + code - 48);
      if (!data.greek) return char;
      if (code >= 0x391 && code <= 0x3a9 && code !== 0x3a2) return String.fromCodePoint(data.greek + code - 0x391);
      if (code >= 0x3b1 && code <= 0x3c9) return String.fromCodePoint(data.greek + 26 + code - 0x3b1);
      const variant = "ϵϑϰϕϱϖ".indexOf(char);
      return variant < 0 ? char : String.fromCodePoint(data.greek + 52 + variant);
    });
    return value === atom.value ? atom : { ...atom, value, upright: true };
  });
}

function operatorText(node: MathNode): string {
  if (node.kind === "atom") return node.value;
  if (node.kind === "row") return node.children.map(operatorText).join("");
  if (node.kind === "space") return " ";
  return readable(node);
}

function color(parser: Parser, depth: number, token: Token): string {
  const model = optional(parser, depth);
  const value = parser.rawGroup(depth).trim();
  if (!model) {
    if (/^(?:[A-Za-z]{1,32}|#[\da-fA-F]{3}|#[\da-fA-F]{6})$/.test(value)) return value;
  } else {
    const kind = operatorText(model);
    if (kind === "HTML" && /^[\da-fA-F]{6}$/.test(value)) return "#" + value;
    const components = value.split(",").map((component) => component.trim());
    if ((kind === "rgb" || kind === "RGB") && components.length === 3 && components.every((part) => /^\d{1,3}(?:\.\d{1,4})?$|^\.\d{1,4}$/.test(part))) {
      const max = kind === "rgb" ? 1 : 255;
      const values = components.map(Number);
      if (values.every((part) => part <= max)) return "#" + values.map((part) => Math.round(part * 255 / max).toString(16).padStart(2, "0")).join("");
    }
  }
  return fail("invalid-color", "Expected a named, hexadecimal, or RGB color.", token.range);
}

export const notationDirective: NonNullable<Extensions["directive"]> = (parser, token, depth) => {
  const name = token.value.slice(1);
  if (name === "color") return { color: color(parser, depth + 1, token) };
  if (Object.hasOwn(styles, name)) return styles[name as keyof typeof styles];
};

function length(parser: Parser, token: Token, depth: number, braced: boolean): number {
  let value = "";
  if (braced) {
    if (parser.peek().value === "*") parser.take();
    value = parser.rawGroup(depth);
  } else {
    while (/^[+\-.\d]$/.test(parser.peek().value)) value += parser.take().value;
    value += parser.take().value + parser.take().value;
  }
  return dimension(value, token);
}

function dimension(value: string, token: Token): number {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(em|ex|mu|pt|px|cm|mm|in|pc|bp)\s*$/.exec(value);
  if (!match) fail("invalid-length", "Expected a bounded TeX length.", token.range);
  const scales = { em: 1, ex: 0.43, mu: 1 / 18, pt: 1 / 12, px: 1 / 16, cm: 96 / 2.54 / 16, mm: 96 / 25.4 / 16, in: 6, pc: 1, bp: 1 / 12 };
  const em = Number(match[1]) * scales[match[2] as keyof typeof scales];
  if (!Number.isFinite(em) || Math.abs(em) > 64) fail("invalid-length", "The TeX length exceeds the supported range.", token.range);
  return Math.round(em * 1_000_000) / 1_000_000;
}

export const notationCommand: NonNullable<Extensions["command"]> = (parser, token, depth) => {
  const name = token.value.slice(1);
  const d = depth + 1;
  const create = <N extends MathNode>(node: N): N => parser.create(node, token.range);
  const argument = (): MathNode => parser.argument(d);
  const atom = (role: Atom["role"], value: string, stretchy = false): Atom =>
    create({ kind: "atom", role, value, ...(stretchy && { stretchy: true }) });
  if (Object.hasOwn(arrows, name)) {
    const below = optional(parser, d);
    return create({ kind: "stack", base: atom("operator", arrows[name], true), above: argument(), ...(below && { below }) });
  }
  if (Object.hasOwn(accents, name)) {
    const base = argument();
    const accent = atom("operator", accents[name], /^(?:wide|over|under|utilde)/.test(name));
    return create({ kind: "stack", base, accent: true, ...(name.startsWith("under") || name === "utilde" ? { below: accent } : { above: accent }) });
  }
  if (Object.hasOwn(enclosures, name)) return create({ kind: "enclosure", notation: enclosures[name as keyof typeof enclosures], body: argument() });
  if (Object.hasOwn(phantoms, name)) return create({ kind: "phantom", axis: phantoms[name as keyof typeof phantoms], body: argument() });
  if (Object.hasOwn(alphabets, name)) return alphabet(argument(), alphabets[name]);
  if (Object.hasOwn(symbols, name)) return atom("operator", symbols[name]);
  if (Object.hasOwn(large, name)) return atom("large", large[name as keyof typeof large]);
  if (Object.hasOwn(integrals, name)) return atom("integral", integrals[name as keyof typeof integrals]);
  if (named.has(name)) return atom("function", name);
  switch (name) {
    case "char": {
      let code: number;
      const prefix = parser.peek().value;
      if (prefix === "`") {
        parser.take();
        const next = parser.take();
        const literal = next.value.startsWith("\\") ? next.value.slice(1) : next.value;
        if (Array.from(literal).length !== 1) fail("invalid-character", "Expected a single character after the code marker.", next.range);
        code = literal.codePointAt(0)!;
      } else {
        const radix = prefix === '"' ? 16 : prefix === "'" ? 8 : 10;
        if (radix !== 10) parser.take();
        const digit = radix === 16 ? /^[0-9a-f]$/i : radix === 8 ? /^[0-7]$/ : /^[0-9]$/;
        let digits = "";
        while (digit.test(parser.peek().value)) digits += parser.take().value;
        code = Number.parseInt(digits, radix);
      }
      if (!Number.isInteger(code) || code > 0x10ffff || code < 0x20 ||
          (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff) {
        fail("invalid-character", "Expected a printable Unicode character code.", token.range);
      }
      const value = String.fromCodePoint(code);
      return atom(/^\p{L}$/u.test(value) ? "identifier" : /^[0-9]$/.test(value) ? "number" : "operator", value);
    }
    case "mathchoice": return create({ kind: "choice", variants: [argument(), argument(), argument(), argument()] });
    case "prescript": {
      const sup = argument();
      const sub = argument();
      return create({ kind: "prescript", base: argument(), sub, sup });
    }
    case "sideset": {
      const pair = (): { sub?: MathNode; sup?: MathNode } => {
        parser.expect("{", "Expected a braced side script.");
        parser.scope(true);
        const scripts: { sub?: MathNode; sup?: MathNode } = {};
        while (parser.peek().value !== "}") {
          const marker = parser.take();
          if (marker.value !== "_" && marker.value !== "^") fail("syntax", "Expected a side script.", marker.range);
          const key = marker.value === "_" ? "sub" : "sup";
          if (scripts[key]) fail("duplicate-script", "Duplicate side script.", marker.range);
          scripts[key] = parser.argument(d + 1);
        }
        parser.take();
        parser.scope(false);
        return scripts;
      };
      const first = pair();
      const last = pair();
      const blank = (): MathNode => create({ kind: "row", children: [] });
      return create({ kind: "prescript", base: argument(), sub: first.sub ?? blank(), sup: first.sup ?? blank(),
        ...(last.sub && { postSub: last.sub }), ...(last.sup && { postSup: last.sup }) });
    }
    case "cancelto": {
      const above = argument();
      const base = create({ kind: "enclosure", notation: "updiagonalarrow", body: argument() });
      return create({ kind: "stack", base, above });
    }
    case "enclose": {
      const values = parser.rawGroup(d).trim().split(/[,\s]+/);
      if (values.some((value) => !enclosureNames.has(value))) fail("syntax", "Unsupported enclosure shape.", token.range);
      return create({ kind: "enclosure", notation: [...new Set(values)].join(" "), body: argument() });
    }
    case "genfrac": {
      const readFence = (): string => {
        const raw = parser.sourceGroup(d).trim();
        if (!raw) return "";
        return delimiter(raw) ?? fail("syntax", "Expected a fraction delimiter.", token.range);
      };
      const left = readFence();
      const right = readFence();
      const width = parser.rawGroup(d).trim();
      const thickness = width ? dimension(width, token) : undefined;
      if (thickness !== undefined && thickness < 0) fail("invalid-length", "A fraction rule cannot have a negative thickness.", token.range);
      const style = parser.rawGroup(d).trim();
      if (style && !/^[0-3]$/.test(style)) fail("syntax", "Expected a fraction style from zero to three.", token.range);
      const fraction = create<MathNode>({
        kind: "fraction", top: argument(), bottom: argument(),
        ...(thickness === 0 ? { bar: false } : thickness === undefined ? {} : { thickness }),
        ...(style && { display: style === "0" }),
      });
      const body = left || right ? create<MathNode>({ kind: "fence", left, right, body: fraction }) : fraction;
      if (style === "2" || style === "3") return create({ kind: "style", body, level: style === "2" ? 1 : 2 });
      return body;
    }
    case "rule": {
      const optionalRaise = optional(parser, d);
      const raise = optionalRaise ? dimension(operatorText(optionalRaise), token) : 0;
      const width = length(parser, token, d, true);
      const height = length(parser, token, d, true);
      if (width < 0 || height < 0) fail("invalid-length", "A rule needs nonnegative dimensions.", token.range);
      return create({ kind: "rule", width, height, raise });
    }
    case "raisebox": return create({ kind: "padding", raise: length(parser, token, d, true), body: argument() });
    case "smash": {
      const option = optional(parser, d);
      const axes = option ? operatorText(option) : "tb";
      if (!/^(?:t|b|tb|bt)$/.test(axes)) fail("syntax", "Expected t or b in a smash option.", token.range);
      return create({ kind: "padding", body: argument(), ...(axes.includes("t") && { zeroHeight: true }), ...(axes.includes("b") && { zeroDepth: true }) });
    }
    case "llap":
    case "rlap":
    case "clap":
    case "mathllap":
    case "mathrlap":
    case "mathclap":
      return create({ kind: "padding", body: argument(),
        align: name.endsWith("llap") ? "right" : name.endsWith("rlap") ? "left" : "center" });
    case "mathrm": return alphabet(argument());
    case "textnormal":
    case "textrm": return atom("text", parser.rawGroup(d));
    case "textbf":
    case "textit":
    case "textsf":
    case "texttt": {
      const value = parser.rawGroup(d);
      const styled = alphabet({ kind: "atom", role: "identifier", value }, alphabets["math" + name.slice(4)]) as Atom;
      return atom("text", styled.value);
    }
    case "operatorname":
    case "mathop": {
      const movable = name === "mathop" || parser.peek().value === "*";
      if (name === "operatorname" && movable) parser.take();
      return atom(movable ? "large" : "function", operatorText(argument()));
    }
    case "overset":
    case "stackrel":
    case "underset": {
      const annotation = argument();
      const base = argument();
      return create({ kind: "stack", base, ...(name === "underset" ? { below: annotation } : { above: annotation }) });
    }
    case "substack": {
      parser.expect("{", "Expected a braced substack.");
      parser.scope(true);
      const rows: Row[][] = [];
      for (;;) {
        rows.push([parser.sequence(d, ["\\\\", "}"])]);
        if (parser.take().value === "}") break;
      }
      parser.scope(false);
      return create({ kind: "style", level: 1, body: create({ kind: "table", alignment: "center", rows }) });
    }
    case "textcolor": return create({ kind: "style", color: color(parser, d, token), body: argument() });
    case "colorbox": return create({ kind: "style", background: color(parser, d, token), body: atom("text", parser.rawGroup(d)) });
    case "fcolorbox": {
      const border = color(parser, d, token);
      const background = color(parser, d, token);
      return create({ kind: "style", color: border, body: create({
        kind: "enclosure", notation: "box", body: create({ kind: "style", color: "black", background, body: atom("text", parser.rawGroup(d)) }),
      }) });
    }
    case "verb": return atom("text", parser.verbatim(token));
    case "not": {
      const body = argument();
      return body.kind === "atom" ? atom("operator", body.value + "̸")
        : create({ kind: "enclosure", notation: "updiagonalstrike", body });
    }
    case "pmod":
    case "pod": {
      const body = argument();
      const children = name === "pmod" ? [atom("function", "mod"), create({ kind: "space", width: 0.333 }), body] : [body];
      return create({ kind: "fence", left: "(", right: ")", body: create({ kind: "row", children }) });
    }
    case "bmod": return atom("operator", "mod");
    case "hspace":
    case "hskip":
    case "mskip":
    case "kern":
    case "mkern": return create({ kind: "space", width: length(parser, token, d, name === "hspace") });
    case "enspace":
    case "enskip": return create({ kind: "space", width: 0.5 });
    case "thinspace": return create({ kind: "space", width: 0.167 });
    case "medspace":
    case ">": return create({ kind: "space", width: 0.222 });
    case "thickspace": return create({ kind: "space", width: 0.278 });
    case "negthinspace":
    case "!": return create({ kind: "space", width: -0.167 });
    case "negmedspace": return create({ kind: "space", width: -0.222 });
    case "negthickspace": return create({ kind: "space", width: -0.278 });
    case "~": return create({ kind: "space", width: 0.333 });
  }
};
