import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "tp-home-"));
process.env.HOME = home;
const store = await import("../src/session-store.js");
const { testomatioProxy } = await import("../src/api/testomatio-proxy.js");

const SID = "tp-sess";
store.createSession({
  sessionId: SID,
  cwd: "/work/tp",
  promptContext: "",
  backendUrl: "https://api.example.test",
  tokens: { myproj: "tok-123" },
  projects: [{ slug: "myproj", title: "My Proj", status: "ok" }],
});

const realFetch = globalThis.fetch;
let lastUrl = "";

beforeEach(() => {
  lastUrl = "";
  globalThis.fetch = (async (u: unknown) => {
    lastUrl = String(u);
    return new Response(JSON.stringify({ data: [], meta: { total: 0 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("guards that need no upstream call", () => {
  test("bad resource → 400", async () => {
    const res = await testomatioProxy(mkReq(`http://x/api/testomatio/secrets?session=${SID}`), "secrets");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad resource" });
  });

  test("missing session → 400", async () => {
    const res = await testomatioProxy(mkReq("http://x/api/testomatio/tests"), "tests");
    expect(res.status).toBe(400);
  });

  test("unknown session → 404", async () => {
    const res = await testomatioProxy(mkReq("http://x/api/testomatio/tests?session=nope"), "tests");
    expect(res.status).toBe(404);
  });

  test("non-writable PUT → 400", async () => {
    const res = await testomatioProxy(mkReq(`http://x/api/testomatio/tests?session=${SID}&id=1`, "PUT"), "tests");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "resource not writable" });
  });

  test("writable PUT without id → 400", async () => {
    const res = await testomatioProxy(mkReq(`http://x/api/testomatio/testruns?session=${SID}`, "PUT"), "testruns");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "id required" });
  });
});

describe("upstream URL construction (fetch mocked)", () => {
  test("an allowed filter reaches the upstream URL", async () => {
    await testomatioProxy(mkReq(`http://x/api/testomatio/tests?session=${SID}&query=foo`), "tests");
    expect(lastUrl).toContain("query=foo");
  });

  test("a disallowed filter is stripped", async () => {
    await testomatioProxy(mkReq(`http://x/api/testomatio/tests?session=${SID}&evil=1&query=foo`), "tests");
    expect(lastUrl).toContain("query=foo");
    expect(lastUrl).not.toContain("evil=1");
  });

  test("the id is URL-encoded in the upstream path", async () => {
    await testomatioProxy(mkReq(`http://x/api/testomatio/tests?session=${SID}&id=a%2Fb`), "tests");
    expect(lastUrl).toContain("tests/a%2Fb");
    expect(lastUrl).not.toContain("tests/a/b");
  });
});

function mkReq(url: string, method = "GET"): Request {
  return new Request(url, { method });
}
