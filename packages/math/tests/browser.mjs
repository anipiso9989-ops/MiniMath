import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename } from "node:path";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { renderVisual } from "@mini/math/visual";

const tex = String.raw;
const mathNS = "http://www.w3.org/1998/Math/MathML";
const svgNS = "http://www.w3.org/2000/svg";
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; require-trusted-types-for 'script'";
const hostile = tex`\text{</mtext><img src=x onerror=alert(1)>\&<script>bad</script>}`;
const svgFixture = renderVisual(hostile).artifact;
let server, browser, url, chunks;

before(async () => {
  const result = await build({
    stdin: { contents: 'import { mount } from "@mini/math/browser"; window.mountMath = mount;', resolveDir: new URL("../", import.meta.url).pathname },
    bundle: true, splitting: true, format: "esm", outdir: "out", entryNames: "entry", write: false,
  });
  const assets = new Map(result.outputFiles.map((file) => ["/" + basename(file.path), file.contents]));
  chunks = [...assets.keys()].filter((path) => path.includes("advanced-"));
  assets.set("/styles.css", readFileSync(new URL("../styles.css", import.meta.url)));
  server = createServer((request, response) => {
    const asset = assets.get(request.url);
    if (asset) {
      response.writeHead(200, { "content-type": request.url.endsWith(".css") ? "text/css" : "text/javascript" });
      return response.end(asset);
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": csp });
    response.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><div id="host"></div><div id="ssr">${svgFixture.mathml}${svgFixture.svg}</div><script type="module" src="/entry.js"></script>`);
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("mounts MathML with native fraction geometry and an exposed accessibility tree", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const mounted = await page.evaluate(async (source) => {
      const host = document.querySelector("#host");
      const result = await window.mountMath(host, source, { display: true }).ready;
      const math = host.querySelector("math");
      return {
        ok: result.ok, namespace: math.namespaceURI, display: math.getAttribute("display"),
        fraction: math.querySelector("mfrac").getBoundingClientRect().height,
        atom: math.querySelector("mn").getBoundingClientRect().height,
      };
    }, tex`\frac{1}{2}=x`);
    assert.equal(mounted.ok, true);
    assert.equal(mounted.namespace, mathNS);
    assert.equal(mounted.display, "block");
    assert.ok(mounted.fraction > mounted.atom);
    const session = await page.context().newCDPSession(page);
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    assert.ok(nodes.some(({ role, ignored }) => !ignored && ["MathMLMath", "math"].includes(role?.value)));
    assert.ok(nodes.some(({ role, ignored }) => !ignored && role?.value === "MathMLFraction"));
    assert.ok(nodes.some(({ role, ignored, name }) => !ignored && role?.value === "image" && name?.value.includes("bad</script>")));
  } finally {
    await page.close();
  }
});

test("SSR and browser output keep hostile input inert under strict CSP and Trusted Types", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const state = await page.evaluate(async (source) => {
      const host = document.querySelector("#host");
      await window.mountMath(host, source).ready;
      const ssr = document.querySelector("#ssr");
      return {
        text: host.querySelector("mtext").textContent,
        ssrText: ssr.querySelector("mtext").textContent,
        svgText: ssr.querySelector("svg text").textContent,
        svgNS: ssr.querySelector("svg").namespaceURI,
        images: document.querySelectorAll("img").length,
        scripts: document.querySelectorAll("script").length,
      };
    }, hostile);
    assert.equal(state.text, "</mtext><img src=x onerror=alert(1)>&<script>bad</script>");
    assert.equal(state.ssrText, state.text);
    assert.equal(state.svgText, state.text);
    assert.equal(state.svgNS, svgNS);
    assert.equal(state.images, 0);
    assert.equal(state.scripts, 1);
  } finally {
    await page.close();
  }
});

test("fetches advanced code on demand, rejects stale loads, and applies alignment CSS", async () => {
  assert.equal(chunks.length, 1);
  const page = await browser.newPage();
  try {
    const requested = [];
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));
    await page.goto(url);
    await page.evaluate(async () => window.mountMath(document.querySelector("#host"), "x").ready);
    assert.ok(!requested.includes(chunks[0]));
    const state = await page.evaluate(async (source) => {
      const host = document.querySelector("#host");
      const view = window.mountMath(host, "old", { advanced: true });
      const result = await view.update(source);
      return {
        ok: result.ok, stale: (await view.ready) === undefined,
        align: [...host.querySelectorAll("mtd")].map((cell) => getComputedStyle(cell).textAlign),
        rows: host.querySelectorAll("mtr").length,
      };
    }, tex`\begin{aligned}x&=1\\y&=2\end{aligned}`);
    assert.equal(requested.filter((path) => path === chunks[0]).length, 1);
    assert.deepEqual(state, { ok: true, stale: true, align: ["right", "left", "right", "left"], rows: 2 });
  } finally {
    await page.close();
  }
});

test("mount updates, text fallback, cancellation and disposal own only the mounted view", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const state = await page.evaluate(async () => {
      const host = document.querySelector("#host");
      const controller = new AbortController();
      const view = window.mountMath(host, "x^2", { textOnly: true, signal: controller.signal });
      await view.ready;
      const fallback = host.textContent;
      const invalid = await view.update("x^^2");
      const errorText = host.textContent;
      await view.update("y=1");
      controller.abort();
      const aborted = await view.update("z");
      const retained = host.textContent;
      const sibling = document.createElement("b");
      host.append(sibling);
      view.dispose();
      const ignored = await view.update("a");
      const pending = window.mountMath(document.createElement("div"), "x", { advanced: true });
      pending.dispose();
      return {
        fallback, invalid: invalid.diagnostics[0].code, errorText,
        aborted: aborted.diagnostics[0].code, retained,
        sibling: host.firstElementChild === sibling && host.children.length === 1,
        ignored: ignored === undefined, disposedDuringLoad: (await pending.ready) === undefined,
      };
    });
    assert.deepEqual(state, {
      fallback: "x superscript (2)", invalid: "syntax", errorText: "Unexpected math token.",
      aborted: "aborted", retained: "y = 1", sibling: true, ignored: true, disposedDuringLoad: true,
    });
  } finally {
    await page.close();
  }
});
