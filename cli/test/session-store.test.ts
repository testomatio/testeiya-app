import { test, expect, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const realHome = os.homedir();
const home = fs.mkdtempSync(path.join(os.tmpdir(), "ss-home-"));
process.env.HOME = home;
const store = await import("../src/session-store.js");

test("createSession then getSession round-trips", () => {
  store.createSession(makeData("s1", "/work/p1"));
  const got = store.getSession("s1");
  expect(got?.sessionId).toBe("s1");
  expect(got?.cwd).toBe("/work/p1");
});

test("two createSession calls in a row keep both (no clobber)", () => {
  store.createSession(makeData("s2", "/work/p2"));
  store.createSession(makeData("s3", "/work/p3"));
  expect(store.getSession("s2")?.sessionId).toBe("s2");
  expect(store.getSession("s3")?.sessionId).toBe("s3");
});

test("deleteSession removes one but leaves others", () => {
  store.createSession(makeData("s4", "/work/p4"));
  store.createSession(makeData("s5", "/work/p5"));
  store.deleteSession("s4");
  expect(store.getSession("s4")).toBeNull();
  expect(store.getSession("s5")?.sessionId).toBe("s5");
});

test("getSessionByCwd returns the most recent for a cwd", () => {
  store.createSession(makeData("c1", "/work/shared"));
  tick();
  store.createSession(makeData("c2", "/work/shared"));
  expect(store.getSessionByCwd("/work/shared")?.sessionId).toBe("c2");
});

test("expiry deletes only tmp workspaces, keeps persistent ones", () => {
  const ephemeral = fs.mkdtempSync(path.join(os.tmpdir(), "ss-eph-"));
  const persistent = path.join(realHome, ".testeiya", "workspaces", "ss-test-persist");
  store.createSession(makeData("eph", ephemeral));
  store.createSession(makeData("persist", persistent));

  const rmSpy = spyOn(fs, "rmSync");
  store.cleanExpiredSessions(-1);
  const removed = rmSpy.mock.calls.map((c) => c[0]);
  rmSpy.mockRestore();

  expect(removed).toContain(ephemeral);
  expect(removed).not.toContain(persistent);
  expect(fs.existsSync(ephemeral)).toBe(false);
});

function makeData(sessionId: string, cwd: string) {
  return { sessionId, cwd, promptContext: "", projects: [] };
}

function tick(): void {
  const t = Date.now();
  while (Date.now() === t) {
    // spin until the millisecond clock advances so createdAt is strictly later
  }
}
