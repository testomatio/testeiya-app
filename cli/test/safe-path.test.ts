import { test, expect, describe, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeResolve } from "../src/workspace/safe-path.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("safeResolve", () => {
  test("a normal file inside the workspace resolves", () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, "a.txt"), "x");
    expect(safeResolve(cwd, "a.txt")).toBe(path.join(cwd, "a.txt"));
  });

  test("`..` traversal is rejected", () => {
    const cwd = tmp();
    expect(safeResolve(cwd, "../outside.txt")).toBeNull();
  });

  test("an absolute path outside is rejected", () => {
    const cwd = tmp();
    expect(safeResolve(cwd, "/etc/passwd")).toBeNull();
  });

  test("the /work vs /work-evil prefix false positive is rejected", () => {
    const base = tmp();
    const work = path.join(base, "work");
    fs.mkdirSync(work);
    fs.mkdirSync(path.join(base, "work-evil"));
    expect(safeResolve(work, "../work-evil/x")).toBeNull();
  });

  test("a symlink that escapes the workspace is rejected (read)", () => {
    const cwd = tmp();
    const outside = tmp();
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
    if (!trySymlink(outside, path.join(cwd, "link"))) return;
    expect(safeResolve(cwd, "link/secret.txt")).toBeNull();
  });

  test("a symlinked parent for a new (non-existent) write target is rejected", () => {
    const cwd = tmp();
    const outside = tmp();
    if (!trySymlink(outside, path.join(cwd, "sub"))) return;
    expect(safeResolve(cwd, "sub/new.txt")).toBeNull();
  });

  test("a legitimate not-yet-existing write target is allowed", () => {
    const cwd = tmp();
    expect(safeResolve(cwd, "newdir/new.txt")).toBe(
      path.join(cwd, "newdir", "new.txt")
    );
  });
});

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sp-")));
  dirs.push(d);
  return d;
}

function trySymlink(target: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(target, linkPath);
    return true;
  } catch {
    return false;
  }
}
