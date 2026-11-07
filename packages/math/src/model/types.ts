export type Range = readonly [start: number, end: number];

export interface Diagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly range?: Range;
}

export type Result<A> =
  | { readonly ok: true; readonly artifact: A; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly [Diagnostic] };

export interface Limits {
  readonly maxInputBytes: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxOutputBytes: number;
  readonly maxExpansions: number;
}

export interface ParseOptions {
  readonly limits?: Partial<Limits>;
  readonly signal?: AbortSignal;
}

export interface RenderOptions extends ParseOptions {
  readonly display?: boolean;
}

export interface MathArtifact {
  readonly mathml: string;
  readonly text: string;
}

export type AtomRole = "identifier" | "number" | "operator" | "function" | "text" | "large" | "integral";

export interface Atom {
  readonly kind: "atom";
  readonly role: AtomRole;
  readonly value: string;
  readonly upright?: true;
}

export interface Row {
  readonly kind: "row";
  readonly children: readonly MathNode[];
}

export interface Fence {
  readonly kind: "fence";
  readonly left: string;
  readonly right: string;
  readonly body: MathNode;
}

export interface Table {
  readonly kind: "table";
  readonly alignment: "center" | "alternate" | "left";
  readonly rows: readonly (readonly Row[])[];
}

export type MathNode =
  | Atom | Row | Fence | Table
  | { readonly kind: "space"; readonly width: number }
  | { readonly kind: "fraction"; readonly top: MathNode; readonly bottom: MathNode; readonly bar?: false; readonly display?: boolean }
  | { readonly kind: "root"; readonly body: MathNode; readonly index?: MathNode }
  | { readonly kind: "script"; readonly base: MathNode; readonly sub?: MathNode; readonly sup?: MathNode };
