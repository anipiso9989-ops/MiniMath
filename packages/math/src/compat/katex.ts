import { ParseError, renderToString } from "katex";
import type { KatexOptions } from "katex";
import "katex/contrib/mhchem";
import { checkAbort, fail, run } from "../model/limits.js";
import type { RenderOptions, Result } from "../model/types.js";
import { checkedMathML } from "./output.js";
import type { CompatibleArtifact } from "./output.js";

export interface KaTeXOptions extends RenderOptions {
  readonly macros?: Readonly<NonNullable<KatexOptions["macros"]>>;
}

export function renderKaTeX(source: string, options: KaTeXOptions = {}): Result<CompatibleArtifact> {
  return run(source, options, (limits) => {
    let blocked = false;
    let markup: string;
    try {
      markup = renderToString(source, {
        output: "mathml",
        displayMode: options.display === true,
        throwOnError: true,
        strict: "ignore",
        macros: Object.assign(Object.create(null), options.macros),
        trust() { blocked = true; return false; },
        maxExpand: limits.maxExpansions,
        maxSize: 32,
      });
    } catch (error) {
      if (error instanceof RangeError) return fail("depth-limit", "The expression exceeded KaTeX's nesting limit.");
      if (!(error instanceof ParseError)) throw error;
      if (error.message.includes("Too many expansions")) return fail("expansion-limit", "Macro expansion limit exceeded.");
      const start = error.position;
      return fail("katex-syntax", error.message, typeof start === "number" ? [start, start + (error.length ?? 0)] : undefined);
    }
    if (blocked) fail("blocked-command", "A command requires access to external resources or HTML attributes.");
    checkAbort(options.signal);
    if (/\bclass\s*=\s*"mml-eqn-num"/.test(markup)) {
      fail("compat-output", "Use the MathJax compatibility renderer for portable equation tags.");
    }
    return checkedMathML(source, markup, "katex", limits);
  });
}
