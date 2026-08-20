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

  if (args.resume) {
    const sessions = await SessionManager.list(cwd);
    const found = sessions.find((s) => s.id === args.resume || s.id.startsWith(args.resume ?? ""));
    if (!found) return `no session "${args.resume}" in this folder`;
    return SessionManager.open(found.path);
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
    process.stdout.write(`  ${session.id.slice(0, 8)}  ${when}  ${session.messageCount} msg  ${label}\n`);
  }
  process.stdout.write("\n  Continue one with:  testeiya task \"...\" --resume <id>\n\n");
  return 0;
}

export interface SessionArgs {
  continueLast?: boolean;
  resume?: string;
  noSession?: boolean;
}

export interface SavedModel {
  provider: string;
  modelId: string;
}
