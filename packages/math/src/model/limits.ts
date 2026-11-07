import type { Diagnostic, Limits, ParseOptions, Range, Result } from "./types.js";

export function byteLength(text: string): number {
  let bytes = text.length;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) continue;
    bytes += code <= 0x7ff ? 1 : 2;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
      }
    }
  }
  return bytes;
}

export const defaultLimits: Readonly<Limits> = Object.freeze({
  maxInputBytes: 16_384,
  maxNodes: 4_096,
  maxDepth: 64,
  maxOutputBytes: 262_144,
  maxExpansions: 128,
});

// A depth ceiling protects the JS stack even with application-provided limits.
const ceiling: Limits = {
  maxInputBytes: 1_048_576,
  maxNodes: 65_536,
  maxDepth: 128,
  maxOutputBytes: 4_194_304,
  maxExpansions: 4_096,
};

export function resolveLimits(overrides?: Partial<Limits>): Readonly<Limits> {
  if (!overrides) return defaultLimits;
  const limits = { ...defaultLimits };
  for (const key of Object.keys(limits) as (keyof Limits)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > ceiling[key]) {
      throw new RangeError(`${key} must be an integer between 0 and ${ceiling[key]}`);
    }
    limits[key] = value;
  }
  return limits;
}

class InputError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}

export function fail(code: string, message: string, range?: Range): never {
  throw new InputError({ code, severity: "error", message, ...(range ? { range } : {}) });
}

export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) fail("aborted", "Rendering was aborted.");
}

export function run<A>(source: string, options: ParseOptions, work: (limits: Limits) => A): Result<A> {
  try {
    checkAbort(options.signal);
    const limits = resolveLimits(options.limits);
    if (typeof source !== "string") fail("invalid-input", "Expected a string.");
    if (source.length > limits.maxInputBytes || byteLength(source) > limits.maxInputBytes) {
      fail("input-limit", "Input exceeds the UTF-8 byte limit.");
    }
    return { ok: true, artifact: work(limits), diagnostics: [] };
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    return { ok: false, diagnostics: [error.diagnostic] };
  }
}

export class OutputBudget {
  #bytes = 0;

  constructor(readonly limit: number) {}

  add(value: string, ascii = false): string {
    this.#bytes += ascii ? value.length : byteLength(value);
    if (this.#bytes > this.limit) fail("output-limit", "Output exceeds the UTF-8 byte limit.");
    return value;
  }
}
