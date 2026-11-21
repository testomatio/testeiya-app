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

/** The environment a pipeline runs in. Formulas read it as `vars`; a shell gets it as its environment. */
export class Variables {
  constructor(private readonly values: Env) {}

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

  get(name: string): string | undefined {
    return this.values[name];
  }

  /** A copy with more variables, taken as they are. */
  with(extra: Env): Variables {
    return new Variables({ ...this.values, ...extra });
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

export type Env = Record<string, string | undefined>;

export interface Reference {
  name: string;
  default?: string;
}
