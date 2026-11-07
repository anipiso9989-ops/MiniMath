import { performance } from "node:perf_hooks";
import { fixtures, renderers } from "./variants.mjs";

const [, , name, workload] = process.argv;
const sources = fixtures[workload];
const heap = () => {
  for (let i = 0; i < 3; i++) global.gc();
  return process.memoryUsage().heapUsed / 1024;
};

const baseline = heap();
const start = performance.now();
const render = await renderers[name].load();
const initMs = performance.now() - start;
const firstStart = performance.now();
const first = render(sources[0]);
const firstMs = performance.now() - firstStart;
if (!first.includes("<math")) throw new Error("Expected MathML.");
const loaded = heap();
const outputBytes = sources.reduce((bytes, source) => {
  const markup = render(source);
  if (!markup.includes("<math") || markup.includes("<merror")) throw new Error("Expected valid fixture output.");
  return bytes + Buffer.byteLength(markup);
}, 0);
let checksum = 0;
for (let i = 0; i < 3_000; i++) checksum += render(sources[i % sources.length]).length;
const warmed = heap();
const time = performance.now();
for (let i = 0; i < 12_000; i++) checksum += render(sources[i % sources.length]).length;
const warmUs = (performance.now() - time) * 1_000 / 12_000;
const retainedKiB = heap() - warmed;
if (!checksum) throw new Error("Empty benchmark output.");
process.stdout.write(JSON.stringify({ initMs, firstMs, warmUs, loadedKiB: loaded - baseline, retainedKiB, outputBytes }));
