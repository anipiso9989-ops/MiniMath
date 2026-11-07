import { parseMath, renderMath } from "./engine.js";
import type { MathArtifact, ParseOptions, RenderOptions, Result, Row } from "./model/types.js";

export type {
  Atom, AtomRole, Diagnostic, EquationTag, Fence, Limits, MathArtifact, MathNode, ParseOptions,
  Range, RenderOptions, Result, Row, Table,
} from "./model/types.js";

export function parse(source: string, options: ParseOptions = {}): Result<Row> {
  return parseMath(source, options);
}

export function render(source: string, options: RenderOptions = {}): Result<MathArtifact> {
  return renderMath(source, options);
}
