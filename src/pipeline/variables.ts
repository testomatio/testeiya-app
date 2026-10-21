/** The environment a pipeline runs in, and `${NAME}` expansion over it. */
export class Variables {
  constructor(private readonly values: Env) {}

  get(name: string): string | undefined {
    return this.values[name];
  }

  /** `${NAME}` and `${NAME:-default}`, the shell's rule: unset is empty. */
  expand(text: string): string {
    return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) => {
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

export type Env = Record<string, string | undefined>;
