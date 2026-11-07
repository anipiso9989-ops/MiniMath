import { core, matrices } from "./fixtures.mjs";

export const fixtures = { core, matrices };

export const bundles = {
  "MiniMath parse only": 'export { parse } from "@mini/math";',
  "MiniMath MathML": 'export { render } from "@mini/math";',
  "MiniMath advanced MathML": 'export { renderAdvanced } from "@mini/math/advanced";',
  "MiniMath lazy advanced": 'export { render } from "@mini/math"; export const load = () => import("@mini/math/advanced");',
  "MiniMath browser mount": 'export { mount } from "@mini/math/browser";',
  "MiniMath SVG + MathML": 'export { renderVisual } from "@mini/math/visual";',
  "MiniMath advanced SVG + MathML": 'export { renderAdvancedVisual } from "@mini/math/advanced/visual";',
};

const mini = (method, path) => ({
  browser: `import { ${method} } from "${path}"; globalThis.convert = (source) => { const result = ${method}(source, { display: true }); if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); return result.artifact.mathml; };`,
  async load() {
    const { [method]: render } = await import(path);
    return (source) => {
      const result = render(source, { display: true });
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
      return result.artifact.mathml;
    };
  },
});

export const renderers = {
  "MiniMath": { ...mini("render", "@mini/math"), workloads: ["core"] },
  "MiniMath advanced": { ...mini("renderAdvanced", "@mini/math/advanced"), workloads: ["matrices"] },
  "KaTeX": {
    workloads: ["core", "matrices"],
    browser: 'import { renderToString } from "katex"; globalThis.convert = (source) => renderToString(source, { output: "mathml", displayMode: true, trust: false });',
    async load() {
      const { renderToString } = await import("katex");
      return (source) => renderToString(source, { output: "mathml", displayMode: true, trust: false });
    },
  },
  "MathJax": {
    workloads: ["core", "matrices"],
    browser: 'import { createMathML } from "./benchmarks/mathjax.mjs"; globalThis.convert = createMathML();',
    async load() {
      const { createMathML } = await import("./mathjax.mjs");
      return createMathML();
    },
  },
};
