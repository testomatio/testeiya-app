import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENVIRONMENT_VARIABLES } from "testeiya/pipeline";
import { USAGE } from "../dist/src/args.js";
import { PROVIDER_KEYS } from "../dist/src/model.js";

// Set by a CI job or the OS, written for a child process, or an alias: never set by hand.
const NOT_OURS = new Set([
  "APPDATA", "LOCALAPPDATA", "PATH", "CI",
  "BITBUCKET_BRANCH", "BITBUCKET_PR_DESTINATION_BRANCH",
  "CI_MERGE_REQUEST_SOURCE_BRANCH_NAME", "CI_MERGE_REQUEST_TARGET_BRANCH_NAME",
  "GITHUB_BASE_REF", "GITHUB_EVENT_PATH", "GITHUB_HEAD_REF", "GITHUB_REF", "GITHUB_SHA",
  "PI_CODING_AGENT_DIR", "TESTOMATIO_BASE_URL", "LANGFUSE_BASEURL",
]);

function sources(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"));
}

test("every variable the source reads is listed", () => {
  const listed = new Set(ENVIRONMENT_VARIABLES.map((variable) => variable.name));
  const read = new Set();
  for (const text of [...sources("src"), ...sources("prompt")]) {
    for (const [, name] of text.matchAll(/env(?:\.|\[")([A-Z][A-Z0-9_]+)/g)) read.add(name);
  }
  const missing = [...read].filter((name) => !listed.has(name) && !NOT_OURS.has(name));
  assert.deepEqual(missing, [], "add these to src/environment.ts");
  for (const { env } of PROVIDER_KEYS) assert.ok(listed.has(env), `${env} is a provider key`);
});

test("--help lists every variable, and the MCP one is a secret", () => {
  for (const { name } of ENVIRONMENT_VARIABLES) assert.match(USAGE, new RegExp(`\\b${name}\\b`));
  const mcp = ENVIRONMENT_VARIABLES.find((variable) => variable.name === "TESTEIYA_MCP_SERVERS");
  assert.equal(mcp.secret, true);
  assert.equal(mcp.flag, "--mcp");
});
