import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { basename, relative } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build, version as esbuild } from "esbuild";
import { bundles, fixtures, renderers } from "./variants.mjs";
import { compatibility } from "./fixtures.mjs";
import { createCompatibleRenderer } from "@mini/math/compat";

const repeats = 7;
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const filesSize = (files) => files.reduce((size, { contents }) => {
  size.raw += contents.length;
  size.gzip += gzipSync(contents, { level: 9 }).length;
  size.brotli += brotliCompressSync(contents).length;
  return size;
}, { raw: 0, gzip: 0, brotli: 0 });

function bundle(contents, splitting = false) {
  return build({
    stdin: { contents, resolveDir: process.cwd() },
    outdir: "out", entryNames: "entry", format: "esm", platform: "browser", target: "es2022",
    bundle: true, minify: true, legalComments: "none", splitting, metafile: true, write: false,
  });
}

async function size(contents, splitting) {
  const { outputFiles, metafile } = await bundle(contents, splitting);
  const staticFiles = new Set();
  function visit(path) {
    if (staticFiles.has(path)) return;
    staticFiles.add(path);
    for (const ref of metafile.outputs[path].imports) {
      if (ref.kind !== "dynamic-import" && !ref.external) visit(ref.path);
    }
  }
  visit("out/entry.js");
  return {
    initial: filesSize(outputFiles.filter((file) => staticFiles.has(relative(process.cwd(), file.path)))),
    deferred: filesSize(outputFiles.filter((file) => !staticFiles.has(relative(process.cwd(), file.path)))),
  };
}

async function compatibilitySamples(browser) {
  const { outputFiles } = await bundle(
    'import { createCompatibleRenderer } from "@mini/math/compat"; globalThis.compat = createCompatibleRenderer();',
    true,
  );
  const files = new Map(outputFiles.map((file) => ["/" + basename(file.path), file]));
  const fetched = new Set();
  const page = await browser.newPage();
  try {
    await page.route("http://compat.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = files.get(path);
      if (file) {
        fetched.add(file);
        return route.fulfill({ contentType: "text/javascript", body: file.text });
      }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><meta charset="utf-8"><script type="module" src="/entry.js"></script>' });
    });
    await page.goto("http://compat.test/");
    const results = { initial: filesSize([...fetched]) };
    for (const [renderer, source] of [
      ["native", compatibility["Binomial coefficients"]],
      ["katex", compatibility["Labeled arrows"]],
      ["mathjax", compatibility["Equation tags"]],
    ]) {
      const before = new Set(fetched);
      const measurement = await page.evaluate(async ({ renderer, source, repeats }) => {
        async function render() {
          const result = await globalThis.compat(source, { display: true });
          if (!result.ok || result.artifact.renderer !== renderer) throw new Error(JSON.stringify(result));
        }
        const start = performance.now();
        await render();
        const firstMs = performance.now() - start;
        const batch = async () => {
          const start = performance.now();
          for (let i = 0; i < 256; i++) await render();
          return (performance.now() - start) * 1000 / 256;
        };
        await batch();
        const warm = [];
        for (let i = 0; i < repeats; i++) warm.push(await batch());
        return { firstMs, warm };
      }, { renderer, source, repeats });
      results[renderer] = {
        fetched: filesSize([...fetched].filter((file) => !before.has(file))),
        firstMs: measurement.firstMs,
        warmUs: median(measurement.warm),
      };
    }
    return results;
  } finally {
    await page.close();
  }
}

async function browserSamples() {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    const results = {};
    for (const [name, variant] of Object.entries(renderers)) {
      const { outputFiles: [script] } = await bundle(variant.browser);
      const page = await browser.newPage();
      await page.route("http://benchmark.test/**", (route) => route.request().url().endsWith("entry.js")
        ? route.fulfill({ contentType: "text/javascript", body: script.text })
        : route.fulfill({ contentType: "text/html", body: '<!doctype html><meta charset="utf-8"><main></main><script type="module" src="/entry.js"></script>' }));
      await page.goto("http://benchmark.test/");
      if (!await page.evaluate(() => typeof globalThis.convert === "function")) throw new Error(`Failed to load ${name}.`);
      for (const workload of variant.workloads) {
        const samples = await page.evaluate(async ({ sources, repeats }) => {
          await document.fonts.ready;
          const main = document.querySelector("main");
          const batch = () => {
            const start = performance.now();
            const markup = Array.from({ length: 256 }, (_, i) => globalThis.convert(sources[i % sources.length])).join("");
            main.innerHTML = markup;
            if (main.getBoundingClientRect().height <= 0 || main.querySelectorAll("math").length !== 256 || main.querySelector("merror")) {
              throw new Error("Expected native MathML layout.");
            }
            return performance.now() - start;
          };
          for (let i = 0; i < 3; i++) batch();
          return Array.from({ length: repeats }, batch);
        }, { sources: fixtures[workload], repeats });
        results[`${name} (${workload})`] = median(samples);
      }
      await page.close();
    }
    return { chromium: browser.version(), batchSize: 256, medianMs: results, compatibility: await compatibilitySamples(browser) };
  } finally {
    await browser.close();
  }
}

const output = {
  machine: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, esbuild },
  repeats, bundles: {}, node: {}, compatibility: {},
};
for (const [name, source] of Object.entries(bundles)) {
  output.bundles[name] = await size(source, name.includes("lazy") || name.includes("mount"));
}
output.bundles["MiniMath alignment CSS"] = { initial: filesSize([{ contents: readFileSync("packages/math/styles.css") }]) };
for (const [name, variant] of Object.entries(renderers)) {
  if (name === "KaTeX" || name.startsWith("MathJax")) output.bundles[name] = await size(variant.browser, false);
  if (variant.workloads.includes("macros")) {
    const render = await variant.load();
    output.compatibility[name] = Object.fromEntries(Object.entries(compatibility).map(([label, source]) => {
      try {
        const markup = render(source);
        return [label, markup.includes("<math") && !markup.includes("<merror")];
      } catch {
        return [label, false];
      }
    }));
  }
  for (const workload of variant.workloads) {
    const samples = Array.from({ length: repeats }, () => JSON.parse(execFileSync(
      process.execPath, ["--expose-gc", "benchmarks/sample.mjs", name, workload], { encoding: "utf8" })));
    output.node[`${name} (${workload})`] = Object.fromEntries(
      Object.keys(samples[0]).map((metric) => [metric, median(samples.map((sample) => sample[metric]))]));
  }
}
const renderCompatible = createCompatibleRenderer();
output.compatibility["MiniMath with compatibility"] = Object.fromEntries(await Promise.all(
  Object.entries(compatibility).map(async ([label, source]) => {
    const result = await renderCompatible(source, { display: true });
    return [label, result.ok ? result.artifact.renderer : false];
  }),
));
if (process.argv.includes("--browser")) output.browser = await browserSamples();
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
