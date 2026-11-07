# @mini/math

MiniMath renders TeX-like mathematics in Node.js 20+ and modern browsers. The package is ESM with TypeScript declarations and zero runtime or peer dependencies.

## API

| Import | Exports |
| --- | --- |
| `@mini/math` | `parse(source, options?)` returns a typed math AST. `render(source, options?)` returns MathML and readable text. |
| `@mini/math/advanced` | `parseAdvanced` and `renderAdvanced` add arrays, equations, fonts, accents, macros, and specialized notation. |
| `@mini/math/document` | `renderDocument` numbers equations and resolves labels and references across expressions. |
| `@mini/math/visual` | `renderVisual` returns SVG, MathML, readable text, and layout metrics. |
| `@mini/math/advanced/visual` | `renderAdvancedVisual` adds the advanced grammar to the SVG renderer. |
| `@mini/math/browser` | `mount(container, source, options?)` owns a browser view. |
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
| Advanced environments | `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `aligned`, `align`, `align*`, `cases`, `equation`, and `equation*`. Separate cells with `&` and rows with two backslashes. Tables are rectangular and cases have two columns. Empty cells and a final row separator are accepted. Equations are unnumbered by default. |
| Advanced macros | Configured macros and source declarations support up to nine arguments, a first optional argument with a default, nested calls, and repeated or reordered parameters. |

Pass the expression body directly. The core parser supports the base forms above. Use the advanced and document entry points for the forms below.

## Advanced notation

| Form | Examples and scope |
| --- | --- |
| Fonts, accents, and labeled arrows | `\mathbf`, `\mathrm`, `\mathcal`, `\mathfrak`, `\widehat`, `\overline`, `\underline`, `\operatorname`, `\xrightarrow[below]{above}`, and related arrow commands. |
| Style and placement | `\mathchoice`, `\displaystyle`, `\scriptstyle`, `\genfrac`, `\over`, `\atop`, `\choose`, `\limits`, `\sideset`, `\prescript`, `\raisebox`, `\rule`, and `\phantom`. |
| Color and enclosure | Named, hexadecimal, and RGB colors, `\boxed`, `\enclose`, `\cancel`, and `\cancelto`. SVG draws the enclosure geometry with local font metrics. |
| Arrays and equations | `array` with `l`, `c`, `r`, vertical rules, and `*{count}{columns}` repetitions, plus `\hline` and `\hdashline`. Environments include `align`, `alignat`, `gather`, `multline`, `split`, `cases`, and matrix variants. Import the stylesheet for alignment and rules in browser MathML. |
| Specialized notation | Chemical formulas and reactions with `\ce`, physical units with `\pu`, common physics derivatives and bra-ket notation, AMS `CD` diagrams, and elementary `prooftree` inferences. |

The source command tables are in [notation.ts](src/features/notation.ts), [science.ts](src/features/science.ts), and [environments.ts](src/features/environments.ts). The chemistry, unit, and proof parsers implement their documented syntax profiles.

## Equation numbering and references

```ts
import { renderDocument } from "@mini/math/document";

const result = renderDocument([
  { source: String.raw`\eqref{energy}` },
  { source: String.raw`\begin{equation}E=mc^2\label{energy}\end{equation}`, display: true },
], { numbering: "ams", idPrefix: "paper-" });

if (result.ok) {
  // Insert the artifacts in the same document so the fragment link can resolve.
  console.log(result.artifact.entries.map((entry) => entry.mathml));
}
```

`numbering: "none"` keeps explicit tags only, `"ams"` numbers the unstarred AMS environments, and `"all"` also numbers plain display expressions. Use `\tag`, `\tag*`, `\notag`, `\label`, `\ref`, and `\eqref` in source. Explicit tags do not advance the counter. Use a distinct `idPrefix` for each set of formulas on the same page. The renderer resolves forward references, returns the label map, and reports errors with a zero-based entry index. Input, output, node, and expansion limits apply across the document.

## Parameterized macros

Keys in `options.macros` are new backslash commands made of ASCII letters. String replacements infer the argument count from the highest parameter marker. Use the tuple `[replacement, argumentCount, defaultFirstArgument?]` for explicit arity and an optional default. Required arguments accept a braced group or a single token. Write `##` to pass a literal parameter marker into a nested definition.

Source supports `\newcommand`, `\renewcommand`, `\providecommand`, `\def`, `\gdef`, `\edef`, `\xdef`, and `\let`. Eager definitions expand their replacements immediately, with `\noexpand` available to preserve a token. `\newenvironment` defines scoped opening and closing code. `\expandafter` and `\csname` use the same expansion budget. For example, `\def\swap(#1,#2){(#2,#1)}\swap(a,b)` renders `(b,a)`. Braces protect delimiters inside an argument. Definitions are local to their group or environment. Global definitions persist through the current expression or document render. `\let` captures a command's current definition. Built-ins are protected and renders keep separate definition state.

## Accessibility and security

MathML is the default visual and semantic representation. Its layout and speech depend on the browser, math fonts, and assistive technology. The browser view uses the readable text artifact if native MathML is unavailable or `textOnly: true` is supplied. The SVG backend uses an accessible title and returns the companion MathML for contexts that can expose richer semantics. The SVG metrics are deterministic approximations in em units. Ascent is the distance above the baseline, descent is the distance below it, and the SVG adds 0.1 em of padding on each side. Actual glyph shapes depend on local fonts.

The renderer encodes text in generated XML and emits a fixed set of tags and attributes. Browser mounting uses namespaced DOM elements and text nodes. The engine rejects arbitrary HTML, URLs, inline CSS, and event handlers. Document references create validated same-page fragment links. Display the `text` artifact as text. Macro values supplied through options are application configuration. Declarations in source use the same input and expansion limits.

| Limit | Default | Counts |
| --- | ---: | --- |
| `maxInputBytes` | 16,384 | UTF-8 bytes in the original input. The same ceiling applies separately to the sum of macro replacement bytes. |
| `maxNodes` | 4,096 | AST nodes, including structural rows. |
| `maxDepth` | 64 | Recursive syntax nesting, with root at depth zero. |
| `maxOutputBytes` | 262,144 | Total UTF-8 bytes of serialized MathML, readable text, and SVG if requested. |
| `maxExpansions` | 128 | Macro invocations and declarations per expression. |

Macro template scanning and substitution also have a work budget proportional to the input ceiling. Override individual ceilings with `options.limits`. `options.signal` is checked before and during parsing and after a pending browser module load. Core calls are synchronous. Browser updates discard results superseded during lazy loading.
