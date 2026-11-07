import { compatibility, extendedCoverage } from "../fixtures.mjs";

export async function measureCoverage() {
  const [{ renderAdvanced }, { renderToString }, { createMathML }, { SVG }] = await Promise.all([
    import("@mini/math/advanced"), import("katex"), import("./mathjax.mjs"), import("@mathjax/src/js/output/svg.js"),
  ]);
  await Promise.all([
    import("katex/contrib/mhchem"),
    import("@mathjax/src/js/input/tex/action/ActionConfiguration.js"),
    import("@mathjax/src/js/input/tex/bbox/BboxConfiguration.js"),
    import("@mathjax/src/js/input/tex/amscd/AmsCdConfiguration.js"),
    import("@mathjax/src/js/input/tex/bussproofs/BussproofsConfiguration.js"),
    import("@mathjax/src/js/input/tex/cancel/CancelConfiguration.js"),
    import("@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js"),
    import("@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js"),
    import("@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js"),
    import("@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js"),
    import("@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js"),
  ]);
  const mathjax = createMathML([
    "base", "action", "ams", "amscd", "bbox", "bussproofs", "cancel", "enclose", "mathtools", "mhchem", "newcommand", "physics",
  ], new SVG({ fontCache: "none" }));
  const renderers = {
    "MiniMath native": (source) => {
      const result = renderAdvanced(source, { display: true });
      return result.ok ? result.artifact.mathml : "";
    },
    "KaTeX + mhchem": (source) => renderToString(source, { output: "mathml", displayMode: true, trust: false }),
    "MathJax + selected extensions": mathjax,
  };
  return Object.fromEntries(Object.entries({ ...compatibility, ...extendedCoverage }).map(([label, source]) => {
    const outcomes = Object.fromEntries(Object.entries(renderers).map(([name, render]) => {
      try {
        const markup = render(source);
        return [name, markup.includes("<math") && !markup.includes("<merror")];
      } catch {
        return [name, false];
      }
    }));
    return [label, outcomes];
  }));
}
