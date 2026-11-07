import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import { createMathML } from "./mathjax.mjs";

export function createMacroMathML() {
  return createMathML(["base", "ams", "newcommand"]);
}
