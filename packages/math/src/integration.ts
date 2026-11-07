import { render } from "./index.js";
import { defaultLimits } from "./model/limits.js";
import type { Limits, MathArtifact, Result } from "./model/types.js";

export interface RenderContext {
  readonly idPrefix: string;
  readonly limits: Readonly<Pick<Limits, "maxInputBytes" | "maxNodes" | "maxDepth" | "maxOutputBytes">>;
  readonly signal?: AbortSignal;
}

export const integration = {
  protocolVersion: 1,
  engine: "math",
  inputTypes: ["text/x-tex"],
  artifactTypes: ["application/mathml+xml", "text/plain"],
  environments: ["browser", "server"],
  render(input: unknown, options: unknown, context: RenderContext): Result<MathArtifact> {
    if (typeof input !== "string" || (options !== undefined &&
        (options === null || typeof options !== "object" || Array.isArray(options) ||
          ("display" in options && typeof options.display !== "boolean")))) {
      return { ok: false, diagnostics: [{ code: "invalid-input", severity: "error", message: "Expected a TeX-like string and optional boolean display setting." }] };
    }
    const display = (options as { display?: boolean } | undefined)?.display === true;
    const host = context.limits;
    const limits = {
      maxInputBytes: Math.min(host.maxInputBytes, defaultLimits.maxInputBytes),
      maxNodes: Math.min(host.maxNodes, defaultLimits.maxNodes),
      maxDepth: Math.min(host.maxDepth, defaultLimits.maxDepth),
      maxOutputBytes: Math.min(host.maxOutputBytes, defaultLimits.maxOutputBytes),
    };
    return render(input, { display, limits, ...(context.signal && { signal: context.signal }) });
  },
} as const;
