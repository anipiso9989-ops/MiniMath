export type Range = readonly [start: number, end: number];

export interface Diagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly range?: Range;
  readonly entry?: number;
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
  readonly stretchy?: true;
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

export interface EquationTag {
  readonly value: MathNode;
  readonly bare?: true;
  readonly id?: string;
}

export interface Table {
  readonly kind: "table";
  readonly alignment: "center" | "alternate" | "left";
  readonly rows: readonly (readonly Row[])[];
  readonly columns?: readonly ("left" | "center" | "right")[];
  readonly rules?: readonly (number | undefined)[];
  readonly lines?: readonly ("solid" | "dashed" | undefined)[];
  readonly tags?: readonly (EquationTag | undefined)[];
}

export type MathNode =
  | Atom | Row | Fence | Table
  | { readonly kind: "space"; readonly width: number }
  | { readonly kind: "fraction"; readonly top: MathNode; readonly bottom: MathNode; readonly bar?: false; readonly display?: boolean; readonly thickness?: number }
  | { readonly kind: "root"; readonly body: MathNode; readonly index?: MathNode }
  | { readonly kind: "script"; readonly base: MathNode; readonly sub?: MathNode; readonly sup?: MathNode; readonly limits?: boolean }
  | { readonly kind: "choice"; readonly variants: readonly [MathNode, MathNode, MathNode, MathNode] }
  | { readonly kind: "prescript"; readonly base: MathNode; readonly sub: MathNode; readonly sup: MathNode; readonly postSub?: MathNode; readonly postSup?: MathNode }
  | { readonly kind: "stack"; readonly base: MathNode; readonly below?: MathNode; readonly above?: MathNode; readonly accent?: true }
  | { readonly kind: "style"; readonly body: MathNode; readonly color?: string; readonly background?: string; readonly display?: boolean; readonly level?: 0 | 1 | 2 }
  | { readonly kind: "enclosure"; readonly body: MathNode; readonly notation: string }
  | { readonly kind: "padding"; readonly body: MathNode; readonly align?: "left" | "center" | "right"; readonly zeroHeight?: true; readonly zeroDepth?: true; readonly raise?: number }
  | { readonly kind: "rule"; readonly width: number; readonly height: number; readonly raise: number }
  | { readonly kind: "phantom"; readonly body: MathNode; readonly axis: "both" | "horizontal" | "vertical" }
  | { readonly kind: "reference"; readonly label: string; readonly parenthesized: boolean; readonly range: Range }
  | { readonly kind: "link"; readonly target: string; readonly value: string }
  | { readonly kind: "equation"; readonly body: MathNode; readonly tag: EquationTag };
