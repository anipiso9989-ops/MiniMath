import { parseMath, renderMath } from "../engine.js";
import type { MathArtifact, RenderOptions, Result, Row } from "../model/types.js";
import type { Extensions } from "../parse/parser.js";
import { environment } from "./environments.js";
import { EquationBook, EquationExpression, isEquationCommand } from "./equations.js";
import type { NumberingOptions } from "./equations.js";
import { macroExtensions } from "./macros.js";
import type { MacroDefinition } from "./macros.js";
import { isNotationCommand, notationCommand, notationDirective, notationInfix } from "./notation.js";
import { isScienceCommand, scienceCommand } from "./science.js";
import { choose } from "./style-choice.js";

export type { MacroDefinition } from "./macros.js";
export type { Numbering, NumberingOptions } from "./equations.js";

export interface AdvancedOptions extends RenderOptions, NumberingOptions {
  readonly macros?: Readonly<Record<string, MacroDefinition>>;
}

export function advancedMacros(options: AdvancedOptions): ReturnType<typeof macroExtensions> {
  return macroExtensions(options.macros, (name) => isEquationCommand(name) || isNotationCommand(name) || isScienceCommand(name));
}

export function advancedExtensions(
  options: AdvancedOptions,
  expression = new EquationExpression(new EquationBook(options), options.display === true),
  macros = advancedMacros(options),
  deferReferences = false,
): Extensions {
  let hasChoice = false;
  return {
    ...macros,
    directive: notationDirective,
    infix: notationInfix,
    command(parser, token, depth) {
      if (token.value === "\\mathchoice") hasChoice = true;
      const equation = expression.command(parser, token, depth);
      return equation === undefined ? notationCommand(parser, token, depth) ?? scienceCommand(parser, token, depth) : equation;
    },
    environment: (parser, token, depth) => environment(expression, macros.customEnvironment, parser, token, depth),
    finish(root, parser) {
      const selected = hasChoice ? choose(root, expression.display ? 0 : 1) as Row : root;
      const finished = expression.finish(selected, parser);
      return !deferReferences && expression.hasReferences ? expression.book.resolve(finished) : finished;
    },
  };
}

export function parseAdvanced(source: string, options: AdvancedOptions = {}): Result<Row> {
  return parseMath(source, options, advancedExtensions(options));
}

export function renderAdvanced(source: string, options: AdvancedOptions = {}): Result<MathArtifact> {
  return renderMath(source, options, advancedExtensions(options));
}
