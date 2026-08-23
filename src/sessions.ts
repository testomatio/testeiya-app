import { buildSessionContext, SessionManager } from "@earendil-works/pi-coding-agent";

/**
 * Sessions are pi's, not ours: it stores, lists and reopens them under
 * PI_STATE_DIR. `--no-session` keeps a run entirely in memory.
 */
export async function openSessionManager(
  cwd: string,
  args: SessionArgs
): Promise<SessionManager | string> {
  if (args.noSession) return SessionManager.inMemory(cwd);

  // One label, one thread: a CI job that restores the same store every round
  // says --session <label> and never has to know whether a session exists yet.
  if (args.session) {
    const sessions = await SessionManager.list(cwd);
    const named = sessions.find((s) => s.name === args.session);
    if (named) return SessionManager.open(named.path);
    const manager = SessionManager.create(cwd);
    manager.appendSessionInfo(args.session);
    return manager;
  }

  if (args.resume) {
    const sessions = await SessionManager.list(cwd);
    const matched = sessions.filter((s) => s.id.startsWith(args.resume ?? ""));
    if (matched.length === 0) return `no session "${args.resume}" in this folder`;
    if (matched.length > 1) {
      const ids = matched.map((s) => shortId(s.id)).join(", ");
      return `"${args.resume}" matches ${matched.length} sessions: ${ids}`;
    }
    return SessionManager.open(matched[0]!.path);
  }

  if (args.continueLast) return SessionManager.continueRecent(cwd);
  return SessionManager.create(cwd);
}

/** The model a resumed session was last running, so `-c` needs no --model. */
export function sessionModel(manager: SessionManager): SavedModel | null {
  const entries = manager.getEntries();
  if (entries.length === 0) return null;
  return buildSessionContext(entries, manager.getLeafId()).model;
}

export async function runSessions(cwd: string, json?: boolean): Promise<number> {
  const sessions = await SessionManager.list(cwd);

  if (json) {
    const rows = sessions.map((s) => ({
      id: s.id,
      name: s.name ?? null,
      modified: s.modified.toISOString(),
      messages: s.messageCount,
      first: s.firstMessage,
    }));
    process.stdout.write(`${JSON.stringify({ sessions: rows }, null, 2)}\n`);
    return 0;
  }

  if (sessions.length === 0) {
    process.stdout.write("  no saved sessions in this folder\n");
    return 0;
  }

  process.stdout.write("\n");
  for (const session of sessions) {
    const label = session.name ?? session.firstMessage.slice(0, 60);
    const when = session.modified.toISOString().slice(0, 16).replace("T", " ");
    process.stdout.write(`  ${shortId(session.id)}  ${when}  ${session.messageCount} msg  ${label}\n`);
  }
  process.stdout.write("\n  Continue one with:  testeiya task \"...\" --resume <id>\n\n");
  return 0;
}

/** Long enough to clear the UUIDv7 timestamp prefix, which repeats per minute. */
export function shortId(id: string): string {
  return id.slice(0, 13);
}

export interface SessionArgs {
  continueLast?: boolean;
  resume?: string;
  session?: string;
  noSession?: boolean;
}

export interface SavedModel {
  provider: string;
  modelId: string;
}
