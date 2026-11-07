import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { SerializedMmlVisitor } from "@mathjax/src/js/core/MmlTree/SerializedMmlVisitor.js";
import { STATE } from "@mathjax/src/js/core/MathItem.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";

export function createMathML(packages = ["base", "ams"]) {
  RegisterHTMLHandler(liteAdaptor());
  const tex = new TeX({ packages, formatError(_jax, error) { throw error; } });
  const document = mathjax.document("", { InputJax: tex });
  const visitor = new SerializedMmlVisitor();
  return (source) => visitor.visitTree(document.convert(source, { display: true, end: STATE.CONVERT }));
}
