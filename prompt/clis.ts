import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Where a tracker question goes when a CLI is on PATH next to the MCP server.
 * Never names a binary this machine lacks.
 */
export function cliRouting(): string {
  const lines = ["* GitHub issues and projects: through MCP."];
  if (onPath("gh")) {
    lines.push(
      "* Pull requests and repositories: `gh` in `bash`. When a PR question needs issue detail, query the issue through MCP; never infer it from a PR title."
    );
  }
  if (onPath("acli")) {
    lines.push(
      "* Jira in bulk (many issues at once), boards, sprints and filters: `acli` in `bash`, per the `atlassian` skill. Confluence and attachments have no `acli` command and stay on MCP."
    );
  }
  if (onPath("glab")) {
    lines.push(
      "* GitLab releases, labels, milestones, snippets, CI artifacts, and any endpoint with no MCP tool: `glab` in `bash`. Issues, merge requests, pipelines and code search stay on MCP."
    );
  }
  return lines.join("\n");
}

/** The CLIs Testeiya knows, as the connections list names them. */
export function pathClis(): string[] {
  return KNOWN_CLIS.filter((c) => onPath(c.bin)).map((c) => c.label);
}

function onPath(bin: string): boolean {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    if (existsSync(join(dir, bin)) || existsSync(join(dir, `${bin}.exe`))) return true;
  }
  return false;
}

const KNOWN_CLIS = [
  { bin: "gh", label: "gh (GitHub CLI)" },
  { bin: "acli", label: "acli (Atlassian CLI)" },
  { bin: "glab", label: "glab (GitLab CLI)" },
];
