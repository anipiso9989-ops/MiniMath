import type { AtomRole } from "../model/types.js";

const greek: Readonly<Record<string, string>> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ",
  mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ",
  sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ",
  Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

const operators: Readonly<Record<string, string>> = {
  pm: "±", mp: "∓", times: "×", div: "÷", cdot: "⋅", ast: "∗", circ: "∘",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡",
  sim: "∼", simeq: "≃", propto: "∝", in: "∈", notin: "∉", subset: "⊂",
  subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
  to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒",
  Leftarrow: "⇐", Leftrightarrow: "⇔", mapsto: "↦", forall: "∀", exists: "∃",
  neg: "¬", land: "∧", lor: "∨", infty: "∞", partial: "∂", nabla: "∇",
  emptyset: "∅", ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱",
  prime: "′", angle: "∠", degree: "°",
};

const functions = new Set("sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh exp log ln det gcd mod".split(" "));
const large: Readonly<Record<string, string>> = { sum: "∑", prod: "∏", coprod: "∐", bigcup: "⋃", bigcap: "⋂" };
const integrals: Readonly<Record<string, string>> = { int: "∫", iint: "∬", iiint: "∭", oint: "∮" };
const limits = new Set(["lim", "limsup", "liminf", "min", "max", "sup", "inf"]);

const delimiters: Readonly<Record<string, string>> = {
  "(": "(", ")": ")", "[": "[", "]": "]", "|": "|", ".": "", "/": "/",
  "\\{": "{", "\\}": "}", "\\lbrace": "{", "\\rbrace": "}", "\\langle": "⟨", "\\rangle": "⟩",
  "\\lvert": "|", "\\rvert": "|", "\\vert": "|", "\\|": "‖", "\\lVert": "‖", "\\rVert": "‖",
  "\\Vert": "‖", "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉",
};
const escapes = "{}$%&#_";
const spaces: Readonly<Record<string, number>> = { ",": 0.167, ":": 0.222, ";": 0.278, " ": 0.333, quad: 1, qquad: 2 };

export function delimiter(token: string): string | undefined {
  return Object.hasOwn(delimiters, token) ? delimiters[token] : undefined;
}

export function space(command: string): number | undefined {
  return Object.hasOwn(spaces, command) ? spaces[command] : undefined;
}

export function symbol(command: string): readonly [AtomRole, string] | undefined {
  if (Object.hasOwn(greek, command)) return ["identifier", greek[command]];
  if (Object.hasOwn(operators, command)) return ["operator", operators[command]];
  if (Object.hasOwn(large, command)) return ["large", large[command]];
  if (Object.hasOwn(integrals, command)) return ["integral", integrals[command]];
  if (limits.has(command)) return ["large", command];
  if (functions.has(command)) return ["function", command];
  if (command.length === 1 && escapes.includes(command)) return ["operator", command];
  const fence = delimiter("\\" + command);
  if (fence) return ["operator", fence];
}
