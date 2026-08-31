import { spawn } from "node:child_process";

/** Run a command and collect it. Never throws: a missing binary is code 127. */
export function run(command: string, args: string[], options?: RunOptions): Promise<Executed> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: options?.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => done({ code: 127, stdout, stderr: err.message }));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
    if (options?.stdin) child.stdin.write(options.stdin);
    child.stdin.end();
  });
}

export interface RunOptions {
  cwd?: string;
  stdin?: string;
}

export interface Executed {
  code: number;
  stdout: string;
  stderr: string;
}
