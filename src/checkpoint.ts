import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { run } from "./exec.js";

const CHECKPOINT = "testeiya:checkpoint";

/**
 * Where the checkout stood when a round finished. A resumed session carries the
 * conversation but not the world it happened in: CI hands the next round a new
 * commit and a thread of comments the transcript has never seen, and an agent
 * that does not know that answers about code nobody is looking at any more.
 */
export async function readCheckpoint(cwd: string, pr?: number): Promise<Checkpoint | null> {
  const commit = await git(cwd, ["rev-parse", "HEAD"]);
  if (!commit) return null;
  const checkpoint: Checkpoint = { commit, at: new Date().toISOString() };
  const branch = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch && branch !== "HEAD") checkpoint.branch = branch;
  const remote = await git(cwd, ["remote", "get-url", "origin"]);
  if (remote) checkpoint.remote = remote;
  if (pr) checkpoint.pr = pr;
  return checkpoint;
}

/** The checkpoint the last round left behind, if this session has one. */
export function lastCheckpoint(manager: SessionManager): Checkpoint | null {
  const entries = manager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "custom") continue;
    if (entry.customType !== CHECKPOINT) continue;
    return (entry.data as Checkpoint) ?? null;
  }
  return null;
}

/**
 * Written only when the round produced something, so a broken run leaves the
 * older commit standing and the next one still reads everything since.
 */
export function saveCheckpoint(manager: SessionManager, checkpoint: Checkpoint): void {
  if (!manager.isPersisted()) return;
  manager.appendCustomEntry(CHECKPOINT, checkpoint);
}

/**
 * What the agent has to catch up on, as a procedure it can run. Nothing moved
 * means nothing is said — an unchanged checkout on a fresh comment still gets
 * the pull request line, which is the whole point of a comment round.
 */
export function describeUpdate(previous: Checkpoint | null, current: Checkpoint | null): string | null {
  if (!previous || !current) return null;
  const lines: string[] = [];

  if (previous.remote && current.remote && previous.remote !== current.remote) {
    lines.push(`- This is a different repository than your last round (${previous.remote}). Nothing you read then still applies. Read the code here before you answer.`);
  } else if (previous.commit !== current.commit) {
    const from = short(previous.commit);
    const branch = current.branch ? ` on ${current.branch}` : "";
    lines.push(`- The checkout moved from ${from} to ${short(current.commit)}${branch}. Read \`git log --oneline ${from}..HEAD\` and \`git diff ${from}...HEAD\` before you answer — that is the work you have not seen.`);
    lines.push(`- If ${from} is not in this clone, fetch it (\`git fetch --unshallow\` on a shallow CI checkout). If it stays unreachable the branch was rebased, so review the current diff as new.`);
  }

  const pr = current.pr ?? previous.pr;
  if (pr) {
    lines.push(`- Pull request #${pr} may have collected comments since ${previous.at}. Read them with \`gh pr view ${pr} --comments\` and answer what is still open. Your own last comment is already in that thread — never post it again. Write only what is new since it.`);
  }

  if (lines.length === 0) return null;
  return `Since your last round:\n\n${lines.join("\n")}`;
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  const result = await run("git", args, { cwd });
  if (result.code !== 0) return null;
  const value = result.stdout.trim();
  if (!value) return null;
  return value;
}

function short(commit: string): string {
  return commit.slice(0, 7);
}

export interface Checkpoint {
  commit: string;
  /** ISO timestamp of the round that wrote it — the cut-off for "new comments". */
  at: string;
  branch?: string;
  remote?: string;
  pr?: number;
}
