import assert from "node:assert/strict";
import test from "node:test";
import { render } from "@mini/math";
import { renderVisual } from "@mini/math/visual";
import { createCompatibleRenderer } from "@mini/math/compat";
import { renderKaTeX } from "@mini/math/compat/katex";
import { createMathJaxRenderer } from "@mini/math/compat/mathjax";
import { compatibility } from "../../../benchmarks/fixtures.mjs";

const tex = String.raw;
const display = { display: true };
const success = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
};
const code = (result) => {
  assert.equal(result.ok, false);
  return result.diagnostics[0].code;
};

test("renders native blackboard letters, fractions and binomials in MathML and SVG", () => {
  const source = tex`\mathbb{RZ}\subset\mathbb{C}+\binom{n}{k}`;
  const mathml = success(render(source)).mathml;
  assert.match(mathml, /<mi mathvariant="normal">ℝ<\/mi><mi mathvariant="normal">ℤ<\/mi>/);
  assert.match(mathml, /<mfrac linethickness="0">/);
  assert.match(success(render(source)).text, /n choose k/);
  assert.match(success(render(tex`\dfrac12+\tbinom34`)).mathml, /<mstyle displaystyle="true"><mfrac>.*<mstyle displaystyle="false"><mfrac linethickness="0">/);
  assert.doesNotMatch(success(renderVisual(tex`\binom{n}{k}`)).svg, /<polyline/);
  assert.doesNotMatch(success(renderVisual(tex`\mathbb{R}`)).svg, /font-style="italic"/);
});

test("renders every prior compatibility probe and identifies the engine actually used", async () => {
  const run = createCompatibleRenderer();
  const expected = ["native", "katex", "native", "native", "katex", "katex", "mathjax"];
  for (const [i, source] of Object.values(compatibility).entries()) {
    const artifact = success(await run(source, display));
    assert.equal(artifact.renderer, expected[i], source);
    assert.match(artifact.mathml, /^<math xmlns=/);
  }
  const array = success(await run(compatibility["Arrays with column specifications"], display));
  assert.match(array.mathml, /class="mini-math-left".*class="mini-math-right"/);
  const tag = success(await run(compatibility["Equation tags"], display));
  assert.match(tag.mathml, /<mtr>[\s\S]*<mtd>[\s\S]*<mtext[^>]*>5<\/mtext>[\s\S]*<\/mtr>/);
  assert.doesNotMatch(tag.mathml, /mlabeledtr/);
});

test("loads providers only on demand, shares concurrent loads, and preserves terminal limits", async () => {
  let loads = 0;
  const run = createCompatibleRenderer([async () => { loads++; return renderKaTeX; }]);
  assert.equal(success(await run("x^2")).renderer, "native");
  assert.equal(code(await run("x^2", { limits: { maxInputBytes: 1 } })), "input-limit");
  assert.equal(code(await run(tex`\xrightarrow{t}`, { signal: AbortSignal.abort() })), "aborted");
  assert.equal(loads, 0);
  const results = await Promise.all([run(tex`\xrightarrow{t}`), run(tex`\widehat{AB}`)]);
  assert.deepEqual(results.map((result) => success(result).renderer), ["katex", "katex"]);
  assert.equal(loads, 1);
});

test("supports chemistry and optional MathJax package selection with render-local definitions", async () => {
  const chemistry = tex`\ce{2H2 + O2 -> 2H2O}`;
  assert.match(success(renderKaTeX(chemistry)).mathml, /<msub>/);
  const mathjax = await createMathJaxRenderer({ packages: ["physics", "mhchem"] });
  assert.match(success(mathjax(chemistry)).mathml, /<msub/);
  assert.match(success(mathjax(tex`\qty(x)`)).mathml, /<mo[^>]*>\(<\/mo>/);
  assert.ok(mathjax(tex`\newcommand{\temporary}{x}\temporary`).ok);
  assert.equal(code(mathjax(tex`\temporary`)), "mathjax-syntax");
  const proofs = await createMathJaxRenderer({ packages: ["bussproofs"] });
  assert.match(success(proofs(tex`\begin{prooftree}\AxiomC{$A$}\UnaryInfC{$B$}\end{prooftree}`)).mathml, /<mtable/);
  await assert.rejects(createMathJaxRenderer({ packages: ["texhtml"] }), TypeError);
});

test("blocks active resources and enforces adapter bounds independently of native parsing", async () => {
  const mathjax = await createMathJaxRenderer();
  const hostile = tex`\text{<img src=x onerror=alert(1)>}`;
  for (const run of [renderKaTeX, mathjax]) {
    const result = success(run(hostile));
    assert.equal(result.text, hostile);
    assert.doesNotMatch(result.mathml, /<img/);
    assert.match(result.mathml, /&lt;img/);
    assert.equal(code(run("x", { limits: { maxOutputBytes: 1 } })), "output-limit");
    assert.equal(code(run("x", { limits: { maxNodes: 1 } })), "node-limit");
    assert.equal(code(run("x", { limits: { maxDepth: 0 } })), "depth-limit");
    assert.equal(code(run(tex`\def\loop{\loop}\loop`, { limits: { maxExpansions: 2 } })), "expansion-limit");
    assert.equal(code(run("x", { signal: AbortSignal.abort() })), "aborted");
  }
  assert.equal(code(renderKaTeX(tex`\href{javascript:alert(1)}{x}`)), "blocked-command");
  assert.equal(code(mathjax(tex`\href{javascript:alert(1)}{x}`)), "mathjax-syntax");
  assert.equal(code(mathjax(tex`\require{texhtml}`)), "mathjax-syntax");
});
