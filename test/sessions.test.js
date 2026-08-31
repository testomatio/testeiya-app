import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { lastCheckpoint, saveCheckpoint } from "../dist/src/checkpoint.js";
import { openSessionManager } from "../dist/src/sessions.js";

const CLI = fileURLToPath(new URL("../dist/src/cli.js", import.meta.url));
const CHECKPOINT = { commit: "1a2b3c4d5e6f", at: "2026-08-01T10:00:00.000Z", pr: 42 };

test("--session-file carries a thread between runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-session-"));
  const file = join(dir, "cache", "pr-42.jsonl");

  const first = await openSessionManager(dir, { sessionFile: file });
  round(first);
  saveCheckpoint(first, CHECKPOINT);
  assert.ok(existsSync(file), "the first round writes the file it was given");

  const second = await openSessionManager(dir, { sessionFile: file });
  assert.deepEqual(lastCheckpoint(second), CHECKPOINT);
  assert.equal(second.getEntries().length, first.getEntries().length);
});

test("a relative --session-file resolves against the working directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-session-"));
  const manager = await openSessionManager(dir, { sessionFile: "run.jsonl" });
  round(manager);
  assert.ok(existsSync(join(dir, "run.jsonl")));
});

test("a session file that is not one is a usage error, not a crash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-session-"));
  const file = join(dir, "broken.jsonl");
  writeFileSync(file, "not a session\n");
  const opened = await openSessionManager(dir, { sessionFile: file });
  assert.equal(typeof opened, "string");
  assert.match(opened, /broken\.jsonl/);
});

test("--no-session wins over a session file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-session-"));
  const file = join(dir, "unused.jsonl");
  const manager = await openSessionManager(dir, { sessionFile: file, noSession: true });
  round(manager);
  assert.equal(manager.isPersisted(), false);
  assert.equal(existsSync(file), false);
});

test("a named session beats TESTEIYA_SESSION_FILE from the environment", () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-session-"));
  const file = join(dir, "ambient.jsonl");
  writeFileSync(file, "not a session\n");
  // An unusable file is the tell: reaching it at all means the env var won.
  assert.match(cli(dir, ["task", "x", "--session", "pr-42"], file), /no model/);
  assert.match(cli(dir, ["task", "x"], file), /cannot open/);
});

function cli(cwd, args, sessionFile) {
  const env = { ...process.env, TESTEIYA_SESSION_FILE: sessionFile };
  delete env.TESTEIYA_MODEL;
  try {
    return execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
}

// Nothing reaches disk until a round has an assistant message, so a test that
// wants a file has to finish one.
function round(manager) {
  manager.appendMessage({ role: "user", content: "review the checkout suite", timestamp: Date.now() });
  manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test",
    usage: { input: 0, output: 0 },
    stopReason: "stop",
    timestamp: Date.now(),
  });
}
