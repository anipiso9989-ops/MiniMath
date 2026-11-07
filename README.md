# MiniMath

MiniMath is the standalone TypeScript math engine in the Mini architecture. It ships as ESM with declarations and zero runtime or peer dependencies. The core renders TeX-like expressions to native MathML and readable text. Optional entry points add wider notation, document-wide equation numbering, browser mounting, and SVG.

```ts
import { render } from "@mini/math";

const result = render(String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, { display: true });
if (result.ok) {
  console.log(result.artifact.mathml);
}
```

- [API, native syntax, security, and accessibility](packages/math/README.md)
- [Numbered equations and document references](packages/math/README.md#equation-numbering-and-references)
- [Architecture and library review](docs/architecture.md)
- [Measured performance, bundle size, and memory](docs/benchmarks.md)

## Build and verify

Use Node.js 22.13+ (Node.js 24 was used for the recorded benchmarks) and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec playwright-core install chromium
pnpm test:browser
pnpm bench --size-only --native-only
pnpm --filter @mini/math pack
```

`pnpm test` covers the server API, output limits, malformed input, extensions, and the integration protocol. `pnpm test:browser` checks rendering, accessibility exposure, CSP and Trusted Types, and lazy loading in Chromium. Set `CHROMIUM_PATH` to use a specific Chromium executable. The packed package targets Node.js 20+ and evergreen browsers with native MathML.

To run reference comparisons, install the isolated benchmark fixtures with `npm ci --prefix benchmarks/reference`, then run `pnpm bench --size-only` or `pnpm bench --browser`.
