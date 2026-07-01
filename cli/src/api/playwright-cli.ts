// Record / Stop / Screenshot for the live Playwright CLI browser session.
//
// The desktop UI's three buttons hit these endpoints; each runs the
// `@playwright/cli` we ship as a dependency against a shared named session
// (PW_SESSION_NAME). The agent's own `playwright-cli` calls default to the same
// session via the PLAYWRIGHT_CLI_SESSION env var (see configurePlaywrightCliEnv),
// so the buttons control whatever browser the agent launched.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { getSession, type StoredSession } from "../session-store.js";
import { HOME_DIR } from "../project-dir.js";
import { resolveTestomatioTarget } from "./testomatio-proxy.js";
import { uploadAttachmentToTestomatio } from "./testomatio-attachment.js";

const require = createRequire(import.meta.url);
const RUN_TIMEOUT_MS = 60_000;

/** Shared playwright-cli session name for the agent and these endpoints. */
export const PW_SESSION_NAME = process.env.PLAYWRIGHT_CLI_SESSION || "testeiya";

// All playwright-cli state lives here, under ~/.testeiya — never in the user's
// workspace: daemon/session data, snapshots/console/traces, the persistent
// browser profile (cookies/storage), and our recordings/screenshots.
const PW_HOME = path.join(HOME_DIR, "playwright-cli");
const PROFILE_DIR = path.join(PW_HOME, "profile");

// Last recording file per Testeiya session, so `stop` can report where it landed.
const recordings = new Map<string, string>();

let cachedBin: string | null | undefined;

/**
 * Make `playwright-cli` resolvable for the agent's `bash` tool and pin the
 * default browser session. Both inherit `process.env`, so this is the single
 * rendezvous between the agent's CLI calls and our API's CLI calls.
 */
export function configurePlaywrightCliEnv(): void {
  if (!process.env.PLAYWRIGHT_CLI_SESSION) {
    process.env.PLAYWRIGHT_CLI_SESSION = PW_SESSION_NAME;
  }
  // Redirect every CLI artifact out of the workspace into ~/.testeiya. These are
  // read at each `playwright-cli` invocation, so both the agent's bash launches
  // and our API launches inherit them.
  if (!process.env.PLAYWRIGHT_DAEMON_SESSION_DIR) {
    process.env.PLAYWRIGHT_DAEMON_SESSION_DIR = path.join(PW_HOME, "daemon");
  }
  if (!process.env.PLAYWRIGHT_MCP_OUTPUT_DIR) {
    process.env.PLAYWRIGHT_MCP_OUTPUT_DIR = path.join(PW_HOME, "output");
  }
  // Persist cookies/storage by default; incognito clears this at runtime.
  if (!process.env.PLAYWRIGHT_MCP_ISOLATED && !process.env.PLAYWRIGHT_MCP_USER_DATA_DIR) {
    process.env.PLAYWRIGHT_MCP_USER_DATA_DIR = PROFILE_DIR;
  }

  const binDir = resolveBinDir();
  if (!binDir) return;
  const parts = (process.env.PATH || "").split(path.delimiter);
  if (parts.includes(binDir)) return;
  process.env.PATH = [binDir, ...parts].join(path.delimiter);
}

export async function playwrightOpen(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  if (await isBrowserOpen(session.cwd)) return Response.json({ ok: true, browserOpen: true });
  const result = await runPlaywrightCli(["open", "--headed"], session.cwd);
  if (!result.ok) return cliError(result.output);
  return Response.json({ ok: true, browserOpen: true });
}

export async function playwrightClose(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  recordings.delete(session.sessionId);
  const result = await runPlaywrightCli(["close"], session.cwd);
  // Already closed is fine — the goal state (no browser) is reached either way.
  if (!result.ok && !isBrowserClosedError(result.output)) return cliError(result.output);
  return Response.json({ ok: true, browserOpen: false });
}

/**
 * Bring the live headed browser window to the foreground. `bringToFront()` is
 * Playwright's own "focus this window" — on headed Chromium it activates the
 * page and raises the OS window. No-op target when nothing is open, so guard.
 */
export async function playwrightFocus(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  if (!(await isBrowserOpen(session.cwd))) {
    return Response.json(
      { error: "No browser is open — start one first." },
      { status: 409 },
    );
  }
  const result = await runPlaywrightCli(
    ["run-code", "async (page) => { await page.bringToFront(); }"],
    session.cwd,
  );
  if (!result.ok) return cliError(result.output);
  return Response.json({ ok: true });
}

export async function playwrightRecord(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  await ensureBrowserOpen(session.cwd);
  const file = outputPath("recordings", "recording", "webm");
  const result = await runPlaywrightCli(["video-start", file], session.cwd);
  if (!result.ok) return cliError(result.output);
  recordings.set(session.sessionId, file);
  return Response.json({ ok: true, file });
}

export async function playwrightStop(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  const file = recordings.get(session.sessionId) ?? null;
  recordings.delete(session.sessionId);
  const result = await runPlaywrightCli(["video-stop"], session.cwd);
  // Browser already gone (crashed/closed) — the recording is over either way,
  // so report success with a flag instead of a hard error (which would leave the
  // UI stuck on "recording").
  if (!result.ok && isBrowserClosedError(result.output)) {
    return Response.json({ ok: true, file, browserClosed: true });
  }
  if (!result.ok) return cliError(result.output);
  return Response.json({ ok: true, file });
}

export async function playwrightScreenshot(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  const file = outputPath("screenshots", "screenshot", "png");
  const result = await runPlaywrightCli(["screenshot", `--filename=${file}`], session.cwd);
  // The CLI exits 0 even when no browser is open, so detect that explicitly.
  if (isBrowserClosedError(result.output)) {
    return Response.json(
      { error: "No browser is open — start one first (Record opens one automatically)." },
      { status: 409 },
    );
  }
  if (!result.ok) return cliError(result.output);
  if (!fs.existsSync(file)) return cliError(result.output || "Screenshot was not saved");
  return Response.json({ ok: true, file });
}

/**
 * Screenshot the live browser and upload it as an attachment on a Testomat.io
 * test run. Captures server-side (the token stays here) and forwards the PNG
 * to `${baseUrl}/api/{slug}/attachments?<context>`. Context ids (testrun_id,
 * run_id, test_id, …) ride on the request query.
 */
export async function playwrightAttachScreenshot(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  const target = resolveTestomatioTarget(session);
  if ("error" in target) {
    return Response.json({ error: target.error }, { status: 400 });
  }

  const file = outputPath("screenshots", "screenshot", "png");
  const result = await runPlaywrightCli(["screenshot", `--filename=${file}`], session.cwd);
  if (isBrowserClosedError(result.output)) {
    return Response.json(
      { error: "No browser is open — start one first." },
      { status: 409 },
    );
  }
  if (!result.ok || !fs.existsSync(file)) {
    return cliError(result.output || "Screenshot was not saved");
  }

  const blob = new Blob([fs.readFileSync(file)], { type: "image/png" });
  const context = new URL(req.url).searchParams;
  return uploadAttachmentToTestomatio(target, context, blob, path.basename(file));
}

/** Live state of the browser session, for the desktop client to reconcile. */
export async function playwrightStatus(req: Request): Promise<Response> {
  const session = await resolveSession(req);
  if (session instanceof Response) return session;

  const browserOpen = await isBrowserOpen(session.cwd);
  let recording = recordings.has(session.sessionId);
  // Browser vanished while we believed we were recording → the recording died.
  if (recording && !browserOpen) {
    recordings.delete(session.sessionId);
    recording = false;
  }
  return Response.json({ ok: true, browserOpen, recording, incognito: isIncognito() });
}

/** Toggle persistent vs incognito mode; restarts the browser if one is open. */
export async function playwrightIncognito(req: Request): Promise<Response> {
  let body: { session?: string; incognito?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body — fall through to the missing-session error */
  }
  if (!body.session) return Response.json({ error: "session required" }, { status: 400 });
  const session = getSession(body.session);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const incognito = !!body.incognito;
  setIncognitoEnv(incognito);
  // Mode only takes effect at launch, so restart a running browser to apply now.
  let browserOpen = await isBrowserOpen(session.cwd);
  if (browserOpen) {
    recordings.delete(session.sessionId);
    await runPlaywrightCli(["close"], session.cwd);
    const result = await runPlaywrightCli(["open", "--headed"], session.cwd);
    browserOpen = result.ok;
  }
  return Response.json({ ok: true, incognito, browserOpen });
}

async function resolveSession(req: Request): Promise<StoredSession | Response> {
  let sessionId = new URL(req.url).searchParams.get("session") || undefined;
  if (!sessionId) {
    try {
      const body = await req.json();
      sessionId = body?.session;
    } catch {
      /* empty/invalid body — fall through to the missing-session error */
    }
  }
  if (!sessionId) return Response.json({ error: "session required" }, { status: 400 });
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  return session;
}

// Open a headed browser for our session if it isn't already running, so Record
// works even before the agent has launched one.
async function ensureBrowserOpen(cwd: string): Promise<void> {
  if (await isBrowserOpen(cwd)) return;
  await runPlaywrightCli(["open", "--headed"], cwd);
}

async function isBrowserOpen(cwd: string): Promise<boolean> {
  return !!(await browserSession(cwd));
}

// The live browser entry for our session from `list --json`, or null. The daemon
// drops a crashed/closed browser immediately, so this is the source of truth for
// "is the session still alive".
async function browserSession(cwd: string): Promise<BrowserEntry | null> {
  const list = await runCli(["list", "--json"], cwd);
  if (!list.ok) return null;
  try {
    const browsers = JSON.parse(list.output)?.browsers;
    if (!Array.isArray(browsers)) return null;
    return browsers.find((b) => b?.name === PW_SESSION_NAME && b?.status === "open") ?? null;
  } catch {
    return null;
  }
}

/**
 * A `<browser_state>` notice describing the session's live browser (URL, tabs,
 * type), or null when none is open. Prepended to the user's prompt so the agent
 * knows a browser is already running and what it's showing. Never throws — a
 * flaky CLI must not block a message.
 */
export async function browserStateNotice(cwd: string): Promise<string | null> {
  try {
    const browser = await browserSession(cwd);
    if (!browser) return null;
    const tabs = await runPlaywrightCli(["tab-list", "--json"], cwd);
    const { url, title, count } = parseTabList(tabs.ok ? tabs.output : "");
    const headed = browser.headed ? "headed" : "headless";
    const mode = isIncognito() ? "incognito" : "persistent";
    const lines: string[] = [];
    if (url) lines.push(`URL: ${url}`);
    if (title) lines.push(`Title: ${title}`);
    lines.push(`Tabs: ${count || 1}`);
    lines.push(`Browser: ${browser.browserType || "chromium"}, ${headed}, ${mode}`);
    return `<browser_state>\n${lines.join("\n")}\n</browser_state>`;
  } catch {
    return null;
  }
}

function outputPath(sub: string, prefix: string, ext: string): string {
  const dir = path.join(PW_HOME, sub);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `${prefix}-${stamp}.${ext}`);
}

// `tab-list --json` returns `{ result: "- 0: [title](url)\n- 1: (current) [..]" }`.
// Pull the active tab's url/title and the total tab count out of that markdown.
function parseTabList(output: string): { url?: string; title?: string; count: number } {
  let result = "";
  try {
    result = JSON.parse(output)?.result ?? "";
  } catch {
    return { count: 0 };
  }
  const lines = result.split("\n").filter((l) => /^-\s*\d+:/.test(l));
  const current = lines.find((l) => /\(current\)/.test(l)) || lines[0] || "";
  const link = current.match(/\[([^\]]*)\]\(([^)]*)\)/);
  return { title: link?.[1], url: link?.[2], count: lines.length };
}

function cliError(output: string): Response {
  const message = output.trim() || "playwright-cli command failed";
  return Response.json({ error: message }, { status: 500 });
}

function isIncognito(): boolean {
  return process.env.PLAYWRIGHT_MCP_ISOLATED === "true";
}

// Flip the process env both the agent and our launches read. Incognito drops the
// persistent profile (isolated, in-memory); persistent restores it.
function setIncognitoEnv(incognito: boolean): void {
  if (incognito) {
    process.env.PLAYWRIGHT_MCP_ISOLATED = "true";
    delete process.env.PLAYWRIGHT_MCP_USER_DATA_DIR;
    return;
  }
  delete process.env.PLAYWRIGHT_MCP_ISOLATED;
  process.env.PLAYWRIGHT_MCP_USER_DATA_DIR = PROFILE_DIR;
}

// playwright-cli reports a closed/crashed session as "The browser '<name>' is
// not open" (sometimes on a zero exit code), across stop/screenshot/etc.
function isBrowserClosedError(output: string): boolean {
  return /is not open/i.test(output);
}

/** Run a session-scoped command (prepends `-s=<session>` before the command). */
function runPlaywrightCli(args: string[], cwd: string): Promise<CliResult> {
  return runCli([`-s=${PW_SESSION_NAME}`, ...args], cwd);
}

function runCli(args: string[], cwd: string): Promise<CliResult> {
  const bin = resolveBin();
  let command = "playwright-cli";
  let fullArgs = args;
  if (bin) {
    command = process.execPath;
    fullArgs = [bin, ...args];
  }

  return new Promise<CliResult>((resolve) => {
    const child = spawn(command, fullArgs, { cwd, env: process.env });
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      output += `\n[playwright-cli] timed out after ${RUN_TIMEOUT_MS}ms`;
    }, RUN_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `${output}\n${err.message}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}

/** Resolve the shipped playwright-cli entry, cached after the first lookup. */
function resolveBin(): string | null {
  if (cachedBin !== undefined) return cachedBin;
  cachedBin = null;
  try {
    const pkgPath = require.resolve("@playwright/cli/package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    let binRel = pkg.bin;
    if (binRel && typeof binRel === "object") {
      binRel = binRel["playwright-cli"] ?? Object.values(binRel)[0];
    }
    if (binRel && typeof binRel === "string") {
      cachedBin = path.resolve(path.dirname(pkgPath), binRel);
    }
  } catch {
    /* not resolvable — runCli falls back to the PATH-resolved bin */
  }
  return cachedBin;
}

function resolveBinDir(): string | null {
  try {
    const pkgPath = require.resolve("@playwright/cli/package.json");
    return path.join(path.dirname(pkgPath), "..", "..", ".bin");
  } catch {
    return null;
  }
}

interface CliResult {
  ok: boolean;
  output: string;
}

interface BrowserEntry {
  name?: string;
  status?: string;
  browserType?: string;
  headed?: boolean;
  persistent?: boolean;
}
