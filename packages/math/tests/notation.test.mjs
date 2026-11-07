import assert from "node:assert/strict";
import test from "node:test";
import { render } from "@mini/math";
import { parseAdvanced, renderAdvanced } from "@mini/math/advanced";
import { renderAdvancedVisual } from "@mini/math/advanced/visual";
import { compatibility } from "../../../benchmarks/fixtures.mjs";

const tex = String.raw;
const artifact = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
};
const code = (result) => {
  assert.equal(result.ok, false);
  return result.diagnostics[0].code;
};

test("renders the seven previous coverage probes through the native parser", () => {
  for (const [name, source] of Object.entries(compatibility)) {
    const result = renderAdvanced(source, { display: true });
    assert.equal(result.ok, true, name + " " + JSON.stringify(result.diagnostics));
    assert.match(result.artifact.mathml, /^<math /);
  }
  assert.equal(artifact(renderAdvanced(compatibility["Eager edef definition"])).text, "x");
  assert.match(artifact(renderAdvanced(compatibility["Labeled arrows"])).mathml, /<mover><mo stretchy="true">→/);
  assert.match(artifact(renderAdvanced(compatibility["Equation tags"])).mathml, /<mtd class="mini-math-tag"><mo>\(<\/mo>.*<mn>5<\/mn>/);
  assert.equal(artifact(render(tex`\mathbb{RZ}+\mathbb{R+\Gamma}`)).text, "ℝ ℤ + ℝ + ℾ");
});

test("renders annotated arrows, accents, limit overrides, and font variants", () => {
  const source = tex`A\xrightarrow[g]{f}B+\widehat{AB}+\sum\nolimits_{i=0}^n+\int\limits_0^1`;
  const { mathml } = artifact(renderAdvanced(source));
  assert.match(mathml, /<munderover><mo stretchy="true">→<\/mo>.*<mi>g<\/mi>.*<mi>f<\/mi>/);
  assert.match(mathml, /<mover accent="true">/);
  assert.match(mathml, /<msubsup><mo movablelimits="true">∑/);
  assert.match(mathml, /<munderover><mo>∫/);
  const fonts = artifact(renderAdvanced(tex`\mathbf{A\alpha}+\mathcal{B}+\mathfrak{R}+\mathrm{x}+\operatorname{rank}(A)`));
  for (const value of ["𝐀", "𝛂", "ℬ", "ℜ", '<mi mathvariant="normal">x</mi>', '<mi mathvariant="normal">rank</mi>']) {
    assert.ok(fonts.mathml.includes(value), value);
  }
  assert.match(artifact(renderAdvancedVisual(tex`A\xrightarrow{long}B`)).svg, />→<\/text>/);
});

test("preserves column alignments, repetitions, rules and row boundaries", () => {
  const source = tex`\begin{array}{|*{2}{lr}|}\hline x&y&z&w\\\hdashline1&2&3&4\\\hline\end{array}`;
  const { mathml } = artifact(renderAdvanced(source));
  assert.match(mathml, /mini-math-line-solid/);
  assert.match(mathml, /mini-math-line-dashed/);
  assert.match(mathml, /mini-math-rule-left/);
  assert.match(mathml, /mini-math-right mini-math-rule-right/);
  assert.match(mathml, /mini-math-last-solid/);
  assert.match(artifact(renderAdvancedVisual(source)).svg, /<polyline/);
  assert.equal(code(renderAdvanced(tex`\begin{array}{l}x&y\end{array}`)), "table-shape");
  assert.equal(code(renderAdvanced(tex`\begin{array}{*{10000}{lr}}x\end{array}`)), "array-columns");
  assert.equal(code(renderAdvanced(tex`\begin{array}{q}x\end{array}`)), "array-columns");
  assert.equal(code(renderAdvanced(tex`\begin{matrix}\def\local{1}\local&\local\end{matrix}`)), "unknown-command");
});

test("supports additional AMS environments and scoped style switches", () => {
  for (const source of [
    tex`\begin{gather}x=1\\y=2\end{gather}`,
    tex`\begin{alignedat}{2}a&=b&c&=d\\e&=f&g&=h\end{alignedat}`,
    tex`\begin{multline}x+y+z\\=0\end{multline}`,
    tex`\begin{pmatrix*}[r]1&20\\3&4\end{pmatrix*}`,
    tex`\begin{rcases}x&x>0\\0&x\le 0\end{rcases}`,
    tex`\begin{equation}\begin{split}x&=1\\&=2\end{split}\end{equation}`,
  ]) assert.match(artifact(renderAdvanced(source)).mathml, /<mtable/);
  const result = artifact(renderAdvanced(tex`{\scriptstyle a+b} + \textcolor[RGB]{255,0,0}{x} + \phantom{y} + \boxed{z}`));
  assert.match(result.mathml, /displaystyle="false" scriptlevel="1"/);
  assert.match(result.mathml, /mathcolor="#ff0000"/);
  assert.match(result.mathml, /<mphantom>/);
  assert.match(result.mathml, /<menclose notation="box"/);
});

test("expands eager definitions in the same bounded and scoped macro engine", () => {
  assert.equal(artifact(renderAdvanced(tex`\def\value{x}\edef\saved{\value}\def\value{y}\saved+\value`)).text, "x + y");
  assert.equal(artifact(renderAdvanced(tex`\def\value{x}\edef\saved{\noexpand\value}\def\value{y}\saved`)).text, "y");
  assert.equal(artifact(renderAdvanced(tex`\def\formula#1{{#1}^2}{\xdef\saved#1{\formula{#1}}}\saved{z}`)).text.trim(), "z superscript (2)");
  assert.equal(artifact(renderAdvanced(tex`{\global\def\shared{x}}\shared`)).text.trim(), "x");
  assert.equal(code(renderAdvanced(tex`\def\loop{\loop}\edef\saved{\loop}`, { limits: { maxExpansions: 4 } })), "expansion-limit");
});

test("renders chemical reactions, units, derivatives, and quantum notation natively", () => {
  const reaction = artifact(renderAdvanced(tex`\ce{2H2 + O2 ->[heat] 2H2O}`));
  assert.match(reaction.mathml, /<msub><mi mathvariant="normal">H<\/mi><mn>2<\/mn>/);
  assert.match(reaction.mathml, /<mover><mo stretchy="true">→<\/mo><mtext>heat<\/mtext>/);
  assert.match(artifact(renderAdvanced(tex`\ce{[Fe(CN)6]^3-}`)).mathml, /<msup>.*<mtext>3−<\/mtext>/);
  assert.match(artifact(renderAdvanced(tex`\pu{3.4e-2 mol L-1}`)).mathml, /<msup><mn>10<\/mn><mn>−2<\/mn>/);
  assert.match(artifact(renderAdvanced(tex`\pdv{f}{x}{y}+\qty(x)+\braket{x}{y}`)).mathml, /<mfrac>.*∂.*⟨/);
  assert.equal(code(renderAdvanced(tex`\ce{X[O2}`)), "chemistry-syntax");
});

test("renders elementary proof trees and commutative diagrams", () => {
  const tree = artifact(renderAdvanced(tex`\begin{prooftree}\AxiomC{$A$}\AxiomC{$B$}\RightLabel{$r$}\BinaryInfC{$C$}\end{prooftree}`));
  assert.match(tree.mathml, /<mfrac>.*<mi>A<\/mi>.*<mi>B<\/mi>.*<mi>C<\/mi>/);
  const cd = artifact(renderAdvanced(tex`\begin{CD}A@>f>>B\\@VVV @AAA\\C@>>>D\end{CD}`));
  assert.match(cd.mathml, /<mtable>.*→.*↓.*↑/);
  assert.equal(code(renderAdvanced(tex`\begin{prooftree}\BinaryInfC{$A$}\end{prooftree}`)), "proof-premises");
});

test("keeps literal markup inert and rejects unsafe colors and URLs", () => {
  const literal = artifact(renderAdvanced(tex`\verb|</mtext><img src=x onerror=bad> %|`));
  assert.doesNotMatch(literal.mathml, /<img/);
  assert.match(literal.mathml, /&lt;img/);
  assert.equal(code(renderAdvanced(tex`\color{url(javascript:bad)}x`)), "invalid-color");
  assert.equal(code(renderAdvanced(tex`\href{javascript:bad}{x}`)), "unknown-command");
  assert.equal(code(parseAdvanced(tex`\begin{CD}A@>f>\end{CD}`)), "syntax");
});

test("renders generalized fractions, grouped infix fractions, and box dimensions", () => {
  const fraction = artifact(renderAdvanced(tex`\genfrac{[}{]}{0pt}{0}{a}{b}+{n\choose k}+{1\over 2}`));
  assert.match(fraction.mathml, /<mo stretchy="true">\[<\/mo><mstyle displaystyle="true"><mfrac linethickness="0">/);
  assert.match(fraction.text, /n choose k.*\(1\) \/ \(2\)/);
  assert.equal(code(renderAdvanced(tex`{a\over b\over c}`)), "syntax");
  const boxes = artifact(renderAdvancedVisual(tex`\smash[t]{x}+\raisebox{1em}{y}+\mathllap{z}+\rule[1em]{2em}{0.1em}`));
  assert.match(boxes.mathml, /<mpadded height="0">/);
  assert.match(boxes.mathml, /<mpadded voffset="1em">/);
  assert.match(boxes.mathml, /<mpadded width="0" lspace="-1width">/);
  assert.match(boxes.svg, /<polyline/);
  assert.equal(code(renderAdvanced(tex`\rule{-1em}{1em}`)), "invalid-length");
});

test("bounds semantic proof-tree depth even when the TeX source is shallow", () => {
  const source = tex`\begin{prooftree}\AxiomC{$A$}` + tex`\UnaryInfC{$A$}`.repeat(12) + tex`\end{prooftree}`;
  assert.equal(code(renderAdvancedVisual(source, { limits: { maxDepth: 8 } })), "depth-limit");
});

test("selects mathchoice branches by display, fraction, script, and explicit styles", () => {
  const choice = tex`\mathchoice{D}{T}{S}{Z}`;
  assert.equal(artifact(renderAdvanced(choice, { display: true })).text, "D");
  assert.equal(artifact(renderAdvanced(choice)).text, "T");
  assert.equal(artifact(renderAdvanced(tex`x^{${choice}}`)).text, "x superscript (S)");
  assert.equal(artifact(renderAdvanced(tex`x^{y^{${choice}}}`)).text, "x superscript (y superscript (Z))");
  assert.equal(artifact(renderAdvanced(tex`\frac{${choice}}{x}`)).text, "(S) / (x)");
  assert.equal(artifact(renderAdvanced(tex`{\textstyle ${choice}}`, { display: true })).text, "T");
  assert.match(artifact(renderAdvanced(tex`\prescript{14}{6}{C}`)).mathml,
    /<mmultiscripts>.*<mprescripts><\/mprescripts>.*<mn>6<\/mn>.*<mn>14<\/mn>/);
});

test("renders side scripts, custom enclosures, cancellation targets and infix delimiters", () => {
  const sides = artifact(renderAdvanced(tex`\sideset{_a^b}{_c^d}\sum`));
  assert.match(sides.mathml, /<mmultiscripts><mo movablelimits="true">∑<\/mo><mi>c<\/mi><mi>d<\/mi><mprescripts><\/mprescripts><mi>a<\/mi><mi>b<\/mi>/);
  assert.match(artifact(renderAdvancedVisual(tex`\enclose{circle}{x}`)).svg, /<ellipse/);
  assert.match(artifact(renderAdvanced(tex`\cancelto{0}{x}`)).mathml, /notation="updiagonalarrow"/);
  assert.match(artifact(renderAdvanced(tex`{a\overwithdelims()b}`)).mathml, /<mo stretchy="true">\(<\/mo><mfrac>/);
});

test("renders decimal, octal, hexadecimal and literal TeX character codes", () => {
  const result = artifact(renderAdvanced('\\char65+\\char\'101+\\char"221E+\\char`\\&'));
  assert.equal(result.text, "A + A + ∞ + &");
  assert.match(result.mathml, /&amp;/);
  assert.equal(code(renderAdvanced('\\char"110000')), "invalid-character");
  assert.equal(code(renderAdvanced('\\char0')), "invalid-character");
});
