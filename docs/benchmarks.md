# Benchmarks

Linux x64, AMD EPYC 9V74 80-Core Processor, Node.js 24.22.1, esbuild 0.28.2. Comparator versions are KaTeX 0.19.1 and MathJax 4.1.3.

Run `pnpm bench` for server and bundle measurements or `pnpm bench --browser` to include Chromium. The runner emits raw results as JSON. The [shared fixtures](../benchmarks/fixtures.mjs) contain eight expressions in the core workload and six in the matrix workload.

## Bundle size

Values are bytes. Each row is a separate minified ESM browser build targeting ES2022. Initial bytes include the entry and its static imports. Deferred bytes count the dynamic chunk. Each emitted file is compressed independently with gzip level 9 and Brotli. The MathML-only comparisons use no external CSS or fonts. MiniMath's optional alignment stylesheet is listed separately.

| Consumer import | Initial raw | Initial gzip | Initial Brotli | Deferred raw | Deferred gzip | Deferred Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniMath parse only | 9,582 | 3,789 | 3,353 | — | — | — |
| MiniMath MathML | 12,389 | 4,823 | 4,275 | — | — | — |
| MiniMath advanced MathML | 14,113 | 5,484 | 4,858 | — | — | — |
| MiniMath lazy advanced | 12,682 | 5,026 | 4,442 | 1,786 | 962 | 815 |
| MiniMath browser mount | 13,507 | 5,495 | 4,859 | 1,781 | 960 | 820 |
| MiniMath SVG + MathML | 17,184 | 6,919 | 6,110 | — | — | — |
| MiniMath advanced SVG + MathML | 18,912 | 7,589 | 6,734 | — | — | — |
| MiniMath alignment CSS | 78 | 69 | 59 | — | — | — |
| KaTeX MathML | 267,681 | 76,951 | 63,916 | — | — | — |
| MathJax MathML | 249,662 | 74,128 | 60,410 | — | — | — |

## Server rendering and memory

Median of seven fresh Node.js processes per row. Import time starts inside the process and covers loading and renderer setup. First render is timed separately. Warm rendering times 12,000 expressions after 3,000 warm-up renders. Each library emits MathML in display mode. MiniMath also builds readable text. KaTeX uses its `mathml` output with trust disabled. MathJax uses its direct TeX base and AMS modules and native MathML serialization. Output bytes count only the MathML markup for one pass through the corpus.

Heap columns use V8 heap-used readings after three explicit garbage collections. Loaded heap is the increase from before import to after the first render. Warm heap change is the post-batch difference against the warmed state, with output strings released. The warm deltas include V8 and library state changes and can be negative. These readings measure live JS heap in this harness. Peak memory and process RSS are outside the measurement.

| Renderer and workload | Import and setup (ms) | First render (ms) | Warm (µs/expression) | Loaded heap (KiB) | Warm heap change (KiB) | Output (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniMath (core) | 5.15 | 1.63 | 11.46 | 325 | -1 | 2,683 |
| MiniMath advanced (matrices) | 5.34 | 1.62 | 11.85 | 352 | -43 | 2,474 |
| KaTeX (core) | 15.67 | 2.71 | 27.90 | 2,611 | -8 | 3,464 |
| KaTeX (matrices) | 15.60 | 4.09 | 34.11 | 2,660 | +72 | 4,786 |
| MathJax (core) | 62.12 | 6.36 | 346.95 | 3,026 | +325 | 5,875 |
| MathJax (matrices) | 63.52 | 7.38 | 381.34 | 3,046 | -1,028 | 5,386 |

## Chromium rendering

Chromium 153.0.8010.0. Each timed batch serializes 256 display expressions, inserts the generated markup into one container, and forces layout by reading its geometry. Median of seven batches after three warm-ups. The same insertion path is used for all libraries. MiniMath’s optional DOM adapter is covered by the browser tests. This benchmark measures the string-to-layout path.

| Renderer and workload | Median per 256 expressions (ms) |
| --- | ---: |
| MiniMath (core) | 34.10 |
| MiniMath advanced (matrices) | 41.10 |
| KaTeX (core) | 38.90 |
| KaTeX (matrices) | 54.20 |
| MathJax (core) | 98.90 |
| MathJax (matrices) | 108.60 |

The results apply to these fixtures and configurations on this machine. MiniMath implements a narrower TeX profile. Feature coverage and output markup vary across engines.
