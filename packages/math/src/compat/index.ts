import { renderAdvanced } from "../features/advanced.js";
import type { RenderOptions, Result } from "../model/types.js";
import type { CompatibleArtifact } from "./output.js";

export type { CompatibleArtifact, RendererName } from "./output.js";

export type CompatibilityRenderer = (source: string, options?: RenderOptions) => Result<CompatibleArtifact>;
export type CompatibilityLoader = () => Promise<CompatibilityRenderer>;

const defaultLoaders: readonly CompatibilityLoader[] = [
  () => import("./katex.js").then(({ renderKaTeX }) => renderKaTeX),
  () => import("./mathjax.js").then(({ createMathJaxRenderer }) => createMathJaxRenderer()),
];

function stop(result: Result<CompatibleArtifact>): boolean {
  if (result.ok) return true;
  const code = result.diagnostics[0].code;
  return code === "aborted" || code === "invalid-input" || code === "blocked-command" || code.endsWith("-limit");
}

export function createCompatibleRenderer(loaders: readonly CompatibilityLoader[] = defaultLoaders): (
  source: string, options?: RenderOptions,
) => Promise<Result<CompatibleArtifact>> {
  const lazy = loaders.map((load) => {
    let pending: Promise<CompatibilityRenderer> | undefined;
    return () => pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  });
  return async (source, options = {}) => {
    const native = renderAdvanced(source, options);
    if (native.ok) return { ok: true, artifact: { ...native.artifact, renderer: "native" }, diagnostics: [] };
    let result: Result<CompatibleArtifact> = native;
    if (stop(result)) return result;
    for (const load of lazy) {
      const render = await load();
      result = render(source, options);
      if (stop(result)) return result;
    }
    return result;
  };
}
