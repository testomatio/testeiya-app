import { Liquid } from "liquidjs";

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
