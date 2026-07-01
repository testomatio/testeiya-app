import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-home-"));
process.env.HOME = home;
const store = await import("../src/session-store.js");
const { mcpAdd } = await import("../src/api/mcp.js");

let counter = 0;

test("custom MCP command is rejected (403) and not persisted when not opted in", async () => {
  delete process.env.TESTEIYA_ALLOW_CUSTOM_MCP;
  const { sessionId, cwd } = seedSession();
  const res = await mcpAdd(addReq(sessionId, { name: "evilsrv", command: "/bin/evil" }));
  expect(res.status).toBe(403);
  expect(catalogNames(cwd)).not.toContain("evilsrv");
});

test("custom MCP command is allowed (200) and persisted with TESTEIYA_ALLOW_CUSTOM_MCP=1", async () => {
  process.env.TESTEIYA_ALLOW_CUSTOM_MCP = "1";
  const { sessionId, cwd } = seedSession();
  const res = await mcpAdd(addReq(sessionId, { name: "localsrv", command: "/bin/echo" }));
  expect(res.status).toBe(200);
  expect(catalogNames(cwd)).toContain("localsrv");
  delete process.env.TESTEIYA_ALLOW_CUSTOM_MCP;
});

test("unknown fromCatalog returns 404", async () => {
  const { sessionId } = seedSession();
  const req = new Request("http://x/api/mcp/add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: sessionId, fromCatalog: "definitely-not-a-real-service" }),
  });
  const res = await mcpAdd(req);
  expect(res.status).toBe(404);
});

function seedSession() {
  counter++;
  const sessionId = `mcp-sess-${counter}`;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-cwd-"));
  store.createSession({ sessionId, cwd, promptContext: "", projects: [] });
  return { sessionId, cwd };
}

function addReq(sessionId: string, server: Record<string, unknown>): Request {
  return new Request("http://x/api/mcp/add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: sessionId, server }),
  });
}

function catalogNames(cwd: string): string[] {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(cwd, ".testeiya", "mcp.all.json"), "utf8")
    );
    return Object.keys(data.mcpServers ?? {});
  } catch {
    return [];
  }
}
