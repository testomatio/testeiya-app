import { Liquid } from "liquidjs";

/**
 * The variables the runner sets itself. `Variables.builtins` is the only way to
 * set them, so a new one has to be added here, and a UI never asks for one.
 */
export const BUILTIN_VARIABLES = [
  "GIT_BRANCH",
  "PIPELINE_DIR",
  "PIPELINE_NAME",
  "PIPELINE_ROUND",
  "PIPELINE_RESUME",
  "STAGE_DIR",
  "ITEM",
  "ITEM_NAME",
] as const;

export type BuiltinVariable = (typeof BUILTIN_VARIABLES)[number];

/** `${NAME}`, `${NAME:-default}` or `${NAME | filter | filter: arg}`. */
const REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*)|(\s*\|[^}]*))?\}/g;

/** Liquid's filters, and ours for URLs. Only expressions: Liquid's tags never run. */
const liquid = new Liquid({ strictFilters: true });
liquid.registerFilter("host", (value: unknown) => url(value)?.host ?? "");
liquid.registerFilter("path", (value: unknown) => url(value)?.pathname ?? "");

/** The environment a pipeline runs in, and `${NAME}` expansion over it. */
export class Variables {
  constructor(private readonly values: Env) {}

  /** Why the filters in `text` cannot run, or null. */
  static problem(text: string): string | null {
    for (const [, name, , filters] of text.matchAll(REFERENCE)) {
      if (!filters) continue;
      try {
        liquid.evalValueSync(`${name}${filters}`, {});
      } catch (err) {
        return `\${${name}${filters}}: ${(err as Error).message.split("\n")[0]}`;
      }
    }
    return null;
  }

  /** The `${NAME}` references in text the runner expands, with their `:-` defaults. */
  static references(text: string): Reference[] {
    return [...text.matchAll(REFERENCE)].map(([, name, fallback]) => Variables.reference(name, fallback));
  }

  /**
   * The variables a shell command reads: `$NAME`, `${NAME}`, `${NAME:-x}`,
   * `${NAME-x}`, `${NAME:+x}`. Not inside single quotes or after a backslash,
   * and not a name the command assigns itself, like `NAME=x cmd` or `for NAME in`.
   */
  static shellReferences(text: string): Reference[] {
    const assigned = new Set<string>();
    for (const [, name] of text.matchAll(/(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=/g)) assigned.add(name);
    for (const [, name] of text.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g)) assigned.add(name);
    const references: Reference[] = [];
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === "\\") {
        index++;
        continue;
      }
      if (char === '"') quoted = !quoted;
      if (char === "'" && !quoted) {
        const end = text.indexOf("'", index + 1);
        index = end < 0 ? text.length : end;
        continue;
      }
      if (char !== "$") continue;
      const rest = text.slice(index);
      // A default is scanned on, so `${A:-$B}` reads B too.
      const braced = rest.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-=+?])([^}]*))?\}/);
      const plain = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)/);
      const name = braced?.[1] ?? plain?.[1];
      if (!name) continue;
      index += name.length + (braced ? 1 : 0);
      if (assigned.has(name)) continue;
      const fallback = braced && ["-", ":-", "=", ":="].includes(braced[2]) ? braced[3] : undefined;
      references.push(Variables.reference(name, fallback));
    }
    return references;
  }

  /** Values only the runner sets. */
  static builtins(values: Partial<Record<BuiltinVariable, string>>): Env {
    return { ...values };
  }

  private static reference(name: string, fallback?: string): Reference {
    return fallback === undefined ? { name } : { name, default: fallback };
  }

  /** Whether `text` uses a filter. */
  static filtered(text: string): boolean {
    return [...text.matchAll(REFERENCE)].some((match) => match[3]);
  }

  get(name: string): string | undefined {
    return this.values[name];
  }

  /** `${NAME}` and `${NAME:-default}`, the shell's rule: unset is empty. A `|` runs Liquid filters. */
  expand(text: string): string {
    return text.replace(REFERENCE, (_, name: string, fallback?: string, filters?: string) => {
      if (filters) return String(liquid.evalValueSync(`${name}${filters}`, this.values) ?? "");
      const value = this.values[name];
      if (value) return value;
      return fallback ?? "";
    });
  }

  /** A copy with more variables, taken as they are. */
  with(extra: Env): Variables {
    return new Variables({ ...this.values, ...extra });
  }

  /** A copy with more variables, each expanded against the ones before it. */
  withExpanded(extra: Record<string, string>): Variables {
    const values: Env = { ...this.values };
    for (const [key, value] of Object.entries(extra)) values[key] = new Variables(values).expand(value);
    return new Variables(values);
  }

  without(names: string[]): Variables {
    const values: Env = { ...this.values };
    for (const name of names) delete values[name];
    return new Variables(values);
  }

  /** For a child process. */
  toEnv(): Env {
    return { ...this.values };
  }
}

function url(value: unknown): URL | null {
  if (typeof value !== "string" || !URL.canParse(value)) return null;
  return new URL(value);
}

export type Env = Record<string, string | undefined>;

export interface Reference {
  name: string;
  default?: string;
}
