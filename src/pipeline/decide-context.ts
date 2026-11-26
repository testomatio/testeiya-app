import { spawn } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";

import { Decider } from "../decision.js";
import type { DecideContext } from "./spec.js";
import type { Variables } from "./variables.js";

const SH_LIMIT_MS = 30_000;

/** Where a decide's context is read from. A prerequisite has no stages and no sessions yet. */
export interface ContextSources {
  /** The checkout: commands run here, and files not in the stage's folder are found here. */
  cwd: string;
  /** The stage's own folder, searched for files first. */
  dir?: string;
  vars: Variables;
  /** An earlier stage's report or log, or why there is none. */
  stage?: (id: string) => { file?: string; reason?: string };
  /** The file of a named session. */
  session?: (name: string) => string;
}

/**
 * What a decision model judges a question against: one named block of text per
 * entry of `context`. It has no tools, so this is all it sees. A source that is
 * missing says so in its block instead of being left out.
 */
export class ContextReader {
  constructor(private readonly sources: ContextSources) {}

  async read(context: DecideContext): Promise<Record<string, string>> {
    const state: Record<string, string> = {};
    for (const id of context.stages) state[`stage ${id}`] = this.stage(id);
    for (const name of context.sessions) state[`session ${name}`] = this.session(name);
    for (const mask of context.files) Object.assign(state, this.files(mask));
    for (const command of context.sh) state[`$ ${command}`] = await this.sh(command);
    return state;
  }

  private stage(id: string): string {
    const result = this.sources.stage?.(id) ?? {};
    if (result.file && existsSync(result.file)) return readFileSync(result.file, "utf8");
    return `(stage ${id} left no report: ${result.reason ?? "it did not run"})`;
  }

  /** The session's last assistant answer. */
  private session(name: string): string {
    const path = this.sources.session?.(name);
    if (!path || !existsSync(path)) return `(session ${name} has no answer yet)`;
    const messages = SessionManager.open(path).buildSessionContext().messages as Array<{ role?: string; content?: unknown }>;
    const last = messages.filter((message) => message.role === "assistant").map(ContextReader.text).filter(Boolean).at(-1);
    return last ?? `(session ${name} has no answer yet)`;
  }

  private static text(message: { content?: unknown }): string {
    const { content } = message;
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content
      .filter((part): part is { type: string; text: string } => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }

  /** A path or a mask: in the stage's folder first, then in the checkout. */
  private files(mask: string): Record<string, string> {
    for (const base of [this.sources.dir, this.sources.cwd]) {
      if (!base) continue;
      const found = globSync(mask, { cwd: base }).sort();
      if (found.length > 0) return Decider.state(found.map((path) => join(base, path)), undefined, base);
    }
    return { [mask]: "(no such file)" };
  }

  /** What the command prints. One that fails says how, with what it printed to stderr. */
  private sh(command: string): Promise<string> {
    const { cwd, vars } = this.sources;
    return new Promise((done) => {
      const child = spawn(command, { shell: true, cwd, env: vars.toEnv(), stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
      const timer = setTimeout(() => child.kill("SIGKILL"), SH_LIMIT_MS);
      child.on("error", (error) => {
        clearTimeout(timer);
        done(`(could not run: ${error.message})`);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        if (code === 0) done(out);
        else done(`${out}\n(exit ${code ?? signal}${err.trim() ? `: ${err.trim()}` : ""})`.trim());
      });
    });
  }
}
