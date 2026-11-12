import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCliArgs } from "../dist/src/args.js";
import { envMcpServers, mcpConfig } from "../dist/src/mcp.js";

function withEnv(env, fn) {
  const saved = { ...process.env };
  const write = process.stderr.write;
  const warnings = [];
  process.stderr.write = (chunk) => warnings.push(String(chunk));
  for (const key of ["TESTOMATIO", "TESTOMATIO_PROJECT_ID", "TESTEIYA_MCP_SERVERS"]) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return { result: fn(), warnings };
  } finally {
    process.stderr.write = write;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

const LINEAR = JSON.stringify({ linear: { url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer x", bad: 1 } } });

test("env servers become http servers, without a Testomat.io token", () => {
  const { result } = withEnv({ TESTEIYA_MCP_SERVERS: LINEAR }, () => mcpConfig());
  assert.deepEqual(result.servers.map((server) => server.name), ["linear"]);
  assert.deepEqual(result.servers[0].config, {
    type: "http",
    url: "https://mcp.linear.app/mcp",
    headers: { Authorization: "Bearer x" },
    exposure: "direct",
  });
});

test("the Testomat.io server comes first when its token and project are set", () => {
  const { result } = withEnv({ TESTOMATIO: "tstmt", TESTOMATIO_PROJECT_ID: "p", TESTEIYA_MCP_SERVERS: '{"testomatio": {"url": "https://x"}}' }, () => mcpConfig());
  assert.deepEqual(result.servers.map((server) => server.name), ["testomatio", "testomatio-env"]);
});

test("bad values warn once and add nothing", () => {
  for (const value of ["{not json", "null", "[1]", '"text"']) {
    const { result, warnings } = withEnv({ TESTEIYA_MCP_SERVERS: value }, () => [envMcpServers(), envMcpServers()]);
    assert.deepEqual(result, [{}, {}], value);
    assert.equal(warnings.length, 1, value);
  }
  const { result, warnings } = withEnv({ TESTEIYA_MCP_SERVERS: '{"a": {}, "b": {"url": "https://b"}}' }, () => envMcpServers());
  assert.deepEqual(Object.keys(result), ["b"]);
  assert.match(warnings.join(""), /"a" has no url/);
});

test("--mcp is taken by task and pipeline", () => {
  assert.equal(parseCliArgs(["task", "x", "--mcp", LINEAR]).mcp, LINEAR);
  assert.equal(parseCliArgs(["pipeline", "web-testing", "--mcp", LINEAR]).mcp, LINEAR);
});
