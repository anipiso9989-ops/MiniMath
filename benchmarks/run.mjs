import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { relative } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build, version as esbuild } from "esbuild";
import { bundles, fixtures, renderers } from "./variants.mjs";

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
            if (main.getBoundingClientRect().height <= 0 || main.querySelectorAll("math").length !== 256) {
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
    return { chromium: browser.version(), batchSize: 256, medianMs: results };
  } finally {
    await browser.close();
  }
}

const output = {
  machine: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, esbuild },
  repeats, bundles: {}, node: {},
};
for (const [name, source] of Object.entries(bundles)) {
  output.bundles[name] = await size(source, name.includes("lazy") || name.includes("mount"));
}
output.bundles["MiniMath alignment CSS"] = { initial: filesSize([{ contents: readFileSync("packages/math/styles.css") }]) };
for (const [name, variant] of Object.entries(renderers)) {
  if (name === "KaTeX" || name === "MathJax") output.bundles[name] = await size(variant.browser, false);
  for (const workload of variant.workloads) {
    const samples = Array.from({ length: repeats }, () => JSON.parse(execFileSync(
      process.execPath, ["--expose-gc", "benchmarks/sample.mjs", name, workload], { encoding: "utf8" })));
    output.node[`${name} (${workload})`] = Object.fromEntries(
      Object.keys(samples[0]).map((metric) => [metric, median(samples.map((sample) => sample[metric]))]));
  }
}
if (process.argv.includes("--browser")) output.browser = await browserSamples();
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
