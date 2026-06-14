# Plan 014: Pin `@testomatio/skills` to an immutable ref

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the `testeiya/` submodule** (`package.json` + lockfile).
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- package.json`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

`testeiya/package.json` depends on `"@testomatio/skills": "github:testomatio/skills"`
— an **unpinned** git dependency tracking the default branch. The package is loaded
at runtime as files (`SKILL.md`) and shipped in the desktop bundle. Consequences:
non-reproducible builds (the branch can move under you), no semver, and a
supply-chain risk — any push to that repo's default branch flows straight into the
next install/build with no version gate. CI on different days can ship different
agent behavior. Pinning to an immutable ref (a commit SHA) closes this.

## Current state

- `testeiya/package.json:35` — `"@testomatio/skills": "github:testomatio/skills"`.
- It's consumed by `testeiya/src/skills.ts` (`loadTestomatioSkills`) and shipped via
  `electrobun.config.ts`. The exact `SKILL.md` set the agent loads depends on
  whatever commit is currently installed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Find installed commit | `cd testeiya && git -C node_modules/@testomatio/skills rev-parse HEAD` | prints a 40-char SHA |
| (fallback) inspect lockfile | `grep -n "testomatio/skills" testeiya/bun.lock` | shows the resolved ref |
| Install | `cd testeiya && bun install` | exit 0 |
| Server boots | `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 \| head` | "listening" |

## Scope

**In scope** (submodule):
- `testeiya/package.json` — pin the dep.
- `testeiya/bun.lock` — updated by `bun install`; commit it.

**Out of scope**:
- The root `package.json` (it does not depend on `@testomatio/skills`).
- `skills.ts` loading logic.

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/014-pin-skills`, commit
  `pin @testomatio/skills to an immutable commit`.

## Steps

### Step 1: Determine the currently-installed commit

```
cd testeiya && git -C node_modules/@testomatio/skills rev-parse HEAD
```

This is the SHA currently in use. If the package isn't a git checkout in
`node_modules` (some installers vendor it), read the resolved ref from
`testeiya/bun.lock` instead (`grep -n "testomatio/skills" testeiya/bun.lock`).

Record the SHA. Verify it's a real commit on `testomatio/skills` (the current
default-branch tip is the safe choice — you're pinning what's already working).

### Step 2: Pin the dependency

Change `testeiya/package.json:35` to the immutable ref form:

```json
"@testomatio/skills": "github:testomatio/skills#<SHA>",
```

(Use the full 40-char SHA from Step 1. A tag would also work if the repo
publishes tags, but a SHA is unambiguous.)

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('testeiya/package.json','utf8'))"`
→ exits 0.

### Step 3: Reinstall and validate

```
cd testeiya && bun install
cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 | head
```

**Verify**: install exits 0; the server boots and logs its listening line (the
skills load at session creation, but a clean boot + no skills-load error is the
gate). If you can, send one prompt and confirm a skill command (e.g. `/` skills
list) still resolves.

## Test plan

- No unit test. The gate is a clean install + boot at the pinned SHA, and the
  skills still loading (`loadTestomatioSkills` doesn't throw).
- Confirm the pinned SHA matches the previously-installed one so behavior is
  unchanged (you're freezing, not upgrading).

## Done criteria

ALL must hold:

- [ ] `testeiya/package.json` pins `@testomatio/skills` to `github:testomatio/skills#<40-char-SHA>`
- [ ] The SHA equals the commit that was installed before this change (frozen, not
      bumped)
- [ ] `cd testeiya && bun install` exits 0; lockfile updated
- [ ] Server boots via `bun src/app-server.ts`
- [ ] No out-of-scope files modified (`cd testeiya && git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- You cannot determine the installed commit SHA from either `node_modules` or the
  lockfile — STOP and report (don't guess a SHA).
- After pinning, `bun install` fails to resolve the ref — the SHA may be wrong;
  STOP and report.
- The server fails to load skills at the pinned SHA — STOP and report (the pin may
  predate a needed skill; pick the current tip instead).

## Maintenance notes

- Bump deliberately by changing the SHA and testing — never back to a bare branch
  ref.
- Consider documenting a periodic "review skills upstream and bump the pin"
  cadence; that's the only downside of pinning (you stop getting changes
  automatically — which is the point).
