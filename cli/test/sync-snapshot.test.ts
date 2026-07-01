import { test, expect, describe, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  writeSyncSnapshot,
  computeChangedFiles,
  ensureSyncBaseline,
} from "../src/sync-snapshot.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("computeChangedFiles", () => {
  test("no snapshot yet → nothing is flagged", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    expect(computeChangedFiles(d)).toEqual({});
  });

  test("right after a sync everything is clean", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    write(d, "b.test.md", "# b");
    writeSyncSnapshot(d, ".");
    expect(computeChangedFiles(d)).toEqual({});
  });

  test("an edited file is 'changed', a new file is 'created'", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    writeSyncSnapshot(d, ".");
    write(d, "a.test.md", "# a edited");
    write(d, "new.test.md", "# new");
    expect(computeChangedFiles(d)).toEqual({
      "a.test.md": "changed",
      "new.test.md": "created",
    });
  });

  test("re-snapshotting (a push) clears the changes", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    writeSyncSnapshot(d, ".");
    write(d, "a.test.md", "# a edited");
    expect(computeChangedFiles(d)).toEqual({ "a.test.md": "changed" });
    writeSyncSnapshot(d, ".");
    expect(computeChangedFiles(d)).toEqual({});
  });

  test("tracks the .testeiya/manual-tests cache by its cwd-relative path", () => {
    const d = tmp();
    write(d, "code.js", "// code");
    write(d, ".testeiya/manual-tests/foo.test.md", "# foo");
    writeSyncSnapshot(d, ".testeiya/manual-tests");
    expect(computeChangedFiles(d)).toEqual({});
    write(d, ".testeiya/manual-tests/foo.test.md", "# foo edited");
    expect(computeChangedFiles(d)).toEqual({
      ".testeiya/manual-tests/foo.test.md": "changed",
    });
  });

  test("ensureSyncBaseline seeds a baseline so later edits are detected", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    expect(computeChangedFiles(d)).toEqual({});
    ensureSyncBaseline(d);
    expect(computeChangedFiles(d)).toEqual({});
    write(d, "a.test.md", "# a edited");
    expect(computeChangedFiles(d)).toEqual({ "a.test.md": "changed" });
  });

  test("ensureSyncBaseline does not overwrite an existing baseline", () => {
    const d = tmp();
    write(d, "a.test.md", "# a");
    writeSyncSnapshot(d, ".");
    write(d, "a.test.md", "# a edited");
    ensureSyncBaseline(d);
    expect(computeChangedFiles(d)).toEqual({ "a.test.md": "changed" });
  });

  test("snapshotting one subtree leaves another subtree's entries intact", () => {
    const d = tmp();
    write(d, "x/a.test.md", "# a");
    write(d, "y/b.test.md", "# b");
    writeSyncSnapshot(d, "x");
    writeSyncSnapshot(d, "y");
    write(d, "x/a.test.md", "# a edited");
    expect(computeChangedFiles(d)).toEqual({ "x/a.test.md": "changed" });
  });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ss-"));
  dirs.push(d);
  return d;
}

function write(dir: string, rel: string, content: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
