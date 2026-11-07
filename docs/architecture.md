# Architecture and reference libraries

MiniMath implements the Mini math engine as `packages/math` in a pnpm TypeScript workspace. Its ESM root has no DOM dependency, framework, other Mini engine, or required shared package. The integration adapter is a separate import. It accepts unknown embed data, validates the supported option, and intersects host resource limits with the engine defaults. It propagates cancellation.

## Rendering path

1. Enforce input bounds and scan tokens on demand. Source locations are UTF-16 offsets. The optional macro module scans unexpanded arguments, substitutes tokens without merging control words, and injects bounded expansion frames. Declarations and expansion state are owned by a single render.
2. Build a discriminated math AST. The core grammar handles atoms, fractions, roots, fences and scripts. Advanced environment parsing supplies table and fenced table nodes through an internal hook.
3. Emit MathML and readable fallback from the same AST. The browser adapter can mirror the MathML emission into namespaced DOM nodes in one traversal.
4. When the SVG subpath is selected, convert the AST to positioned boxes using local deterministic advance and vertical metrics. Emit SVG from those boxes and preserve MathML as the companion semantic representation.
5. The browser view owns its wrapper and generation number. Optional grammar loading is asynchronous. The most recent generation owns the commit, and disposal invalidates pending work. Rendering keeps no process-wide expression or layout cache.

## Library review

| Reference | Design studied | MiniMath decision |
| --- | --- | --- |
| [KaTeX](https://katex.org/) and [rendering options](https://katex.org/docs/options) | Synchronous browser/SSR rendering, MathML-only and combined modes, trust controls and macro expansion limits. | Keep deterministic synchronous rendering and explicit bounds. Use the browser's native MathML layout for the default path and a narrower grammar without URL- or HTML-generating commands. |
| [MathJax components](https://docs.mathjax.org/en/latest/web/components/misc.html) and [direct MathML conversion](https://docs.mathjax.org/en/v4.1/server/direct.html) | Separate TeX input, MathML tree and output, optional components, and direct conversion that bypasses an output renderer. | Keep the AST and backends separate. Use standard ESM subpaths and dynamic imports for optional code, with no loader or global engine registry. |
| [W3C MathML Core](https://www.w3.org/TR/mathml-core/) | Native layout and semantic markup for fractions, operators, scripts, and tabular math. | Use one MathML representation for both default visual layout and semantics. Ship the alternate SVG layout and the alignment stylesheet separately. |

The benchmark uses KaTeX and MathJax in MathML-only configurations and records their exact versions. The engines implement different TeX profiles and output different markup. The results compare common fixtures under a specified workload. See [measurements and methodology](benchmarks.md).
