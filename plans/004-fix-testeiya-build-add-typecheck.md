# Plan 004: Fix the `testeiya` build + add `typecheck` scripts

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits BOTH repos**: `testeiya/package.json` + `testeiya/tsconfig.json`
> (submodule) and `package.json` (root). Commit each in its own repo.
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- package.json tsconfig.json` and
> `git diff --stat 28e0468..HEAD -- package.json`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (config only); MED only if you un-exclude files (you won't)
- **Depends on**: none
- **Category**: dx
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

Neither package has a `typecheck` script, so there is no fast "does it
type-check" signal and CI (plan in DX backlog) can't gate on types. Worse, the
`testeiya` **build is broken**: `tsconfig.json` sets `"noEmit": true`, but
`package.json` declares `"build": "tsc"`, `"main": "./dist/main.js"`,
`"bin": "./dist/cli.js"`, and `"start": "node dist/cli.js"`. So `bun run build`
type-checks and emits **nothing**; the shipped `dist/` is two months stale
(`dist/cli.js` mtime 2026-04-01 vs newest source 2026-06-07), and anything using
`dist/` (the `bin`, `main`, `start`) runs old code. The app itself runs via
`bun src/app-server.ts` (no build needed), so this is latent — but the CLI
distribution path (see direction finding DIR-01) is dead until it's fixed.

## Current state

- `testeiya/tsconfig.json` (full):
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ES2022",
      "moduleResolution": "Bundler",
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": true,
      "skipLibCheck": true,
      "declaration": true,
      "esModuleInterop": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "allowImportingTsExtensions": true,
      "types": ["node", "bun-types"],
      "noEmit": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
  }
  ```
  Note `"allowImportingTsExtensions": true` — TypeScript only permits this with
  `noEmit` (or `emitDeclarationOnly`). The source imports use `.js` specifiers
  (e.g. `import ... from "./project-dir.js"`), which Bun resolves directly. So
  **the runtime is Bun-direct (`bun src/app-server.ts`), not `dist/`.**
- `testeiya/package.json` scripts + entry points:
  ```json
  "main": "./dist/main.js",
  "bin": { "testeiya": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "bun src/cli.ts",
    "serve:app": "bun src/app-server.ts",
    "serve:app:watch": "bun --watch src/app-server.ts",
    "start": "node dist/cli.js"
  },
  ```
- Root `package.json` scripts: `dev`, `build` (`NEXT_EXPORT=1 next build`),
  `desktop:dev`, `desktop:build`, `lint` (`eslint`). No `typecheck`.
- Root `tsconfig.json` excludes ~35 `components/ai-elements/*.tsx` files (they
  don't all compile cleanly), so a root `tsc --noEmit` covers everything **except**
  those excluded files — that's the intended, pre-existing scope. Do not change
  the exclude list in this plan.

## Decision (do this, not the alternative)

Because the project is **Bun-direct at runtime** and `allowImportingTsExtensions`
forbids emit anyway, the right fix is **option (b): treat `tsc` as a typecheck,
not a build, and drop the dead `dist`-based surface.** Do NOT try to make `tsc`
emit to `dist/` (it would require removing `allowImportingTsExtensions` and
rewriting `.js` import specifiers — large and unnecessary).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `cd testeiya && bun run typecheck` | exit 0 (or only pre-existing errors — see Step 2) |
| Root typecheck | `bun run typecheck` (root) | exit 0 over the included files |
| Root lint | `bun run lint` | exit 0 |
| Backend still runs | `cd testeiya && timeout 5 bun src/app-server.ts; echo done` | server prints "listening" then is killed |

## Scope

**In scope**:
- `testeiya/package.json` (submodule) — rename `build`→`typecheck`, remove dead
  `start`/`main`/`bin` (see Step 1).
- `testeiya/tsconfig.json` (submodule) — no change needed (already `noEmit`); only
  touch if Step 2 requires it (it shouldn't).
- `package.json` (root) — add a `typecheck` script.

**Out of scope** (do NOT touch):
- Root `tsconfig.json` `exclude` list — leaving the `ai-elements` exclusions as-is
  is intentional; un-excluding them surfaces unrelated errors (a separate effort).
- Any `.ts`/`.tsx` source file — config/scripts only.
- The stale `testeiya/dist/` directory contents (you'll stop referencing it, not
  rebuild it).

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/004-build-typecheck`, commit
  `make tsc a typecheck script; drop dead dist build/start/bin`.
- Root: branch `advisor/004-build-typecheck`, commit (conventional):
  `chore: add typecheck script`.

## Steps

### Step 1: Fix `testeiya/package.json`

- Rename the `build` script to `typecheck` (it already only type-checks):
  ```json
  "typecheck": "tsc --noEmit",
  ```
- Remove the dead `dist`-based entries, since nothing runs them and `dist/` is
  stale and never regenerated:
  - delete `"start": "node dist/cli.js"`,
  - delete `"main": "./dist/main.js"`,
  - delete the `"bin": { "testeiya": "./dist/cli.js" }` block.

  > Rationale: the CLI is launched in dev via `bun src/cli.ts` (the `dev`
  > script). Re-enabling a real `bin` for npm distribution is a separate effort
  > (direction DIR-01) that must also choose a Bun-compatible entry; leaving a
  > broken `bin` pointing at stale `dist/` is worse than none.

Keep `dev`, `serve:app`, `serve:app:watch` unchanged.

**Verify**: `cd testeiya && bun run typecheck` runs `tsc --noEmit`. Capture the
result for Step 2.

### Step 2: Assess backend typecheck output

`tsc --noEmit` should pass (the code runs under Bun with `strict: true`). If it
reports errors:

- If they are **pre-existing** (present before your change — confirm by checking
  they're unrelated to package.json/tsconfig edits), record the count in your
  report and proceed. Do NOT fix unrelated type errors in this plan.
- If your edit *introduced* an error (it shouldn't — you only changed scripts),
  fix it.

**Verify**: `cd testeiya && bun run typecheck` exits 0, OR you have documented the
pre-existing error list.

### Step 3: Add a root `typecheck` script

In the root `package.json` `scripts`, add:

```json
"typecheck": "tsc --noEmit",
```

**Verify**: `bun run typecheck` (root) → exits 0 over the included files (the
`ai-elements` excludes are honored by `tsconfig.json`). If it reports errors only
in non-excluded files that predate your change, record them; do not fix unrelated
errors here.

### Step 4: Confirm the server still launches

**Verify**:
`cd testeiya && timeout 5 bun src/app-server.ts 2>&1 | head -5; echo "exit ok"`
→ the log line `Testeiya app server listening on http://127.0.0.1:...` appears
before the timeout kills it. (Port may be in use — if it logs an EADDRINUSE, set
`PORT=0` and retry: `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts`.)

## Test plan

- No unit tests. The gates are: `typecheck` runs in both packages, and the server
  still boots via `bun src/app-server.ts`.
- Confirm `git grep -n "dist/" testeiya/package.json` returns nothing after the
  change.

## Done criteria

ALL must hold:

- [ ] `testeiya/package.json` has `"typecheck": "tsc --noEmit"` and no `build`,
      `start`, `main`, or `bin` referencing `dist/`
- [ ] `git grep -n "dist" testeiya/package.json` returns no matches
- [ ] Root `package.json` has `"typecheck": "tsc --noEmit"`
- [ ] `cd testeiya && bun run typecheck` exits 0 (or documented pre-existing
      errors only)
- [ ] `bun run typecheck` (root) exits 0 over included files (or documented
      pre-existing errors only)
- [ ] `cd testeiya && bun src/app-server.ts` still boots (Step 4)
- [ ] No source files modified; only `package.json` files (`git status` both repos)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `tsc --noEmit` reports a large number (>20) of errors in either package that
  appear pre-existing and unrelated — STOP and report the list; do not attempt a
  broad type-cleanup under this plan.
- The server fails to boot after the change (it shouldn't — you didn't touch
  source) — STOP and report.
- Removing `main`/`bin` breaks `bun install` in the submodule (it won't, but if a
  consumer references the bin) — STOP and report.

## Maintenance notes

- A real CLI distribution (npm `bin`, `npx testeiya`) is direction finding DIR-01;
  it must pick a Bun-runnable entry (or a bundler that handles `.js`-specifier ESM)
  rather than the removed `dist/` path. Note this in any DIR-01 follow-up.
- These `typecheck` scripts are the foundation for a future CI workflow (DX
  backlog) running `lint` + `typecheck` + `test` on PRs.
- The stale `testeiya/dist/` directory can be deleted in a later cleanup; it's
  already gitignored-or-stale and no longer referenced.
