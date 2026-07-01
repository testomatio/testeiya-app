import { sep } from "node:path";
import { WORKSPACES_DIR } from "./project-dir.js";
import type { TesteiyaConfig } from "./config.js";

type ExtensionFactory = (pi: any) => void;

const READ_TOOLS = ["read", "grep", "find", "ls"];
const WRITE_TOOLS = ["write", "edit"];

// Bash commands that are read-only and safe to auto-allow
const SAFE_BASH_PREFIXES = [
  "cat ", "head ", "tail ", "less ", "more ",
  "ls ", "ls\n", "ls",
  "dir ", "tree ", "tree\n", "tree",
  "find ", "grep ", "rg ", "ag ",
  "wc ", "wc\n",
  "file ", "stat ",
  "pwd", "pwd\n",
  "echo ", "printf ",
  "git log", "git show", "git diff", "git status", "git branch", "git blame", "git rev-parse",
  "git remote", "git tag", "git stash list",
  "node -e", "node --eval", "npx tsc --noEmit",
  "npm list", "npm ls", "npm view", "npm outdated",
  "which ", "type ", "env", "printenv",
  "date", "whoami", "hostname", "uname",
  "jq ", "sed -n", "awk ",
  "diff ", "cmp ",
  "du ", "df ",
  "curl -s", "curl --silent", "wget -q",
];

// Patterns that indicate destructive operations - always block
const DANGEROUS_PATTERNS = [
  "rm ", "rm\n", "rmdir ",
  "mv ", "cp ",
  "> ", ">> ", "| tee ",
  "chmod ", "chown ", "chgrp ",
  "kill ", "pkill ",
  "sudo ",
  "git push", "git reset", "git checkout", "git clean", "git rebase",
  "npm install", "npm uninstall", "npm update", "npm publish",
  "mktemp", "mkdir ",
];

function isReadOnlyBash(command: string): boolean {
  const trimmed = command.trim();

  // Check dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    if (trimmed.includes(pattern)) {
      return false;
    }
  }

  // Check if starts with a safe prefix
  for (const prefix of SAFE_BASH_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return true;
    }
  }

  // Piped commands: check if first command is safe and none are dangerous
  if (trimmed.includes("|")) {
    const first = trimmed.split("|")[0].trim();
    for (const prefix of SAFE_BASH_PREFIXES) {
      if (first.startsWith(prefix)) {
        return true;
      }
    }
  }

  return false;
}

export function createPermissionExtension(config: TesteiyaConfig, cwd: string): ExtensionFactory {
  // Managed per-project workspaces (~/.testeiya/workspaces/*) are Testeiya-owned
  // pulled markdown, not the user's source — grant full access there and keep the
  // read-only gating only for folders the user opened.
  const fullAccess = isManagedWorkspace(cwd);
  return (pi) => {
    pi.on("tool_call", async (event: any, _ctx: any) => {
      if (fullAccess) {
        return undefined;
      }

      // Read tools: always allow
      if (READ_TOOLS.includes(event.toolName)) {
        return undefined;
      }

      // Write/edit tools: block
      if (config.permissions.blockWrites && WRITE_TOOLS.includes(event.toolName)) {
        return { block: true, reason: "Write operations are blocked. Testeiya is in read-only mode." };
      }

      // Bash: allow read-only commands, block the rest
      if (config.permissions.blockBash && event.toolName === "bash") {
        const command = event.input?.command || "";
        if (isReadOnlyBash(command)) {
          return undefined;
        }
        return {
          block: true,
          reason: `Bash command blocked (not in read-only allowlist): ${command.slice(0, 100)}`,
        };
      }

      return undefined;
    });
  };
}

function isManagedWorkspace(cwd: string): boolean {
  return cwd === WORKSPACES_DIR || cwd.startsWith(WORKSPACES_DIR + sep);
}
