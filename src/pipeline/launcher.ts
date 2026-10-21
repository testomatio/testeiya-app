import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";

import type { Variables } from "./variables.js";

const KILL_GRACE_MS = 5_000;

/**
 * Starts one stage process at a time, streams its output, and stops its whole
 * process group on a timeout or Ctrl-C.
 */
export class Launcher {
  interrupted = false;
  private current: ChildProcess | null = null;

  constructor(private readonly cwd: string) {}

  watchInterrupt(): void {
    process.on("SIGINT", () => {
      this.interrupted = true;
      if (this.current) this.kill(this.current, "SIGINT");
    });
  }

  /** A shell command when `args` is null, otherwise a program and its arguments. */
  start(launch: Launch): Promise<Launched> {
    return new Promise((done) => {
      const options: SpawnOptions = { cwd: this.cwd, env: launch.vars.toEnv(), detached: true, stdio: ["ignore", "pipe", "pipe"] };
      let child: ChildProcess;
      if (launch.args) child = spawn(launch.command, launch.args, options);
      else child = spawn(launch.command, { ...options, shell: true });
      this.current = child;

      let file: WriteStream | null = null;
      if (launch.log) file = createWriteStream(launch.log);
      const forward = (chunk: Buffer) => {
        process.stderr.write(chunk);
        file?.write(chunk);
      };
      child.stdout?.on("data", forward);
      child.stderr?.on("data", forward);

      let timedOut = false;
      let timer: NodeJS.Timeout | undefined;
      if (launch.timeout) {
        timer = setTimeout(() => {
          timedOut = true;
          this.kill(child, "SIGTERM");
          setTimeout(() => this.kill(child, "SIGKILL"), KILL_GRACE_MS).unref();
        }, launch.timeout);
      }
      const finish = (code: number) => {
        clearTimeout(timer);
        this.current = null;
        file?.end();
        done({ code, timedOut, interrupted: this.interrupted });
      };
      child.on("error", (err) => {
        forward(Buffer.from(`${err.message}\n`));
        finish(127);
      });
      child.on("close", (code) => finish(code ?? 1));
    });
  }

  private kill(child: ChildProcess, signal: NodeJS.Signals): void {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  }
}

export interface Launch {
  command: string;
  args: string[] | null;
  vars: Variables;
  /** Where to copy the output, besides the console. */
  log: string | null;
  timeout?: number;
}

export interface Launched {
  code: number;
  timedOut: boolean;
  interrupted: boolean;
}
