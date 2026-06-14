# Plan 001: Establish a verification baseline — `bun test` + workspace-classifier tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **This plan edits the `testeiya/` git submodule.** Make changes under
> `testeiya/`, and commit them **inside the submodule** (`cd testeiya && git ...`).
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/workspace-model.ts package.json`
> If `src/workspace-model.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a mismatch
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

There is **zero automated test coverage** and **no test runner** anywhere in the
repo, so there is no one-command way to know the backend works. The most
dangerous untested code is the workspace classifier in
`testeiya/src/workspace-model.ts`: it decides *where manual tests are pulled to
and pushed from*. A silent regression here routes a user's `check-tests pull`/
`push` to the wrong directory — overwriting a real code repo's root, or seeding a
cache that shadows real tests. This plan stands up `bun test` (built into the Bun
runtime the backend already uses — zero new dependencies) and writes the first
suite over that classifier. It is the prerequisite for plans 008, 009, and 012.

## Current state

- `testeiya/package.json` — backend manifest. Scripts today (no `test`):
  ```json
  "scripts": {
    "build": "tsc",
    "dev": "bun src/cli.ts",
    "serve:app": "bun src/app-server.ts",
    "serve:app:watch": "bun --watch src/app-server.ts",
    "start": "node dist/cli.js"
  },
  ```
- `testeiya/src/workspace-model.ts` — the classifier under test. The functions:
  - `detectManualProject(cwd)` (lines 40-46): returns `true` when ≥90% of
    non-vendor files (recursively) are `*.test.md`. Returns `false` for an empty
    tree (`acc.total === 0`).
    ```ts
    export function detectManualProject(cwd: string): boolean {
      const acc = { total: 0, test: 0, nodes: 0 };
      countFiles(cwd, acc);
      if (acc.total === 0) return false;
      return acc.test / acc.total >= PROJECT_THRESHOLD;   // PROJECT_THRESHOLD = 0.9
    }
    ```
  - `resolveManualTestsDir(cwd)` (lines 52-58): returns `".testeiya/manual-tests"`
    when that cache dir has any `.md` file (`hasMarkdown`), else `""` when
    `detectManualProject` is true (root is the source), else `null`.
    ```ts
    export function resolveManualTestsDir(cwd: string): string | null {
      if (hasMarkdown(manualTestsCachePath(cwd))) {
        return `${PROJECT_DIR}/${MANUAL_TESTS_SUBDIR}`;
      }
      if (detectManualProject(cwd)) return "";
      return null;
    }
    ```
  - Constants (lines 24-38): `VENDOR_DIRS` (node_modules, vendor, dist, build,
    coverage, out, tmp, .git, .next), `TEST_MD_RE = /\.test\.md$/i`,
    `PROJECT_THRESHOLD = 0.9`, `MAX_SCAN_NODES = 5000`.
  - `countFiles` (lines 90-114): recursive; **skips dotfiles** (`entry.name`
    starting with `.`) and `VENDOR_DIRS`; caps at `MAX_SCAN_NODES`.
- `PROJECT_DIR` is `".testeiya"` and `MANUAL_TESTS_SUBDIR` is `"manual-tests"`
  (re-exported from `testeiya/src/project-dir.ts`). `manualTestsCachePath(cwd)`
  resolves to `<cwd>/.testeiya/manual-tests`.

There is no existing test to model after — this plan establishes the pattern.
Bun's test API is `import { test, expect, describe } from "bun:test"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (backend) | `cd testeiya && bun install` | exit 0 |
| Run tests | `cd testeiya && bun test` | exit 0, all pass |
| Run one file | `cd testeiya && bun test src/workspace-model.test.ts` | exit 0, all pass |

## Scope

**In scope** (the only files you should modify/create, all under `testeiya/`):
- `testeiya/package.json` — add the `test` script.
- `testeiya/src/workspace-model.test.ts` — new test file.

**Out of scope** (do NOT touch):
- `testeiya/src/workspace-model.ts` — this plan tests the classifier as-is; do
  not "fix" behavior here. If a test reveals a real bug, record it in your report
  (a STOP condition), don't change the source under this plan.
- The root `package.json` / any root test setup — backend-only here.
- `testeiya/tsconfig.json` — plan 004 owns build/typecheck config.

## Git workflow

- Work inside the submodule: `cd testeiya`.
- Branch (in the submodule): `advisor/001-verification-baseline`.
- Commit message style (submodule uses short imperative, no prefix):
  `add bun test + workspace-model classifier tests`.
- Do NOT push or open a PR unless the operator instructed it. After committing in
  the submodule, `cd ..` and note that the root submodule pointer moved.

## Steps

### Step 1: Add the `test` script

In `testeiya/package.json`, add a `test` script to the `scripts` block:

```json
"test": "bun test",
```

**Verify**: `cd testeiya && bun test` → exits 0 with "0 tests" (no test files
yet) or a clean "no tests found" message; non-zero exit means the script is
malformed — fix before continuing.

### Step 2: Write `testeiya/src/workspace-model.test.ts`

Create temp directories with `fs.mkdtempSync(path.join(os.tmpdir(), "wm-"))`,
populate them, and assert the classifier branches. Clean each temp dir in an
`afterEach`/`finally`. Cover, at minimum:

1. **Empty dir** → `detectManualProject(dir)` is `false`; `resolveManualTestsDir(dir)`
   is `null`.
2. **All `*.test.md` (root project)** → write `a.test.md`, `b.test.md`;
   `detectManualProject` is `true`; `resolveManualTestsDir` is `""`.
3. **90% boundary** — write 9 `*.test.md` + 1 `readme.md` (ratio 0.9) →
   `detectManualProject` is `true`; then add a second non-test file (ratio
   ~0.82) → `detectManualProject` is `false`.
4. **Vendor dirs excluded** — put `*.test.md` files inside `node_modules/` and
   confirm they are NOT counted (a dir of only `node_modules/x.test.md` plus one
   root `code.js` → `detectManualProject` is `false`, because the test files are
   skipped and only `code.js` counts).
5. **Dotfiles skipped** — a `.hidden/x.test.md` is not counted.
6. **Cache wins** — create `<dir>/.testeiya/manual-tests/foo.md`;
   `resolveManualTestsDir(dir)` returns `".testeiya/manual-tests"` even when the
   root is otherwise a code repo.

Target shape:
```ts
import { test, expect, describe, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectManualProject, resolveManualTestsDir } from "./workspace-model.js";

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "wm-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("detectManualProject", () => {
  test("empty dir is not a manual project", () => {
    const d = tmp();
    expect(detectManualProject(d)).toBe(false);
    expect(resolveManualTestsDir(d)).toBeNull();
  });
  // ...remaining cases per the list above
});
```

> Note the import path uses the `.js` extension (the project compiles ESM with
> `allowImportingTsExtensions`-style bundler resolution; match the existing
> `import ... from "./project-dir.js"` style you see in `workspace-model.ts`).

**Verify**: `cd testeiya && bun test src/workspace-model.test.ts` → all tests
pass; the file reports at least 6 tests.

### Step 3: Confirm the whole suite is green

**Verify**: `cd testeiya && bun test` → exit 0, all tests pass.

## Test plan

- New file `testeiya/src/workspace-model.test.ts` with the 6 cases above.
- No existing test to model after — this file *is* the pattern other backend
  plans (008, 009, 012) will follow.
- Verification: `cd testeiya && bun test` → all pass.

## Done criteria

ALL must hold:

- [ ] `cd testeiya && bun test` exits 0 with all tests passing
- [ ] `testeiya/package.json` has a `"test": "bun test"` script
- [ ] `testeiya/src/workspace-model.test.ts` exists with ≥6 tests covering empty,
      all-test-md, the 90% boundary (both sides), vendor exclusion, dotfile skip,
      and cache-wins
- [ ] No files outside the in-scope list are modified (`cd testeiya && git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `testeiya/src/workspace-model.ts` no longer matches the "Current state"
  excerpts (drift).
- A test reveals the classifier behaves differently than described here (e.g. the
  90% boundary is exclusive not inclusive) — report the actual behavior; do not
  change the source to make a test pass.
- `bun test` is not available (`bun --version` fails) — the environment lacks the
  expected Bun runtime.

## Maintenance notes

- This `bun test` wiring is the harness plans 008, 009, and 012 build on. Keep
  `*.test.ts` colocated next to source (Bun discovers them by suffix).
- If `MAX_SCAN_NODES` or `PROJECT_THRESHOLD` change, the boundary test must be
  revisited.
- A reviewer should confirm tests use temp dirs only and clean up — no test may
  touch the real `~/.testeiya` or the repo tree.
