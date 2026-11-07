import { emitMath } from "../engine.js";
import { byteLength, checkAbort, fail, OutputBudget, run } from "../model/limits.js";
import type { MathArtifact, Result, Row } from "../model/types.js";
import { Parser } from "../parse/parser.js";
import { advancedExtensions, advancedMacros } from "./advanced.js";
import type { AdvancedOptions } from "./advanced.js";
import { EquationBook, EquationExpression } from "./equations.js";
import type { EquationLabel } from "./equations.js";

export type { EquationLabel } from "./equations.js";

export interface DocumentExpression {
  readonly source: string;
  readonly display?: boolean;
}

export interface DocumentArtifact {
  readonly entries: readonly MathArtifact[];
  readonly labels: readonly EquationLabel[];
}

export function renderDocument(entries: readonly DocumentExpression[], options: AdvancedOptions = {}): Result<DocumentArtifact> {
  let entry: number | undefined;
  const result = run("", options, (limits) => {
    if (!Array.isArray(entries)) fail("invalid-input", "Expected an array of math expressions.");
    if (entries.length > limits.maxNodes) fail("node-limit", "The document has too many expressions.");
    const book = new EquationBook(options);
    const macros = advancedMacros(options);
    const parsed: { root: Row; display: boolean; references: boolean }[] = [];
    const expansionBudget = { expansions: 0, bytes: 0 };
    let nodes = 0;
    let inputBytes = 0;

    for (entry = 0; entry < entries.length; entry++) {
      checkAbort(options.signal);
      const item = entries[entry];
      if (!item || typeof item.source !== "string" || (item.display !== undefined && typeof item.display !== "boolean")) {
        fail("invalid-input", "Expected a source string and optional display flag.");
      }
      if (item.source.length > limits.maxInputBytes - inputBytes ||
          (inputBytes += byteLength(item.source)) > limits.maxInputBytes) {
        fail("input-limit", "Document exceeds the UTF-8 input byte limit.");
      }
      const display = item.display ?? options.display ?? false;
      const expression = new EquationExpression(book, display);
      const extensions = advancedExtensions(options, expression, macros, true);
      macros.scope?.(true);
      const parser = new Parser(item.source, { ...limits, maxNodes: limits.maxNodes - nodes }, options.signal, extensions, expansionBudget);
      const root = extensions.finish!(parser.sequence(0), parser);
      macros.scope?.(false);
      nodes += parser.nodeCount;
      parsed.push({ root, display, references: expression.hasReferences });
    }

    const budget = new OutputBudget(limits.maxOutputBytes);
    const artifacts = parsed.map(({ root, display, references }, index) => {
      entry = index;
      checkAbort(options.signal);
      return emitMath(references ? book.resolve(root) : root, display, budget);
    });
    return { entries: artifacts, labels: [...book.labels.values()] };
  });
  if (result.ok || entry === undefined) return result;
  return { ok: false, diagnostics: [{ ...result.diagnostics[0], entry }] };
}
