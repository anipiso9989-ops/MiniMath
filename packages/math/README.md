# @mini/math

MiniMath renders TeX-like mathematics in Node.js 20+ and modern browsers. The package is ESM with TypeScript declarations and zero runtime dependencies.

## API

| Import | Exports |
| --- | --- |
| `@mini/math` | `parse(source, options?)` returns a typed math AST. `render(source, options?)` returns MathML and readable text. |
| `@mini/math/advanced` | `parseAdvanced` and `renderAdvanced` add matrices, equation environments, and macros. |
| `@mini/math/visual` | `renderVisual` returns SVG, MathML, readable text, and layout metrics. |
| `@mini/math/advanced/visual` | `renderAdvancedVisual` adds the advanced grammar to the SVG renderer. |
| `@mini/math/browser` | `mount(container, source, options?)` owns a browser view. |
| `@mini/math/integration` | `integration` exposes the versioned MiniRender protocol adapter for the core renderer. |
| `@mini/math/styles.css` | Explicit left and right cell alignment rules for MathML cases and aligned equations. |

All synchronous functions return `{ ok: true, artifact, diagnostics: [] }` on success or `{ ok: false, diagnostics }` on input errors. Diagnostics report a stable code and, where available, a half-open UTF-16 range in the original string. Invalid application configuration, such as a negative resource limit, throws. `display: true` requests block MathML and display-style SVG layout. The default is inline math.

```ts
import { render } from "@mini/math";

const result = render(String.raw`\frac{1}{1+x^2}`);
if (result.ok) {
  console.log(result.artifact.mathml); // Serialized MathML.
  console.log(result.artifact.text);   // Readable plain text.
}
```

Load an extension when the application needs it.

```ts
const { renderAdvanced } = await import("@mini/math/advanced");

const matrix = renderAdvanced(String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`, {
  display: true,
});
const equation = renderAdvanced(String.raw`A=\disk`, {
  macros: { [String.raw`\disk`]: String.raw`\pi r^2` },
});
```

For MathML cell alignment, import `@mini/math/styles.css` from your bundler or serve it as an external stylesheet. The core renderer and browser adapter run without stylesheet injection.

```ts
import { mount } from "@mini/math/browser";

const view = mount(document.querySelector("#formula")!, "x^2+y^2=r^2");
await view.ready;
await view.update(String.raw`r=\sqrt{x^2+y^2}`);
// Call view.dispose() when the owning component unmounts.
```

Mount replaces the container's children with a view it owns. Enable `advanced: true` to load the advanced grammar on the first render. `ready` and `update` resolve to render results or `undefined` for stale or disposed work. Abort leaves the last committed view in place. On syntax errors, the view displays the diagnostic message as text.

## Syntax profile

| Form | Supported syntax |
| --- | --- |
| Atoms and grouping | Unicode letters and combining marks, ASCII integers and decimals, Unicode operators and punctuation, and braced groups. Spaces are ignored in math mode. `%` starts a line comment. |
| Equations and scripts | Relations such as `=`, `<`, `\leq`, `\ne`, and `\approx`. Subscripts and superscripts use `_` and `^`. Apostrophes form prime superscripts. |
| Fractions and roots | `\frac{a}{b}`, `\sqrt{x}`, and `\sqrt[n]{x}`. A single token can replace a braced argument, as in `\frac12` or `x^2`. Brace multi-token arguments. |
| Delimiters | Literal parentheses, brackets, and bars. `\left` and `\right` make delimiters stretch. A dot after either command makes that side invisible. |
| Symbols and named operators | Greek letters and variants, common set and logical operators, arrows, `\sum`, `\prod`, `\int`, `\lim`, and named functions such as `\sin`, `\log`, and `\det`. The command tables are in [symbols.ts](src/parse/symbols.ts). |
| Prose and spacing | `\text{...}`, `\,`, `\:`, `\;`, backslash-space, `\quad`, and `\qquad`. Inside text, backslash escapes braces, backslash, space, dollar, percent, ampersand, hash, and underscore. |
| Advanced environments | `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `aligned`, `align`, `align*`, `cases`, `equation`, and `equation*`. Separate cells with `&` and rows with two backslashes. Tables are rectangular and cases have two columns. Empty cells and a final row separator are accepted. Equations are unnumbered. |
| Advanced macros | Application-supplied, zero-argument replacements keyed by new backslash commands made of ASCII letters. Replacements can call other macros. Built-ins take precedence through configuration validation. |

Pass the expression body directly. Surrounding `$` or `$$`, arbitrary TeX packages, equation numbering and references, and parameterized macros are outside this profile. The package typesets equations and matrices. It takes TeX-like source and emits presentation MathML.

## Accessibility and security

MathML is the default visual and semantic representation. Its layout and speech depend on the browser, math fonts, and assistive technology. The browser view uses the readable text artifact if native MathML is unavailable or `textOnly: true` is supplied. The SVG backend uses an accessible title and returns the companion MathML for contexts that can expose richer semantics. The SVG metrics are deterministic approximations in em units. Ascent is the distance above the baseline, descent is the distance below it, and the SVG adds 0.1 em of padding on each side. Actual glyph shapes depend on local fonts.

The renderer encodes text in generated XML and emits a fixed set of tags and attributes. Browser mounting uses namespaced DOM elements and text nodes. Math source cannot add URLs, HTML, styles, event handlers, or network resources. Display the `text` artifact as text. Options and macro definitions are application configuration.

| Limit | Default | Counts |
| --- | ---: | --- |
| `maxInputBytes` | 16,384 | UTF-8 bytes in the original input. The same ceiling applies separately to the sum of macro replacement bytes. |
| `maxNodes` | 4,096 | AST nodes, including structural rows. |
| `maxDepth` | 64 | Recursive syntax nesting, with root at depth zero. |
| `maxOutputBytes` | 262,144 | Total UTF-8 bytes of serialized MathML, readable text, and SVG if requested. |
| `maxExpansions` | 128 | Macro invocations per expression. |

Override individual ceilings with `options.limits`. `options.signal` is checked before and during parsing and after a pending browser module load. Core calls are synchronous. Browser updates discard results superseded during lazy loading.
