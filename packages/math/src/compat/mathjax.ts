import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { STATE } from "@mathjax/src/js/core/MathItem.js";
import type { MmlNode } from "@mathjax/src/js/core/MmlTree/MmlNode.js";
import { SerializedMmlVisitor } from "@mathjax/src/js/core/MmlTree/SerializedMmlVisitor.js";
import { HTMLHandler } from "@mathjax/src/js/handlers/html/HTMLHandler.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import TexError from "@mathjax/src/js/input/tex/TexError.js";
import { checkAbort, fail, run } from "../model/limits.js";
import type { RenderOptions, Result } from "../model/types.js";
import { extensions } from "./mathjax-packages.js";
import type { MathJaxExtension } from "./mathjax-packages.js";
import { checkedMathML } from "./output.js";
import type { CompatibleArtifact } from "./output.js";

export type { MathJaxExtension } from "./mathjax-packages.js";

export interface MathJaxOptions {
  readonly packages?: readonly MathJaxExtension[];
  readonly tags?: "none" | "ams" | "all";
  readonly macros?: Readonly<Record<string, string | readonly [string, number, ...string[]]>>;
}

class BrowserMathMLVisitor extends SerializedMmlVisitor {
  override visitDefault(node: MmlNode, space: string): string {
    if (node.kind !== "mlabeledtr") return super.visitDefault(node, space);
    // MathML Core uses ordinary table rows. Put the equation label in the final cell.
    const [label, ...cells] = node.childNodes;
    const markup = [...cells, label].map((cell) => this.visitNode(cell, space + "  ")).join("\n");
    return `${space}<mtr>\n${markup}\n${space}</mtr>`;
  }
}

export async function createMathJaxRenderer(config: MathJaxOptions = {}): Promise<
  (source: string, options?: RenderOptions) => Result<CompatibleArtifact>
> {
  const selected = [...new Set(["ams", "configmacros", "newcommand",
    ...(config.packages ?? ["amscd", "boldsymbol", "braket", "cancel", "color", "enclose", "mhchem", "textmacros", "unicode", "verb"])] as const)];
  for (const name of selected) {
    if (!Object.hasOwn(extensions, name)) throw new TypeError("Unknown or disallowed MathJax extension.");
  }
  await Promise.all(selected.map((name) => extensions[name]()));
  const proof = selected.includes("bussproofs") ? await import("@mathjax/src/js/output/svg.js") : undefined;
  const handler = new HTMLHandler(liteAdaptor());
  const visitor = new BrowserMathMLVisitor();

  return (source, options = {}) => run(source, options, (limits) => {
    // TeX definitions and labels belong to one render.
    const tex = new TeX({
      packages: ["base", ...selected],
      macros: { ...config.macros },
      tags: config.tags ?? "none",
      maxBuffer: limits.maxInputBytes,
      maxMacros: limits.maxExpansions,
      maxTemplateSubtitutions: limits.maxExpansions,
      formatError(_jax: unknown, error: unknown) { throw error; },
    });
    const document = handler.create("", {
      InputJax: tex,
      ...(proof && { OutputJax: new proof.SVG({ fontCache: "none" }) }),
      compileError(_document: unknown, _math: unknown, error: unknown) { throw error; },
    });
    let markup: string;
    try {
      const root = document.convert(source, { display: options.display === true, end: STATE.CONVERT });
      markup = visitor.visitTree(root);
    } catch (error) {
      if (error instanceof RangeError) return fail("depth-limit", "The expression exceeded MathJax's nesting limit.");
      if (!(error instanceof TexError)) throw error;
      if (/MaxMacro|MaxBuffer|MaxSubstitution/.test(error.id)) return fail("expansion-limit", error.message);
      return fail("mathjax-syntax", error.message);
    }
    checkAbort(options.signal);
    return checkedMathML(source, markup, "mathjax", limits);
  });
}
