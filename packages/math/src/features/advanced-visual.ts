import { visualMath } from "../backends/visual.js";
import type { VisualArtifact } from "../backends/visual.js";
import type { Result } from "../model/types.js";
import { advancedExtensions } from "./advanced.js";
import type { AdvancedOptions } from "./advanced.js";

export function renderAdvancedVisual(source: string, options: AdvancedOptions = {}): Result<VisualArtifact> {
  return visualMath(source, options, advancedExtensions(options));
}
