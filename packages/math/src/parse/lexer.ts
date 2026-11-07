import { byteLength, fail } from "../model/limits.js";
import type { Limits, Range } from "../model/types.js";

export interface Token {
  readonly value: string;
  readonly range: Range;
}

interface Frame {
  readonly source: string;
  readonly origin: Range | undefined;
  position: number;
}

const word = /[A-Za-z]/;
const white = /[ \t\r\n]/;
const invalid = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;

export class Lexer {
  #frames: Frame[];
  #expansions = 0;
  #bytes = 0;

  constructor(source: string, readonly limits: Limits, origin?: Range) {
    this.#frames = [{ source, origin, position: 0 }];
  }

  #range(frame: Frame, start: number): Range {
    return frame.origin ?? [start, frame.position];
  }

  expand(source: string, origin: Range): void {
    if (++this.#expansions > this.limits.maxExpansions) {
      fail("expansion-limit", "Macro expansion limit exceeded.", origin);
    }
    if (source.length > this.limits.maxInputBytes ||
        (this.#bytes += byteLength(source)) > this.limits.maxInputBytes) {
      fail("expansion-limit", "Expanded macro text exceeds the UTF-8 byte limit.", origin);
    }
    if (source) this.#frames.push({ source, origin, position: 0 });
  }

  // The macro reader can put back its most recently read token before expanding.
  unread(token: Token): void {
    this.#frames[this.#frames.length - 1].position -= token.value.length;
  }

  read(preserveSpace = false): Token {
    for (;;) {
      const frame = this.#frames[this.#frames.length - 1];
      const { source } = frame;
      const start = frame.position;
      if (start === source.length) {
        if (this.#frames.length === 1) return { value: "", range: this.#range(frame, start) };
        this.#frames.pop();
        continue;
      }
      const value = this.#character(frame);
      if (!preserveSpace && white.test(value)) continue;
      if (value === "%") {
        while (frame.position < source.length && !/[\r\n]/.test(source[frame.position])) frame.position++;
        continue;
      }
      if (value !== "\\") return { value, range: this.#range(frame, start) };
      if (frame.position === source.length) fail("syntax", "Incomplete command.", this.#range(frame, start));
      const first = this.#character(frame);
      if (word.test(first)) {
        while (frame.position < source.length && word.test(source[frame.position])) frame.position++;
      }
      const name = source.slice(start, frame.position);
      return { value: name, range: this.#range(frame, start) };
    }
  }

  rawGroup(open: Token, depth: number): string {
    let nesting = 1;
    let text = "";
    for (let token = this.read(true); token.value; token = this.read(true)) {
      const { value, range } = token;
      if (value === "}") {
        if (--nesting === 0) return text;
      } else if (value === "{") {
        if (depth + nesting++ > this.limits.maxDepth) {
          fail("depth-limit", "Maximum nesting depth exceeded.", range);
        }
      } else if (value[0] === "\\") {
        const escaped = value.slice(1);
        if (escaped.length !== 1 || !"{}\\$%&#_ ".includes(escaped)) {
          fail("syntax", "Unsupported text escape.", range);
        }
        text += escaped;
      } else {
        text += value;
      }
    }
    return fail("syntax", "Expected a closing brace.", open.range);
  }

  #character(frame: Frame): string {
    const start = frame.position;
    const point = frame.source.codePointAt(start)!;
    frame.position += point > 0xffff ? 2 : 1;
    const value = frame.source.slice(start, frame.position);
    if (invalid.test(value)) fail("invalid-character", "Invalid XML character.", this.#range(frame, start));
    return value;
  }
}
