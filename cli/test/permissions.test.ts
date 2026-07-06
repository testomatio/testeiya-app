import { test, expect, describe } from "bun:test";
import path from "node:path";
import { createPermissionExtension } from "../src/permissions.js";
import { WORKSPACES_DIR } from "../src/project-dir.js";
import type { TesteiyaConfig } from "../src/config.js";

const config = {
  permissions: { autoAllowRead: true, blockWrites: true, blockBash: true },
} as TesteiyaConfig;

function gate(cwd: string, trusted: boolean) {
  let handler: (event: any) => Promise<any> = async () => undefined;
  const pi = { on: (_e: string, cb: (event: any) => Promise<any>) => { handler = cb; } };
  createPermissionExtension(config, cwd, trusted)(pi);
  return handler;
}

describe("createPermissionExtension", () => {
  test("an untrusted opened folder blocks writes", async () => {
    const decide = gate("/home/user/some-repo", false);
    const res = await decide({ toolName: "write", input: {} });
    expect(res?.block).toBe(true);
  });

  test("a trusted (explicitly opened) folder allows writes and bash", async () => {
    const decide = gate("/home/user/e2e-tests", true);
    expect(await decide({ toolName: "write", input: {} })).toBeUndefined();
    expect(await decide({ toolName: "bash", input: { command: "npm test" } })).toBeUndefined();
  });

  test("a managed workspace stays writable without the trusted flag", async () => {
    const decide = gate(path.join(WORKSPACES_DIR, "proj-1"), false);
    expect(await decide({ toolName: "write", input: {} })).toBeUndefined();
  });

  test("read tools are always allowed even when untrusted", async () => {
    const decide = gate("/home/user/some-repo", false);
    expect(await decide({ toolName: "read", input: {} })).toBeUndefined();
  });
});
