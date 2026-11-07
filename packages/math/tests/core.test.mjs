import assert from "node:assert/strict";
import test from "node:test";
import { parse, render } from "@mini/math";

const tex = String.raw;
const ns = "http://www.w3.org/1998/Math/MathML";

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  return result.artifact;
}

function error(result, code, range) {
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, code);
  assert.equal(result.diagnostics[0].severity, "error");
  if (range) assert.deepEqual(result.diagnostics[0].range, range);
}

test("parses a display equation and emits deterministic native MathML", () => {
  const source = tex`x^2+y^2=r^2`;
  const result = success(render(source, { display: true }));
  assert.equal(result.mathml, `<math xmlns="${ns}" display="block"><msup><mi>x</mi><mn>2</mn></msup><mo stretchy="false">+</mo><msup><mi>y</mi><mn>2</mn></msup><mo stretchy="false">=</mo><msup><mi>r</mi><mn>2</mn></msup></math>`);
  assert.equal(result.text, "x superscript (2) + y superscript (2) = r superscript (2)");
  assert.deepEqual(render(source, { display: true }), render(source, { display: true }));
});

test("parses nested fractions, optional root indices, and single-token arguments", () => {
  const ast = success(parse(tex`\frac12+\sqrt[3]{\frac{12.5}{x}}`));
  assert.deepEqual(ast.children[0], {
    kind: "fraction", top: { kind: "atom", role: "number", value: "1" },
    bottom: { kind: "atom", role: "number", value: "2" },
  });
  assert.match(success(render(tex`\sqrt[3]{\frac{12.5}{x}}`)).mathml,
    /<mroot><mrow><mfrac><mrow><mn>12\.5<\/mn><\/mrow><mrow><mi>x<\/mi><\/mrow><\/mfrac><\/mrow><mrow><mn>3<\/mn><\/mrow><\/mroot>/);
  assert.match(success(render("x^23")).mathml, /<mn>2<\/mn><\/msup><mn>3<\/mn>/);
  assert.match(success(render(".5")).mathml, /<mn>\.5<\/mn>/);
});

test("emits movable limits, integral scripts, Greek letters, Unicode, and functions", () => {
  const { mathml } = success(render(tex`\sum_{i=1}^n \alpha_i + \int_0^1 \sin(𝑥)\,dx`));
  assert.match(mathml, /<munderover><mo movablelimits="true">∑<\/mo>/);
  assert.match(mathml, /<msub><mi>α<\/mi><mi>i<\/mi><\/msub>/);
  assert.match(mathml, /<msubsup><mo>∫<\/mo><mn>0<\/mn><mn>1<\/mn><\/msubsup>/);
  assert.match(mathml, /<mi mathvariant="normal">sin<\/mi>/);
  assert.match(mathml, /<mi>𝑥<\/mi>/);
  assert.match(mathml, /<mspace width="0\.167em"><\/mspace>/);
  assert.match(success(render("á_i''")).mathml, /<msubsup><mi>á<\/mi><mi>i<\/mi><mo stretchy="false">′′<\/mo>/);
});

test("supports paired stretchy, invisible, and literal fences", () => {
  assert.match(success(render(tex`\left.\frac12\right\rvert + (x)`)).mathml,
    /<mrow><mfrac>.*<mo stretchy="true">\|<\/mo><\/mrow>.*<mo stretchy="false">\(<\/mo>/);
  assert.match(success(render(tex`\left\{x\right\}`)).mathml, /<mo stretchy="true">\{<\/mo>.*<mo stretchy="true">\}<\/mo>/);
});

test("diagnoses malformed input with UTF-16 source ranges", () => {
  error(parse(tex`𝑥\constructor`), "unknown-command", [2, 14]);
  error(render("x^^2"), "syntax", [2, 3]);
  error(render("x^2^3"), "duplicate-script", [3, 4]);
  error(render("x_1_2"), "duplicate-script", [3, 4]);
  error(render(tex`\sqrt[3`), "syntax");
  error(render(tex`\frac{1}`), "syntax");
  error(render(tex`\left(x`), "syntax");
  error(render(tex`\right)`), "syntax");
  error(render(tex`\begin{matrix}1\end{matrix}`), "feature-required", [0, 6]);
  error(render("x\\"), "syntax", [1, 2]);
  error(render(null), "invalid-input");
  error(render("\uD800"), "invalid-character", [0, 1]);
  error(render("\u0000"), "invalid-character", [0, 1]);
});

test("renders input as inert math or text and rejects markup-generating commands", () => {
  const source = tex`\text{<script onclick="alert(1)">\& \{x\}</script>}`;
  const { mathml, text } = success(render(source));
  assert.equal(text, '<script onclick="alert(1)">& {x}</script>');
  assert.match(mathml, /<mtext>&lt;script onclick="alert\(1\)"&gt;&amp; \{x\}&lt;\/script&gt;<\/mtext>/);
  assert.doesNotMatch(mathml, /<script/);
  for (const name of ["href", "includegraphics", "htmlStyle", "def", "newcommand"]) {
    error(render("\\" + name + "{x}"), "unknown-command", [0, name.length + 1]);
  }
  assert.equal(success(render("x % \\nope\ny")).text, "x y");
  assert.equal(success(render(tex`\text{some {braced} text}`)).text, "some braced text");
  assert.equal(success(render("")).mathml, `<math xmlns="${ns}"></math>`);
});

test("enforces exact UTF-8 budgets, depth, node count, and cancellation", () => {
  error(render("𝑥", { limits: { maxInputBytes: 3 } }), "input-limit");
  success(render("𝑥", { limits: { maxInputBytes: 4 } }));
  const { mathml, text } = success(render(tex`\text{é<𝑥}`));
  const maxOutputBytes = Buffer.byteLength(mathml) + Buffer.byteLength(text);
  success(render(tex`\text{é<𝑥}`, { limits: { maxOutputBytes } }));
  error(render(tex`\text{é<𝑥}`, { limits: { maxOutputBytes: maxOutputBytes - 1 } }), "output-limit");
  error(render("{{x}}", { limits: { maxDepth: 1 } }), "depth-limit");
  error(render(tex`\text{{a}}`, { limits: { maxDepth: 1 } }), "depth-limit");
  error(render("x^2", { limits: { maxNodes: 3 } }), "node-limit");
  error(render("x", { signal: AbortSignal.abort() }), "aborted");
  assert.throws(() => render("x", { limits: { maxDepth: 1e6 } }), RangeError);
});
