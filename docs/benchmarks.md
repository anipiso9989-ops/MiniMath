# Benchmarks

Linux x64, AMD EPYC 9V74 80-Core Processor, Node.js 24.22.1, esbuild 0.28.2. Comparator versions are KaTeX 0.19.1 and MathJax 4.1.3.

Run `pnpm bench` for server and bundle measurements or `pnpm bench --browser` to include Chromium. The runner emits raw results as JSON. The [shared fixtures](../benchmarks/fixtures.mjs) contain eight core expressions, six matrix expressions, and six parameterized macro expressions that all three engines accept.

## Bundle size

Values are bytes. Each row is a separate minified ESM browser build targeting ES2022. Initial bytes include the entry and its static imports. Deferred bytes count the dynamic chunk. Each emitted file is compressed independently with gzip level 9 and Brotli. The MathML-only comparisons use no external CSS or fonts. MiniMath's optional alignment stylesheet is listed separately.

| Consumer import | Initial raw | Initial gzip | Initial Brotli | Deferred raw | Deferred gzip | Deferred Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniMath parse only | 10,492 | 4,219 | 3,720 | — | — | — |
| MiniMath MathML | 13,544 | 5,315 | 4,701 | — | — | — |
| MiniMath advanced MathML | 20,957 | 7,817 | 6,940 | — | — | — |
| MiniMath lazy advanced | 13,905 | 5,548 | 4,907 | 7,393 | 2,948 | 2,635 |
| MiniMath browser mount | 14,730 | 6,020 | 5,317 | 7,393 | 2,948 | 2,636 |
| MiniMath SVG + MathML | 18,385 | 7,422 | 6,597 | — | — | — |
| MiniMath advanced SVG + MathML | 25,788 | 9,927 | 8,792 | — | — | — |
| MiniMath alignment CSS | 78 | 69 | 59 | — | — | — |
| KaTeX MathML | 267,681 | 76,951 | 63,916 | — | — | — |
| MathJax MathML | 249,665 | 74,137 | 60,394 | — | — | — |
| MathJax with macros MathML | 249,718 | 74,145 | 60,433 | — | — | — |

## Server rendering and memory

Median of seven fresh Node.js processes per row. Import time starts inside the process and covers loading and renderer setup. First render is timed separately. Warm rendering times 12,000 expressions after 3,000 warm-up renders. Each library emits MathML in display mode. MiniMath also builds readable text. KaTeX uses its `mathml` output with trust disabled. MathJax uses its direct TeX base and AMS modules and native MathML serialization. The macro workload also loads its newcommand module. Output bytes count only the MathML markup for one pass through the corpus.

Heap columns use V8 heap-used readings after three explicit garbage collections. Loaded heap is the increase from before import to after the first render. Warm heap change is the post-batch difference against the warmed state, with output strings released. The warm deltas include V8 and library state changes and can be negative. These readings measure live JS heap in this harness. Peak memory and process RSS are outside the measurement.

| Renderer and workload | Import and setup (ms) | First render (ms) | Warm (µs/expression) | Loaded heap (KiB) | Warm heap change (KiB) | Output (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniMath (core) | 4.88 | 1.50 | 10.70 | 333 | +9 | 2,683 |
| MiniMath advanced (matrices) | 5.90 | 1.88 | 11.38 | 385 | -58 | 2,474 |
| MiniMath advanced (macros) | 6.01 | 2.49 | 16.32 | 384 | +31 | 1,279 |
| KaTeX (core) | 13.61 | 2.41 | 26.93 | 2,611 | -79 | 3,464 |
| KaTeX (matrices) | 14.39 | 3.80 | 33.71 | 2,660 | +71 | 4,786 |
| KaTeX (macros) | 14.47 | 2.64 | 25.46 | 2,599 | +76 | 2,366 |
| MathJax (core) | 60.68 | 5.52 | 338.13 | 3,026 | +325 | 5,875 |
| MathJax (matrices) | 68.55 | 7.72 | 366.22 | 3,046 | -1,028 | 5,386 |
| MathJax with macros (macros) | 60.08 | 6.45 | 238.98 | 2,999 | +398 | 3,004 |

## Chromium rendering

Chromium 153.0.8010.0. Each timed batch serializes 256 display expressions, inserts the generated markup into one container, and forces layout by reading its geometry. Median of seven batches after three warm-ups. The same insertion path is used for all libraries. MiniMath’s optional DOM adapter is covered by the browser tests. This benchmark measures the string-to-layout path.

| Renderer and workload | Median per 256 expressions (ms) |
| --- | ---: |
| MiniMath (core) | 35.20 |
| MiniMath advanced (matrices) | 37.50 |
| MiniMath advanced (macros) | 18.60 |
| KaTeX (core) | 37.10 |
| KaTeX (matrices) | 53.20 |
| KaTeX (macros) | 25.80 |
| MathJax (core) | 126.60 |
| MathJax (matrices) | 143.10 |
| MathJax with macros (macros) | 61.30 |

## Syntax coverage

The previous native core MathML build was 4,848 bytes gzip. Adding native binomials, fraction styles, and basic blackboard bold brought it to 5,315 bytes gzip.

The following probes record whether each configured engine emitted MathML without a parse error. The shared macro timing corpus includes required arguments, delimited definitions, aliases, and a matrix inside a macro. Optional defaults are probed separately so the timing corpus stays comparable.

| Syntax probe | MiniMath native advanced | KaTeX | MathJax with macros | MiniMath with compatibility |
| --- | --- | --- | --- | --- |
| Optional default in newcommand | Accepted | Rejected | Accepted | Native |
| Eager edef definition | Rejected | Accepted | Rejected | KaTeX |
| Blackboard bold | Accepted | Accepted | Accepted | Native |
| Binomial coefficients | Accepted | Accepted | Accepted | Native |
| Labeled arrows | Rejected | Accepted | Accepted | KaTeX |
| Arrays with column specifications | Rejected | Accepted | Accepted | KaTeX |
| Equation tags | Rejected | Accepted | Accepted | MathJax |

## Browser compatibility loading cost

The compatibility router starts with the native advanced renderer. The table counts minified JavaScript files actually requested at each step of one Chromium session. First render time includes module loading from the local benchmark route. Warm time measures MathML serialization and checking after loading, using the median of seven batches of 256 calls. This timing path skips DOM insertion and layout.

| Router step | Additional raw bytes | Additional gzip bytes | First render (ms) | Warm (µs/expression) |
| --- | ---: | ---: | ---: | ---: |
| Initial router and native advanced engine | 21,634 | 8,367 | — | — |
| Native binomial | 0 | 0 | 2.30 | 5.08 |
| KaTeX labeled arrow | 304,492 | 86,911 | 26.90 | 43.36 |
| MathJax equation tag after KaTeX | 322,923 | 106,186 | 49.20 | 439.84 |

The results apply to these fixtures and configurations on this machine. MiniMath implements a narrower TeX profile. Feature coverage and output markup vary across engines.
