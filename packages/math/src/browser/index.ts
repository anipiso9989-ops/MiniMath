import { htmlNamespace, mathNamespace, readable, serializeMathML } from "../backends/mathml.js";
import { withMath } from "../engine.js";
import { OutputBudget } from "../model/limits.js";
import type { MathArtifact, Result } from "../model/types.js";
import type { AdvancedOptions } from "../features/advanced.js";

export interface MountOptions extends AdvancedOptions {
  readonly advanced?: boolean;
  readonly textOnly?: boolean;
}

type Update = Promise<Result<MathArtifact> | undefined>;

export interface MathView {
  readonly ready: Update;
  update(source: string): Update;
  dispose(): void;
}

export function mount(container: Element, source: string, options: MountOptions = {}): MathView {
  const document = container.ownerDocument;
  const host = document.createElement("span");
  container.replaceChildren(host);
  const native = !options.textOnly && (document.defaultView?.CSS?.supports("math-style", "normal") === true);
  let generation = 0;
  let disposed = false;

  async function update(source: string): Update {
    if (disposed) return;
    const current = ++generation;
    const advanced = options.advanced && !options.signal?.aborted ? await import("../features/advanced.js") : undefined;
    if (disposed || current !== generation) return;

    const fragment = document.createDocumentFragment();
    let parent: Node = fragment;
    const result = withMath(source, options, advanced?.advancedExtensions(options), (root, limits) => {
      const budget = new OutputBudget(limits.maxOutputBytes);
      const mathml = serializeMathML(root, options.display === true, budget, native ? {
        open(tag, attribute, value, other, otherValue) {
          const node = document.createElementNS(tag === "a" && attribute === "xmlns" ? htmlNamespace : mathNamespace, tag);
          if (attribute && attribute !== "xmlns") node.setAttribute(attribute, value!);
          if (other) node.setAttribute(other, otherValue!);
          parent.appendChild(node);
          parent = node;
        },
        close() { parent = parent.parentNode!; },
        text(value) { parent.appendChild(document.createTextNode(value)); },
      } : undefined);
      return { mathml, text: budget.add(readable(root)) };
    });

    if (result.ok) {
      if (native) host.replaceChildren(fragment);
      else host.textContent = result.artifact.text;
    } else if (result.diagnostics[0].code !== "aborted") {
      host.textContent = result.diagnostics[0].message;
    }
    return result;
  }

  return {
    ready: update(source),
    update,
    dispose() {
      disposed = true;
      host.remove();
    },
  };
}
