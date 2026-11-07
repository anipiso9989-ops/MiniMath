import assert from "node:assert/strict";
import test from "node:test";
import { render } from "@mini/math";
import { parseAdvanced, renderAdvanced } from "@mini/math/advanced";
import { renderAdvancedVisual } from "@mini/math/advanced/visual";
import { renderVisual } from "@mini/math/visual";
import { integration } from "@mini/math/integration";

const tex = String.raw;
function artifact(result) {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
}
function code(result) {
  assert.equal(result.ok, false);
  return result.diagnostics[0].code;
}

test("emits each matrix fence and a rectangular semantic table", () => {
  const variants = { matrix: "", pmatrix: "()", bmatrix: "[]", Bmatrix: "{}", vmatrix: "||", Vmatrix: "‖‖" };
  for (const [name, [left, right]] of Object.entries(variants)) {
    const source = tex`\begin{${name}}1&2\\3&4\end{${name}}`;
    const { mathml, text } = artifact(renderAdvanced(source));
    assert.equal((mathml.match(/<mtr>/g) ?? []).length, 2);
    assert.equal((mathml.match(/<mtd>/g) ?? []).length, 4);
    assert.equal(text, `${left ?? ""}matrix: 1, 2; 3, 4${right ?? ""}`);
    if (left) {
      assert.ok(mathml.includes(`<mo stretchy="true">${left}</mo><mtable>`));
      assert.ok(mathml.includes(`</mtable><mo stretchy="true">${right}</mo>`));
    }
  }
});

test("parses nested matrices, empty cells and an optional trailing row break", () => {
  const ast = artifact(parseAdvanced(tex`\begin{matrix}\begin{pmatrix}1\end{pmatrix}&\\2&3\\\end{matrix}`));
  const table = ast.children[0];
  assert.equal(table.kind, "table");
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0][0].children[0].body.rows[0][0].children[0].value, "1");
  assert.deepEqual(table.rows[0][1].children, []);
});

test("renders unnumbered equation, aligned and cases environments", () => {
  assert.match(artifact(renderAdvanced(tex`\begin{equation*}x=1\end{equation*}`, { display: true })).mathml, /display="block".*<mi>x<\/mi>/);
  for (const name of ["aligned", "align", "align*"]) {
    const { mathml } = artifact(renderAdvanced(tex`\begin{${name}}x&=1\\y&=2\end{${name}}`));
    assert.equal((mathml.match(/class="mini-math-right"/g) ?? []).length, 2);
    assert.equal((mathml.match(/class="mini-math-left"/g) ?? []).length, 2);
  }
  assert.match(artifact(renderAdvanced(tex`\begin{cases}x&\text{if }x>0\\0&\text{otherwise}\end{cases}`)).mathml,
    /<mo stretchy="true">\{<\/mo><mtable>.*<mtext>otherwise<\/mtext>/);
});

test("reports table shape, missing ends, mismatches and unknown environments", () => {
  const fixtures = [
    [tex`\begin{matrix}1&2\\3\end{matrix}`, "table-shape"],
    [tex`\begin{cases}1\end{cases}`, "table-shape"],
    [tex`\begin{matrix}1\end{bmatrix}`, "environment-mismatch"],
    [tex`\begin{matrix}1`, "syntax"],
    [tex`\begin{toString}1\end{toString}`, "unknown-environment"],
  ];
  for (const [source, expected] of fixtures) assert.equal(code(renderAdvanced(source)), expected);
});

test("expands isolated zero-argument macros with invocation locations and bounded work", () => {
  const options = { macros: { "\\area": tex`\pi r^2`, "\\wrapper": tex`A=\area` } };
  assert.deepEqual(renderAdvanced(tex`\wrapper`, options), render(tex`A=\pi r^2`));
  assert.equal(code(renderAdvanced(tex`\area`)), "unknown-command");
  assert.equal(code(render(tex`\area`, options)), "unknown-command");
  assert.equal(code(renderAdvanced(tex`\macro`, { macros: { "\\macro": tex`\loop`, "\\loop": tex`\macro` }, limits: { maxExpansions: 3 } })), "expansion-limit");
  assert.equal(code(renderAdvanced(tex`\macro`, { macros: { "\\macro": "𝑥𝑥𝑥" }, limits: { maxInputBytes: 8 } })), "expansion-limit");
  const bad = renderAdvanced(tex`x+\macro`, { macros: { "\\macro": tex`\href{x}` } });
  assert.equal(code(bad), "unknown-command");
  assert.deepEqual(bad.diagnostics[0].range, [2, 8]);
  assert.throws(() => renderAdvanced("", { macros: { "\\frac": "x" } }), TypeError);
  assert.throws(() => renderAdvanced("", { macros: { "name": "x" } }), TypeError);
  const inherited = Object.create({ "\\macro": "x" });
  assert.equal(code(renderAdvanced(tex`\macro`, { macros: inherited })), "unknown-command");
});

test("SVG yields deterministic metrics, scalable fences, accessible title, and escaped text", () => {
  const source = tex`\left(\sqrt[3]{\frac{x_i^2}{2}}\right)=\text{<svg \& text>}`;
  const visual = artifact(renderVisual(source, { display: true }));
  assert.deepEqual(visual, artifact(renderVisual(source, { display: true })));
  assert.ok(visual.metrics.width > 0 && visual.metrics.ascent > 1 && visual.metrics.descent > 0);
  assert.match(visual.svg, /^<svg .* role="img".*<title>.*&lt;svg &amp; text&gt;<\/title>/);
  assert.match(visual.svg, /<polyline .*stroke="currentColor"/);
  assert.match(visual.svg, /transform="translate\([^)]*\) scale\(1 [^)]+\)"/);
  assert.equal(visual.mathml, artifact(render(source, { display: true })).mathml);
  const bytes = Buffer.byteLength(visual.svg + visual.mathml + visual.text);
  assert.deepEqual(visual, artifact(renderVisual(source, { display: true, limits: { maxOutputBytes: bytes } })));
  assert.equal(code(renderVisual(source, { display: true, limits: { maxOutputBytes: bytes - 1 } })), "output-limit");
  assert.match(artifact(renderVisual("")).svg, /<title>Empty expression<\/title>/);
});

test("advanced SVG lays out matrix cells from the same AST as native MathML", () => {
  const source = tex`\begin{bmatrix}\x&2\\3&4\end{bmatrix}`;
  const options = { macros: { "\\x": "1" } };
  const visual = artifact(renderAdvancedVisual(source, options));
  assert.equal((visual.svg.match(/<text /g) ?? []).length, 6);
  assert.equal(visual.mathml, artifact(renderAdvanced(source, options)).mathml);
  assert.ok(visual.metrics.descent > 0);
});

test("integration validates unknown embeds and applies host limits and cancellation", () => {
  const context = { idPrefix: "host-", limits: { maxInputBytes: 64, maxNodes: 32, maxDepth: 8, maxOutputBytes: 500 } };
  assert.equal(integration.protocolVersion, 1);
  assert.equal(code(integration.render({ source: "x" }, {}, context)), "invalid-input");
  assert.equal(code(integration.render("x", null, context)), "invalid-input");
  assert.equal(code(integration.render("x", { display: 1 }, context)), "invalid-input");
  assert.equal(code(integration.render("x".repeat(65), undefined, context)), "input-limit");
  assert.equal(code(integration.render("x", {}, { ...context, signal: AbortSignal.abort() })), "aborted");
  const generous = { ...context, limits: { ...context.limits, maxInputBytes: 1e8, maxDepth: 1e8 } };
  assert.equal(code(integration.render("x".repeat(16_385), {}, generous)), "input-limit");
  assert.match(artifact(integration.render("x", { display: true }, context)).mathml, /display="block"/);
});

test("bounded fuzz smoke tests return results for malformed Unicode and TeX-like fragments", () => {
  const pieces = ["x", "𝑥", "1", "%", "\n", "\uD800", "\u0000", "{", "}", "^", "_", "&", "<", ">", tex`\frac`, tex`\sqrt`, tex`\begin{matrix}`, tex`\end{matrix}`, tex`\\`, tex`\text`, tex`\macro`];
  const options = { macros: { "\\macro": tex`\sqrt{2}` }, limits: { maxDepth: 8, maxNodes: 80, maxOutputBytes: 1000 } };
  let state = 521;
  for (let i = 0; i < 1_000; i++) {
    let source = "";
    for (let j = 0; j <= i % 20; j++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      source += pieces[state % pieces.length];
    }
    const result = renderAdvancedVisual(source, options);
    if (result.ok) {
      assert.ok(result.artifact.mathml.endsWith("</math>"));
      assert.ok(result.artifact.svg.endsWith("</svg>"));
    } else {
      assert.equal(result.diagnostics.length, 1);
      const range = result.diagnostics[0].range;
      if (range) assert.ok(range[0] >= 0 && range[1] >= range[0] && range[1] <= source.length);
    }
  }
});
