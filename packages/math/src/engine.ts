import { checkAbort, OutputBudget, run } from "./model/limits.js";
import type { Limits, MathArtifact, ParseOptions, RenderOptions, Result, Row } from "./model/types.js";
import { readable, serializeMathML } from "./backends/mathml.js";
import { Parser } from "./parse/parser.js";
import type { Extensions } from "./parse/parser.js";

export function withMath<A>(
  source: string, options: ParseOptions, extensions: Extensions | undefined, emit: (root: Row, limits: Limits) => A,
): Result<A> {
  return run(source, options, (limits) => {
    const root = new Parser(source, limits, options.signal, extensions).sequence(0);
    checkAbort(options.signal);
    return emit(root, limits);
  });
}

export function parseMath(source: string, options: ParseOptions, extensions?: Extensions): Result<Row> {
  return withMath(source, options, extensions, (root) => root);
}

export function renderMath(source: string, options: RenderOptions, extensions?: Extensions): Result<MathArtifact> {
  return withMath(source, options, extensions, (root, limits) => {
    const budget = new OutputBudget(limits.maxOutputBytes);
    const mathml = serializeMathML(root, options.display === true, budget);
    return { mathml, text: budget.add(readable(root)) };
  });
}
