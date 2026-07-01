import { test, expect, describe, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectManualProject, resolveManualTestsDir } from "../src/workspace-model.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("detectManualProject", () => {
  test("empty dir is not a manual project", () => {
    const d = tmp();
    expect(detectManualProject(d)).toBe(false);
    expect(resolveManualTestsDir(d)).toBeNull();
  });

  test("all *.test.md at the root is a manual project", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    expect(detectManualProject(d)).toBe(true);
    expect(resolveManualTestsDir(d)).toBe("");
  });

  test("exactly 90% test files is inclusive", () => {
    const d = tmp();
    for (let i = 0; i < 9; i++) write(d, `t${i}.test.md`, "# t");
    write(d, "readme.md", "# readme");
    expect(detectManualProject(d)).toBe(true);
  });

  test("below 90% test files is not a manual project", () => {
    const d = tmp();
    for (let i = 0; i < 9; i++) write(d, `t${i}.test.md`, "# t");
    write(d, "readme.md", "# readme");
    write(d, "license.md", "# license");
    expect(detectManualProject(d)).toBe(false);
  });

  test("vendor dirs are excluded from detection", () => {
    const d = tmp();
    write(d, "node_modules/x.test.md", "# x");
    write(d, "code.js", "// code");
    expect(detectManualProject(d)).toBe(false);
  });

  test("dotfiles and dot-dirs are skipped", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, ".hidden/junk1.md", "# j");
    write(d, ".hidden/junk2.md", "# j");
    expect(detectManualProject(d)).toBe(true);
  });
});

describe("resolveManualTestsDir", () => {
  test("the .testeiya/manual-tests cache wins even over a code repo", () => {
    const d = tmp();
    write(d, "code.js", "// code");
    write(d, ".testeiya/manual-tests/foo.md", "# foo");
    expect(resolveManualTestsDir(d)).toBe(".testeiya/manual-tests");
  });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "wm-"));
  dirs.push(d);
  return d;
}

function write(dir: string, rel: string, content: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
