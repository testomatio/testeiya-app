import { test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson, updateJson } from "../src/json-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

test("readJson returns the fallback for missing or garbage files, parses valid ones", () => {
  const d = tmp();
  expect(readJson(path.join(d, "missing.json"), { a: 1 })).toEqual({ a: 1 });
  fs.writeFileSync(path.join(d, "garbage.json"), "{not json");
  expect(readJson(path.join(d, "garbage.json"), { a: 1 })).toEqual({ a: 1 });
  fs.writeFileSync(path.join(d, "valid.json"), JSON.stringify({ b: 2 }));
  expect(readJson(path.join(d, "valid.json"), {})).toEqual({ b: 2 });
});

test("writeJson then readJson round-trips and creates parent dirs", () => {
  const d = tmp();
  const file = path.join(d, "nested", "x.json");
  writeJson(file, { hello: "world" });
  expect(fs.existsSync(file)).toBe(true);
  expect(readJson(file, {})).toEqual({ hello: "world" });
});

test("updateJson preserves untouched keys while changing one", () => {
  const d = tmp();
  const file = path.join(d, "cfg.json");
  writeJson(file, { keep: 1, change: "old" });
  const next = updateJson<Record<string, unknown>>(file, {}, (c) => ({
    ...c,
    change: "new",
  }));
  expect(next).toEqual({ keep: 1, change: "new" });
  expect(readJson(file, {})).toEqual({ keep: 1, change: "new" });
});

test("writeJson with mode 0o600 sets file permissions", () => {
  if (process.platform === "win32") return;
  const d = tmp();
  const file = path.join(d, "secret.json");
  writeJson(file, { token: "s" }, { mode: 0o600 });
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "js-"));
  dirs.push(d);
  return d;
}
