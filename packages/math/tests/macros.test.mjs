import assert from "node:assert/strict";
import test from "node:test";
import { render } from "@mini/math";
import { parseAdvanced, renderAdvanced } from "@mini/math/advanced";
import { renderAdvancedVisual } from "@mini/math/advanced/visual";

const tex = String.raw;
const success = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
};

function equivalent(source, expanded, options) {
  assert.deepEqual(success(renderAdvanced(source, options)), success(render(expanded)));
}

function error(result, code, range) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.diagnostics[0].code, code);
  if (range) assert.deepEqual(result.diagnostics[0].range, range);
}

test("infers configured arity and substitutes unexpanded, grouped or single-token arguments", () => {
  const options = { macros: {
    "\\pair": tex`\left(#2,#1\right)`,
    "\\square": tex`{#1}^2`,
    "\\adjacent": "#1x",
    "\\nine": "#9",
  } };
  equivalent(tex`\pair{a+b}\alpha+\square{\pair12}`, tex`\left(\alpha,a+b\right)+{\left(2,1\right)}^2`, options);
  equivalent(tex`\adjacent\alpha`, tex`\alpha x`, options);
  equivalent(tex`\nine123456789`, "9", options);
  equivalent(tex`\square{}`, "{}^2", options);
});

test("handles optional defaults and braced brackets in the optional argument", () => {
  const body = "#1_{#2}";
  const options = { macros: { "\\at": [body, 2, "x"] } };
  equivalent(tex`\at{i}+\at[y]{j}+\at[{z]}]{k}`, "x_{i}+y_{j}+{z]}_{k}", options);
  equivalent(tex`\at[]{j}`, "{}_{j}", { macros: { "\\at": ["{#1}_{#2}", 2, "x"] } });
  equivalent(tex`\newcommand*{\at}[2][x]{#1_{#2}}\at{i}+\at[y]{j}`, "x_{i}+y_{j}");
  equivalent(tex`\newcommand\value[1][x]{#1}\value+y`, "x+y");
});

test("supports positional and delimited definitions, literal prefixes and captured groups", () => {
  equivalent(tex`\def\sq#1{{#1}^2}\sq{a+b}`, "{a+b}^2");
  equivalent(tex`\def\pair(#1,#2){\frac{#1}{#2}}\pair({x,y},z)`, tex`\frac{x,y}{z}`);
  equivalent(tex`\def\delimited#1aab{#1}\delimited xaaab`, "xa");
  equivalent(tex`\def\pair#1,#2;{#2+#1}\pair,4;`, "4+");
});

test("keeps definitions local to groups and renders, with explicit global definitions and aliases", () => {
  const options = { macros: { "\\value": "a" } };
  equivalent(tex`{\def\value{b}\value}+\value`, "{b}+a", options);
  equivalent(tex`{\gdef\value{b}}+\value`, "{}+b", options);
  equivalent(tex`\let\saved=\value\renewcommand{\value}{c}\saved+\value`, "a+c", options);
  equivalent(tex`\let\quotient\frac\quotient12`, tex`\frac12`);
  equivalent(tex`\providecommand{\value}{b}\value`, "a", options);
  equivalent(tex`\providecommand{\value}{b}\value`, "b");
  equivalent(tex`\newcommand{\outer}{\def\inner##1{{##1}^2}}\outer\inner{x}`, "{x}^2");
  success(renderAdvanced(tex`\begin{equation}\def\local{1}\local\end{equation}`));
  error(renderAdvanced(tex`\begin{equation}\def\local{1}\local\end{equation}\local`), "unknown-command");
  error(renderAdvanced(tex`\value`), "unknown-command");
  assert.deepEqual(options.macros, { "\\value": "a" });
});

test("preserves prose whitespace, literal hashes and escaping in expanded arguments", () => {
  const { mathml, text } = success(renderAdvanced(tex`\newcommand{\say}[1]{\text{## #1}}\say{a  \& <b>}`));
  assert.equal(text, "# a  & <b>");
  assert.match(mathml, /# a  &amp; &lt;b&gt;/);
  assert.doesNotMatch(mathml, /<b>/);
  assert.equal(success(renderAdvanced(tex`\prefix{a b}`, {
    macros: { "\\prefix": tex`\text` },
  })).text, "a b");
});

test("gives ranged diagnostics and bounds expanding, duplicating and scanning macro input", () => {
  error(renderAdvanced(tex`\required`, { macros: { "\\required": "#1" } }), "macro-argument", [9, 9]);
  error(renderAdvanced(tex`\newcommand{\bad}[1]{#2}`), "macro-parameter");
  error(renderAdvanced(tex`\newcommand{\frac}{x}`), "macro-conflict");
  error(renderAdvanced(tex`\renewcommand{\missing}{x}`), "macro-conflict");
  error(renderAdvanced(tex`\def\delimited#1;{#1}\delimited x`), "macro-argument");
  error(renderAdvanced(tex`\newcommand{\x}[1][y]{#1}\x[{a}`), "macro-syntax");
  error(renderAdvanced(tex`\a{z}`, { macros: { "\\a": tex`\a{#1}` }, limits: { maxExpansions: 4 } }), "expansion-limit");
  error(renderAdvanced(tex`\dup{𝑥𝑥𝑥}`, {
    macros: { "\\dup": "#1#1#1" }, limits: { maxInputBytes: 24 },
  }), "expansion-limit");
  error(renderAdvanced(tex`\dup{}\dup{}\dup{}\dup{}\dup{}\dup{}\dup{}`, {
    macros: { "\\dup": "#1".repeat(30) }, limits: { maxInputBytes: 60 },
  }), "expansion-limit");
  error(renderAdvanced(tex`\safe{\href{bad}{x}}`, { macros: { "\\safe": "#1" } }), "unknown-command");
  assert.throws(() => renderAdvanced("x", { macros: { "\\a": ["#1", 10] } }), TypeError);
});

test("uses the same macro expansion for parsed ASTs and the advanced SVG backend", () => {
  const source = tex`\newcommand{\sq}[1]{#1^2}\sq{x}`;
  assert.deepEqual(success(parseAdvanced(source)), success(parseAdvanced("x^2")));
  const svg = success(renderAdvancedVisual(source));
  assert.equal(svg.mathml, success(render("x^2")).mathml);
  assert.match(svg.svg, /superscript \(2\)/);
});

test("supports scoped custom environments and balanced opening and closing code", () => {
  const source = tex`\newenvironment{paren}[1][x]{\left(#1+}{\right)}\begin{paren}[y]z\end{paren}`;
  equivalent(source, tex`{\left(y+z\right)}`);
  equivalent(tex`\newenvironment{paren}{\left(}{\right)}\begin{paren}\begin{paren}x\end{paren}\end{paren}`,
    tex`{\left({\left(x\right)}\right)}`);
  const table = success(renderAdvanced(tex`\newenvironment{surround}{\left(}{\right)}\begin{surround}\begin{matrix}1\end{matrix}\end{surround}`));
  assert.match(table.mathml, /<mtable>/);
  error(renderAdvanced(tex`\newenvironment{paren}{}{}\begin{paren}x\end{wrong}`), "environment-mismatch");
});

test("constructs and expands named control sequences within the existing budgets", () => {
  equivalent(tex`\def\saved{x}\csname saved\endcsname`, "x");
  equivalent(tex`\def\part{saved}\def\saved{x}\csname\part\endcsname`, "x");
  equivalent(tex`\expandafter\def\csname saved\endcsname{x}\saved`, "x");
  error(renderAdvanced(tex`\csname missing`), "macro-argument");
  error(renderAdvanced(tex`\def\cycle{\cycle}\csname\cycle\endcsname`, { limits: { maxExpansions: 3 } }), "expansion-limit");
});
