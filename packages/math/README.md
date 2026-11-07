# @mini/math

MiniMath renders TeX-like mathematics in Node.js 20+ and modern browsers. The package is ESM with TypeScript declarations. Native rendering has zero runtime dependencies. The optional compatibility entry points use separately installed peers.

## API

| Import | Exports |
| --- | --- |
| `@mini/math` | `parse(source, options?)` returns a typed math AST. `render(source, options?)` returns MathML and readable text. |
| `@mini/math/advanced` | `parseAdvanced` and `renderAdvanced` add matrices, equation environments, and parameterized macros. |
| `@mini/math/visual` | `renderVisual` returns SVG, MathML, readable text, and layout metrics. |
| `@mini/math/advanced/visual` | `renderAdvancedVisual` adds the advanced grammar to the SVG renderer. |
| `@mini/math/browser` | `mount(container, source, options?)` owns a browser view. |
| `@mini/math/compat` | `createCompatibleRenderer` tries the native engine first and loads compatibility engines on demand. |
| `@mini/math/compat/katex` | `renderKaTeX` selects the KaTeX parser and returns checked MathML. |
| `@mini/math/compat/mathjax` | `createMathJaxRenderer` selects a MathJax TeX package profile and returns a synchronous MathML renderer after setup. |
| `@mini/math/integration` | `integration` exposes the versioned MiniRender protocol adapter for the core renderer. |
| `@mini/math/styles.css` | Explicit left and right cell alignment rules for MathML cases and aligned equations. |

Synchronous render functions return `{ ok: true, artifact, diagnostics: [] }` on success or `{ ok: false, diagnostics }` on input errors. Diagnostics report a stable code and, where available, a half-open UTF-16 range in the original string. Invalid application configuration, such as a negative resource limit, throws. `display: true` requests block MathML and display-style SVG layout. The default is inline math.

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
const equation = renderAdvanced(String.raw`A=\disk{r}`, {
  macros: { [String.raw`\disk`]: String.raw`\pi {#1}^2` },
});
const indexed = renderAdvanced(String.raw`\at{i}+\at[y]{j}`, {
  macros: { [String.raw`\at`]: ["#1_{#2}", 2, "x"] },
});
const definedInTeX = renderAdvanced(String.raw`
  \newcommand{\sq}[1]{{#1}^2}
  \sq{x+y}
`);
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
| Fractions and roots | `\frac{a}{b}`, `\sqrt{x}`, and `\sqrt[n]{x}`. Use `\binom{n}{k}` for binomials and `\dfrac`, `\tfrac`, `\dbinom`, or `\tbinom` to force display or text style. A single token can replace a braced argument, as in `\frac12` or `x^2`. Brace multi-token arguments. |
| Delimiters | Literal parentheses, brackets, and bars. `\left` and `\right` make delimiters stretch. A dot after either command makes that side invisible. |
| Symbols and named operators | Greek letters and variants, blackboard bold for Latin letters and digits via `\mathbb`, common set and logical operators, arrows, `\sum`, `\prod`, `\int`, `\lim`, and named functions such as `\sin`, `\log`, and `\det`. The command tables are in [symbols.ts](src/parse/symbols.ts). |
| Prose and spacing | `\text{...}`, `\,`, `\:`, `\;`, backslash-space, `\quad`, and `\qquad`. Inside text, backslash escapes braces, backslash, space, dollar, percent, ampersand, hash, and underscore. |
| Advanced environments | `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `aligned`, `align`, `align*`, `cases`, `equation`, and `equation*`. Separate cells with `&` and rows with two backslashes. Tables are rectangular and cases have two columns. Empty cells and a final row separator are accepted. Equations are unnumbered. |
| Advanced macros | Configured macros and source declarations support up to nine arguments, a first optional argument with a default, nested calls, and repeated or reordered parameters. |

The native profile takes the expression body directly. Surrounding `$` or `$$`, arbitrary TeX packages and equation numbering and references are outside this profile. The package typesets equations and matrices. It takes TeX-like source and emits presentation MathML.

## Broader LaTeX coverage

For automatic routing, install both optional peers. The version pair below is used in tests and benchmarks.

```sh
npm install katex@0.19.1 @mathjax/src@4.1.3
```

```ts
import { createCompatibleRenderer } from "@mini/math/compat";

const render = createCompatibleRenderer();
const result = await render(String.raw`\begin{equation}x=1\tag{5}\end{equation}`, { display: true });
if (result.ok) {
  console.log(result.artifact.renderer); // mathjax
  console.log(result.artifact.mathml);
}
```

The router first attempts the native advanced parser. KaTeX loads after a native syntax miss and MathJax loads if KaTeX cannot render the expression. Limits, cancellation, and blocked commands end the attempt. Bundlers with ESM code splitting fetch the peer code when that renderer is first needed. Direct adapter imports let you install only the chosen peer and choose its parser for every expression. Use the MathJax adapter to select packages such as `physics`, `mathtools`, or `bussproofs`, and to configure automatic numbering.

```ts
import { createMathJaxRenderer } from "@mini/math/compat/mathjax";

const render = await createMathJaxRenderer({ packages: ["physics", "mhchem"], tags: "ams" });
const result = render(String.raw`\qty(x)\quad\ce{H2O}`);
```

Each expression runs through one parser. The default profiles cover the demonstrated gaps, and direct adapters expose additional grammar through installed packages. Compatibility output is checked MathML with the source as plain-text fallback. The original engines' HTML/SVG styling, document-wide equation numbering state, arbitrary HTML, URLs, and input-triggered package loading are outside the compatibility surface. Imports and configured package loads can reject if a peer or chunk is unavailable. Use the alignment stylesheet for MathML table alignment in browsers.

## Parameterized macros

Keys in `options.macros` are new backslash commands made of ASCII letters. String replacements infer the argument count from the highest parameter marker. Use the tuple `[replacement, argumentCount, defaultFirstArgument?]` for explicit arity and an optional default. Required arguments accept a braced group or a single token. Write `##` to pass a literal parameter marker into a nested definition.

Source supports `\newcommand`, `\renewcommand`, `\providecommand`, `\def`, `\gdef`, and `\let`. For example, `\def\swap(#1,#2){(#2,#1)}\swap(a,b)` renders `(b,a)`. Braces protect delimiters inside an argument. Definitions are local to their group or environment. `\gdef` makes a definition available for the rest of the current render. `\let` captures a command's current definition. Built-ins are protected and renders keep separate definition state.

## Accessibility and security

MathML is the default visual and semantic representation. Its layout and speech depend on the browser, math fonts, and assistive technology. The browser view uses the readable text artifact if native MathML is unavailable or `textOnly: true` is supplied. The SVG backend uses an accessible title and returns the companion MathML for contexts that can expose richer semantics. The SVG metrics are deterministic approximations in em units. Ascent is the distance above the baseline, descent is the distance below it, and the SVG adds 0.1 em of padding on each side. Actual glyph shapes depend on local fonts.

The renderer encodes text in generated XML and emits a fixed set of tags and attributes. Browser mounting uses namespaced DOM elements and text nodes. Math source cannot add URLs, HTML, inline CSS, event handlers, or network resources. Display the `text` artifact as text. Macro values supplied through options are application configuration. Declarations in source use the same input and expansion limits.

| Limit | Default | Counts |
| --- | ---: | --- |
| `maxInputBytes` | 16,384 | UTF-8 bytes in the original input. The same ceiling applies separately to the sum of macro replacement bytes. |
| `maxNodes` | 4,096 | AST nodes, including structural rows. |
| `maxDepth` | 64 | Recursive syntax nesting, with root at depth zero. |
| `maxOutputBytes` | 262,144 | Total UTF-8 bytes of serialized MathML, readable text, and SVG if requested. |
| `maxExpansions` | 128 | Macro invocations and declarations per expression. |

Macro template scanning and substitution also have a work budget proportional to the input ceiling. Override individual ceilings with `options.limits`. `options.signal` is checked before and during parsing and after a pending browser module load. Core calls are synchronous. Browser updates discard results superseded during lazy loading.
