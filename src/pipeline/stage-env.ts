import type { Env } from "./variables.js";

/**
 * A stage's env for the length of its run, in this process. Stages run one at
 * a time, so the agent, its shell and every child it starts read it from
 * `process.env` like a spawned stage would. The object is kept: Node's env
 * coerces values to strings, and on Windows its keys are case-insensitive.
 */
export class StageEnv {
  constructor(private readonly vars: Env) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    const saved = { ...process.env };
    this.replace(this.vars);
    try {
      return await work();
    } finally {
      this.replace(saved);
    }
  }

  private replace(values: Env): void {
    for (const key of Object.keys(process.env)) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key] = value;
    }
  }
}
