# Benchmarks

Linux x64, AMD EPYC 9V74 80-Core Processor, Node.js 24.22.1, esbuild 0.28.2. Comparator versions are KaTeX 0.19.1 and MathJax 4.1.3.

Run `pnpm bench` for server and bundle measurements or `pnpm bench --browser` to include Chromium. The runner emits raw results as JSON. The [shared fixtures](../benchmarks/fixtures.mjs) contain eight core expressions, six matrix expressions, and six parameterized macro expressions that all three engines accept.

## Bundle size

Values are bytes. Each row is a separate minified ESM browser build targeting ES2022. Initial bytes include the entry and its static imports. Deferred bytes count the dynamic chunk. Each emitted file is compressed independently with gzip level 9 and Brotli. The MathML-only comparisons use no external CSS or fonts. MiniMath's optional alignment stylesheet is listed separately.

| Consumer import | Initial raw | Initial gzip | Initial Brotli | Deferred raw | Deferred gzip | Deferred Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniMath parse only | 9,542 | 3,820 | 3,370 | — | — | — |
| MiniMath MathML | 12,349 | 4,848 | 4,296 | — | — | — |
| MiniMath advanced MathML | 19,707 | 7,333 | 6,516 | — | — | — |
| MiniMath lazy advanced | 12,661 | 5,058 | 4,481 | 7,393 | 2,948 | 2,635 |
| MiniMath browser mount | 13,481 | 5,526 | 4,878 | 7,393 | 2,949 | 2,636 |
| MiniMath SVG + MathML | 17,144 | 6,941 | 6,141 | — | — | — |
| MiniMath advanced SVG + MathML | 24,495 | 9,434 | 8,393 | — | — | — |
| MiniMath alignment CSS | 78 | 69 | 59 | — | — | — |
| KaTeX MathML | 267,681 | 76,951 | 63,916 | — | — | — |
| MathJax MathML | 249,665 | 74,137 | 60,394 | — | — | — |
| MathJax with macros MathML | 249,718 | 74,145 | 60,433 | — | — | — |

## Server rendering and memory

Median of seven fresh Node.js processes per row. Import time starts inside the process and covers loading and renderer setup. First render is timed separately. Warm rendering times 12,000 expressions after 3,000 warm-up renders. Each library emits MathML in display mode. MiniMath also builds readable text. KaTeX uses its `mathml` output with trust disabled. MathJax uses its direct TeX base and AMS modules and native MathML serialization. The macro workload also loads its newcommand module. Output bytes count only the MathML markup for one pass through the corpus.

Heap columns use V8 heap-used readings after three explicit garbage collections. Loaded heap is the increase from before import to after the first render. Warm heap change is the post-batch difference against the warmed state, with output strings released. The warm deltas include V8 and library state changes and can be negative. These readings measure live JS heap in this harness. Peak memory and process RSS are outside the measurement.

| Renderer and workload | Import and setup (ms) | First render (ms) | Warm (µs/expression) | Loaded heap (KiB) | Warm heap change (KiB) | Output (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniMath (core) | 5.43 | 1.76 | 11.20 | 326 | -2 | 2,683 |
| MiniMath advanced (matrices) | 6.36 | 1.74 | 12.41 | 378 | -45 | 2,474 |
| MiniMath advanced (macros) | 6.05 | 2.34 | 15.74 | 377 | -34 | 1,279 |
| KaTeX (core) | 14.82 | 2.44 | 25.61 | 2,611 | -16 | 3,464 |
| KaTeX (matrices) | 14.11 | 3.73 | 34.12 | 2,660 | +159 | 4,786 |
| KaTeX (macros) | 14.07 | 2.67 | 25.30 | 2,599 | +76 | 2,366 |
| MathJax (core) | 65.17 | 6.48 | 343.04 | 3,026 | +325 | 5,875 |
| MathJax (matrices) | 62.82 | 7.54 | 379.64 | 3,046 | -1,031 | 5,386 |
| MathJax with macros (macros) | 60.83 | 6.33 | 241.93 | 2,999 | +322 | 3,004 |

## Chromium rendering

Chromium 153.0.8010.0. Each timed batch serializes 256 display expressions, inserts the generated markup into one container, and forces layout by reading its geometry. Median of seven batches after three warm-ups. The same insertion path is used for all libraries. MiniMath’s optional DOM adapter is covered by the browser tests. This benchmark measures the string-to-layout path.

| Renderer and workload | Median per 256 expressions (ms) |
| --- | ---: |
| MiniMath (core) | 33.40 |
| MiniMath advanced (matrices) | 42.10 |
| MiniMath advanced (macros) | 18.80 |
| KaTeX (core) | 39.60 |
| KaTeX (matrices) | 48.60 |
| KaTeX (macros) | 24.80 |
| MathJax (core) | 102.40 |
| MathJax (matrices) | 114.10 |
| MathJax with macros (macros) | 67.90 |

## Macro update and syntax coverage

The previous core MathML build was 4,823 bytes gzip. The updated build is 4,848 bytes gzip. In the split build, the deferred advanced chunk grew from 962 to 2,948 bytes gzip.

The following probes record whether each configured engine emitted MathML without a parse error. The shared macro timing corpus includes required arguments, delimited definitions, aliases, and a matrix inside a macro. Optional defaults are probed separately so the timing corpus stays comparable.

| Syntax probe | MiniMath advanced | KaTeX | MathJax with macros |
| --- | --- | --- | --- |
| Optional default in newcommand | Accepted | Rejected | Accepted |
| Eager edef definition | Rejected | Accepted | Rejected |
| Blackboard bold | Rejected | Accepted | Accepted |
| Binomial coefficients | Rejected | Accepted | Accepted |
| Labeled arrows | Rejected | Accepted | Accepted |
| Arrays with column specifications | Rejected | Accepted | Accepted |
| Equation tags | Rejected | Accepted | Accepted |

The results apply to these fixtures and configurations on this machine. MiniMath implements a narrower TeX profile. Feature coverage and output markup vary across engines.
