# Bundle size and syntax coverage

Linux x64, Node.js 24.22.1, esbuild 0.28.2. The reference fixtures pin KaTeX 0.19.1 and MathJax 4.1.3.

Run `pnpm bench --size-only --native-only` to measure the package by itself. For the comparison and syntax audit, run `npm ci --prefix benchmarks/reference` followed by `pnpm bench --size-only`. The runner emits JSON. The separate `pnpm bench --browser` command also measures server throughput, heap use, and browser rendering and layout.

## Bundle size

Values are bytes. Each row is a separate minified ESM browser build targeting ES2022. Initial bytes include the entry and all static imports. Deferred bytes are separately fetched JavaScript chunks. Each file is compressed independently. The KaTeX and MathJax builds are MathML-only and exclude fonts and CSS.

| Consumer import | Initial raw | Initial gzip | Initial Brotli | Deferred raw | Deferred gzip | Deferred Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniMath parse only | 13,621 | 5,251 | 4,647 | — | — | — |
| MiniMath MathML | 20,511 | 7,453 | 6,634 | — | — | — |
| MiniMath advanced MathML | 62,954 | 21,671 | 19,245 | — | — | — |
| MiniMath lazy advanced | 20,893 | 7,689 | 6,865 | 42,425 | 15,157 | 13,570 |
| MiniMath document | 63,781 | 22,018 | 19,487 | — | — | — |
| MiniMath browser mount | 21,781 | 8,189 | 7,291 | 42,425 | 15,157 | 13,600 |
| MiniMath SVG + MathML | 29,632 | 10,772 | 9,601 | — | — | — |
| MiniMath advanced SVG + MathML | 72,075 | 25,072 | 22,146 | — | — | — |
| MiniMath alignment CSS | 742 | 246 | 198 | — | — | — |
| KaTeX MathML | 267,681 | 76,947 | 63,859 | — | — | — |
| MathJax MathML | 249,687 | 74,149 | 60,414 | — | — | — |
| MathJax with macros MathML | 249,740 | 74,157 | 60,450 | — | — | — |

## Syntax probes

The [probe corpus](../benchmarks/fixtures.mjs) records whether each renderer emitted MathML without a parse error. The reference profiles enable the extensions used by the fixtures where available. The [test suite](../packages/math/tests) also checks the emitted structure, document references, and browser layout for specific cases.

| Probe | MiniMath native | KaTeX + mhchem | MathJax + selected extensions |
| --- | --- | --- | --- |
| Optional default in newcommand | Accepted | Rejected | Accepted |
| Eager edef definition | Accepted | Accepted | Rejected |
| Blackboard bold | Accepted | Accepted | Accepted |
| Binomial coefficients | Accepted | Accepted | Accepted |
| Labeled arrows | Accepted | Accepted | Accepted |
| Arrays with column specifications | Accepted | Accepted | Accepted |
| Equation tags | Accepted | Accepted | Accepted |
| Scope-dependent math choice | Accepted | Accepted | Accepted |
| Left subscripts and superscripts | Accepted | Rejected | Accepted |
| Custom environments | Accepted | Rejected | Accepted |
| Generalized fractions | Accepted | Accepted | Accepted |
| Box and spacing commands | Accepted | Accepted | Rejected |
| Reaction labels | Accepted | Accepted | Accepted |
| Physics derivative and delimiters | Accepted | Rejected | Accepted |
| Commutative diagrams | Accepted | Accepted | Accepted |
| Proof trees | Accepted | Rejected | Accepted |
| Sided operator scripts | Accepted | Rejected | Accepted |
| Cancellation with a target | Accepted | Rejected | Accepted |
| Custom MathML enclosures | Accepted | Rejected | Accepted |
| Infix fractions with explicit delimiters | Accepted | Rejected | Accepted |
| Interactive math tooltips | Rejected | Rejected | Accepted |
| Custom box padding and borders | Rejected | Rejected | Accepted |
| TeX character codes | Accepted | Accepted | Rejected |

The table is a sample of each grammar. Visual behavior, extension support, and complete command coverage require separate verification. The supported profiles are described in the [package guide](../packages/math/README.md).
