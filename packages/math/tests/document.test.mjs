import assert from "node:assert/strict";
import test from "node:test";
import { renderAdvanced } from "@mini/math/advanced";
import { renderDocument } from "@mini/math/document";

const tex = String.raw;
const artifact = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.artifact;
};
const error = (result, code, entry) => {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.diagnostics[0].code, code);
  assert.equal(result.diagnostics[0].entry, entry);
};

test("numbers document equations and resolves forward and backward references", () => {
  const result = artifact(renderDocument([
    { source: tex`\eqref{last}+\ref{first}` },
    { source: tex`\begin{align}a&=1\label{first}\\b&=2\notag\\c&=3\label{last}\end{align}`, display: true },
    { source: tex`\eqref{first}` },
  ], { numbering: "ams", startNumber: 7, idPrefix: "demo-" }));
  assert.deepEqual(result.labels, [
    { label: "first", id: "demo-first", text: "7" },
    { label: "last", id: "demo-last", text: "8" },
  ]);
  assert.match(result.entries[0].mathml, /<mtext><a xmlns="[^"]+" href="#demo-last">\(8\)<\/a><\/mtext>/);
  assert.match(result.entries[1].mathml, /<mtr id="demo-first">/);
  assert.match(result.entries[2].mathml, /href="#demo-first"/);
});

test("handles manual and starred tags, numbering modes, and multline numbering", () => {
  const result = artifact(renderDocument([
    { source: tex`x=1\tag*{A}\label{manual}`, display: true },
    { source: tex`\begin{equation*}x=2\end{equation*}`, display: true },
    { source: tex`\begin{multline}x+y\\=0\label{multi}\end{multline}`, display: true },
    { source: tex`z=0\label{plain}`, display: true },
    { source: tex`\eqref{manual}` },
  ], { numbering: "all" }));
  assert.deepEqual(result.labels.map(({ text }) => text), ["A", "1", "2"]);
  assert.doesNotMatch(result.entries[1].mathml, /mini-math-tag/);
  assert.match(result.entries[4].mathml, /\(A\)/);
  assert.match(artifact(renderAdvanced(tex`x=1\tag{2}\label{x}+\ref{x}`)).mathml, /href="#mini-eq-x"/);
});

test("reports label errors by entry and keeps separate documents isolated", () => {
  error(renderDocument([{ source: tex`x\label{unnumbered}` }]), "unlabeled-equation", 0);
  error(renderDocument([{ source: "x" }, { source: tex`\ref{absent}` }]), "unknown-reference", 1);
  error(renderDocument([
    { source: tex`x\tag{1}\label{a}` }, { source: tex`y\tag{2}\label{a}` },
  ]), "duplicate-label", 1);
  error(renderDocument([{ source: tex`x\tag{1}\label{javascript:bad"x}` }]), "invalid-label", 0);
  assert.throws(() => renderDocument([], { idPrefix: 'x" onmouseover="' }), TypeError);
  const entry = { source: tex`\begin{equation}x\label{a}\end{equation}` };
  assert.equal(artifact(renderDocument([entry], { numbering: "ams" })).labels[0].text, "1");
  assert.equal(artifact(renderDocument([entry], { numbering: "ams" })).labels[0].text, "1");
});

test("shares global macros and enforces aggregate byte, node, expansion and output limits", () => {
  const global = artifact(renderDocument([{ source: tex`\gdef\a{x}` }, { source: tex`\a` }]));
  assert.equal(global.entries[1].text, "x");
  error(renderDocument([{ source: tex`\def\a{x}` }, { source: tex`\a` }]), "unknown-command", 1);
  error(renderDocument([{ source: "é" }, { source: "𝑥" }], { limits: { maxInputBytes: 5 } }), "input-limit", 1);
  error(renderDocument([{ source: "x" }, { source: "y" }], { limits: { maxNodes: 3 } }), "node-limit", 1);
  error(renderDocument([{ source: tex`\a` }, { source: tex`\a` }], {
    macros: { "\\a": "x" }, limits: { maxExpansions: 1 },
  }), "expansion-limit", 1);
  error(renderDocument([{ source: "x" }, { source: "y" }], { limits: { maxOutputBytes: 90 } }), "output-limit", 1);
  error(renderDocument([{ source: "x" }], { signal: AbortSignal.abort() }), "aborted");
});
