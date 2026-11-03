import { mkdirSync } from "node:fs";
import { delimiter, join } from "node:path";

import { UsageError } from "../model.js";
import type { Launcher } from "./launcher.js";
import { log } from "./log.js";
import { PACKAGES_DIR } from "./state.js";
import type { Variables } from "./variables.js";

const INSTALL_TIMEOUT_MS = 10 * 60_000;

/**
 * The npm packages a pipeline's stages call. They install once per run as
 * global packages of the pipeline folder's own npm prefix, which every stage
 * gets as `npm_config_prefix`: `npx explorbot` runs the installed copy, and
 * the binaries are first on PATH as well.
 */
export class Packages {
  constructor(private readonly versions: Record<string, string>) {}

  /** `name@version` for each, versions expanded. Empty means latest, and a leading `@` is dropped. */
  specs(vars: Variables): string[] {
    return Object.entries(this.versions).map(([name, version]) => {
      const wanted = vars.expand(version).trim().replace(/^@/, "") || "latest";
      return `${name}@${wanted}`;
    });
  }

  /** Installs into `dir`, then returns the variables that point npm and PATH at it. */
  async install(dir: string, launcher: Launcher, vars: Variables): Promise<Variables> {
    if (Object.keys(this.versions).length === 0) return vars;
    const prefix = join(dir, PACKAGES_DIR);
    mkdirSync(prefix, { recursive: true });

    const args = ["install", "--global", "--prefix", prefix, "--no-audit", "--no-fund", "--loglevel=error", ...this.specs(vars)];
    const logFile = join(prefix, "install.log");
    log.command(`npm ${args.join(" ")}`);
    const done = await launcher.start({ command: "npm", args, vars, log: logFile, timeout: INSTALL_TIMEOUT_MS });
    if (done.code !== 0) throw new UsageError(`could not install packages: npm exited ${done.code}. Log: ${logFile}`);

    // npm puts global binaries in the prefix itself on Windows, in its bin folder elsewhere.
    let bin = join(prefix, "bin");
    if (process.platform === "win32") bin = prefix;
    let path = bin;
    const current = vars.get("PATH");
    if (current) path = `${bin}${delimiter}${current}`;
    return vars.with({ npm_config_prefix: prefix, PATH: path });
  }
}
