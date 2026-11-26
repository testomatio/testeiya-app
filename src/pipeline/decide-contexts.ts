import type { DecideContext } from "./spec.js";

type Kind = keyof DecideContext;

/** A decide's `context:` as the file writes it, into lists. No Node imports: the parser uses it in a browser. */
export class DecideContexts {
  static readonly kinds: readonly Kind[] = ["stages", "sessions", "files", "sh"];

  static empty(): DecideContext {
    return { stages: [], sessions: [], files: [], sh: [] };
  }

  /** Each kind one entry or a list, as the DSL's `stages+` allows; `entry` makes each its text. */
  static read(value: unknown, entry: (item: unknown, kind: Kind, index: number) => string): DecideContext {
    const context = DecideContexts.empty();
    if (typeof value !== "object" || value === null || Array.isArray(value)) return context;
    for (const kind of DecideContexts.kinds) {
      const items = (value as Record<string, unknown>)[kind];
      const list = items === undefined || items === null ? [] : Array.isArray(items) ? items : [items];
      context[kind] = list.map((item, index) => entry(item, kind, index));
    }
    return context;
  }

  static isEmpty(context: DecideContext): boolean {
    return DecideContexts.kinds.every((kind) => context[kind].length === 0);
  }
}
