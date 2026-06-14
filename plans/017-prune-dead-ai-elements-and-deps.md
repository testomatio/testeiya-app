# Plan 017: Prune dead `ai-elements` components + orphaned deps

> **Executor instructions**: This plan DELETES files. Work in small batches and
> run the build after each batch — never delete everything then build once. Honor
> STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the ROOT repo only** (`components/ai-elements/*`, `package.json`).
>
> **Drift check (run first)**:
> `git diff --stat 28e0468..HEAD -- components/ai-elements package.json`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (deleting a file that's dynamically/transitively imported breaks
  the build; mitigated by per-batch build gates)
- **Depends on**: 003 (removes the unambiguously-unused deps first)
- **Category**: tech-debt
- **Planned at**: root `28e0468`, 2026-06-11

## Why this matters

The vendored `components/ai-elements/` kit is largely unused: an audit found ~35
of ~51 files imported by nothing, and `prompt-input.tsx` (1459 lines) exposes 38
exports of which only ~5 are used. These dead files anchor heavyweight client deps
(`@xyflow/react`, `@rive-app/react-webgl2`, `media-chrome`, likely
`embla-carousel-react`) in the manifest — install weight, `npm audit` noise, and
supply-chain surface — even though tree-shaking keeps them out of the bundle. They
also obscure which primitives are real and harbor a latent XSS sink
(`schema-display.tsx`'s `dangerouslySetInnerHTML`, only dangerous if rendered).
This plan removes the dead files (verified, in batches) and then prunes the deps
only those files anchored.

## Current state (leads to verify — do NOT treat as facts)

These are audit leads. **Verify each before deleting** (Step 1):
- `app/page.tsx:14-21` imports only:
  `PromptInput, PromptInputBody, PromptInputButton, PromptInputFooter, PromptInputSubmit, PromptInputTextarea`
  from `prompt-input.tsx`.
- Suspected dead clusters (anchoring deps): `canvas/node/edge/connection/panel/
  controls/toolbar` (→ `@xyflow/react`), `persona` (→ `@rive-app/react-webgl2`),
  `audio-player/mic-selector/voice-selector/transcription/speech-input`
  (→ `media-chrome`), `web-preview/sandbox/artifact/agent/queue/task/commit`,
  `schema-display` (the `dangerouslySetInnerHTML` sink), inline-citation/carousel
  (→ `embla-carousel-react`).
- Deps possibly orphaned after deletion: `@xyflow/react`, `@rive-app/react-webgl2`,
  `media-chrome`, `embla-carousel-react`.

> Note: `components/ai-elements/tool.tsx` uses `next/dynamic` (`ssr:false`) to load
> some renderers — string/dynamic imports won't show in a naive grep. Account for
> this in Step 1.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| List ai-elements files | `ls components/ai-elements` | the file list |
| Find importers of a file | `grep -rn "ai-elements/<name>" app components lib hooks` | importers (or none) |
| Find any dynamic import | `grep -rn "import(" app components lib hooks \| grep ai-elements` | dynamic importers |
| Build UI (the gate) | `bun run build` | exit 0, static export |
| Lint | `bun run lint` | exit 0 |
| Typecheck | `npx tsc --noEmit` (root) | no new errors |

## Scope

**In scope**:
- `components/ai-elements/*.tsx` — delete verified-dead files.
- `package.json` (root) — remove deps orphaned by the deletions; lockfile.

**Out of scope** (do NOT touch):
- `prompt-input.tsx` internals — do **not** trim its 38 exports to 5 in this plan
  (it's the largest, most entangled file; a separate effort). Only delete it if it
  proves entirely unimported (it isn't — `app/page.tsx` uses it), so it stays.
- Any file with even one real importer.
- The deps removed by plan 003 (already gone).
- `app/page.tsx` and other consumers — no logic changes; deletions only.

## Git workflow

- Branch: `advisor/017-prune-ai-elements`.
- One commit per batch (e.g. `remove dead xyflow-based ai-elements`,
  `remove dead media-chrome ai-elements`, `drop orphaned deps`) so a regression is
  bisectable.

## Steps

### Step 1: Build the verified dead-file list

For every file in `components/ai-elements/`, check for importers across
`app/ components/ lib/ hooks/` — including dynamic imports and re-exports:

```
for f in components/ai-elements/*.tsx; do
  name=$(basename "$f" .tsx)
  count=$(grep -rln "ai-elements/$name" app components lib hooks | grep -v "components/ai-elements/$name.tsx" | wc -l)
  echo "$count  $name"
done | sort -n
```

A file with `0` importers AND no dynamic-import/re-export reference is a deletion
candidate. Cross-check the zero-count files against:
- `grep -rn "import(" app components lib hooks | grep ai-elements` (dynamic),
- any barrel/`index.ts` in `ai-elements/` that re-exports (if present, a re-export
  counts as a use — keep the file or update the barrel).

Produce the final list. Record it in your report.

### Step 2: Delete in dependency-cluster batches, building after each

Delete a small batch (e.g. all confirmed-dead `@xyflow/react` files), then:

```
bun run build
```

If the build passes, proceed to the next batch. If it fails citing a deleted file,
that file had a hidden importer → restore it, remove it from the list, and note it.

Repeat until all verified-dead files are removed. Keep `schema-display.tsx` in the
delete set only if Step 1 confirms it's unimported (the audit says it is — this
also removes the latent XSS sink).

**Verify after each batch**: `bun run build` → exit 0.

### Step 3: Prune orphaned dependencies

After the dead files are gone, re-check whether the suspect deps are now imported
by anything:

```
for dep in "@xyflow/react" "@rive-app/react-webgl2" "media-chrome" "embla-carousel-react"; do
  echo "== $dep =="; grep -rln "$dep" app components lib hooks src
done
```

Remove from root `package.json` **only** the deps with zero remaining importers.
Then:

```
bun install
bun run build
```

**Verify**: `bun install` exits 0; `bun run build` exits 0.

### Step 4: Final checks

**Verify**: `bun run lint` → 0; `npx tsc --noEmit` → no new errors (and note: the
root `tsconfig.json` excludes some `ai-elements` files — deleting an excluded file
is fine; if you delete a file, also remove its entry from the `exclude` list if
present, to keep the config tidy); `bun run build` → 0.

## Test plan

- No unit tests. The static `next build` is the gate after every batch — it
  resolves every (static) import, proving deletions didn't break a used path.
- Manual smoke (record): run `bun run dev` and confirm the chat UI, prompt input,
  tool rendering, reasoning, and ask-question all still render — i.e. the kept
  ai-elements still work.

## Done criteria

ALL must hold:

- [ ] Every deleted file had 0 importers (static + dynamic + re-export), verified
      in Step 1; the final deleted list is recorded in the report
- [ ] `bun run build` exits 0 after the final deletion and after dep pruning
- [ ] Only deps with 0 remaining importers were removed from `package.json`
- [ ] `bun run lint` exits 0; `npx tsc --noEmit` no new errors
- [ ] `prompt-input.tsx` is NOT gutted (out-of-scope guard) — only fully-dead
      files were removed
- [ ] No consumer logic changed (`git diff` shows deletions + package.json/lockfile
      only, aside from any `tsconfig` exclude cleanup)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A build failure after a batch traces to a deleted file with a hidden importer —
  restore it, drop it from the list, continue with the rest, and note it.
- A suspected-dead file turns out to be re-exported by a barrel that *is* used —
  keep it.
- Removing a dep breaks the build (a transitive runtime need) — restore it and
  report.
- The dead-file count is far smaller than the audit suggested (e.g. most files have
  importers) — STOP and report; the audit lead may be stale (drift), and a smaller
  deletion is the correct, honest outcome.

## Maintenance notes

- Trimming `prompt-input.tsx` from 38 exports to the ~5 used (and removing its
  parallel attachment-context system that `app/page.tsx` bypasses) is a worthwhile
  follow-up, deliberately deferred here because of its entanglement.
- After this, the manifest reflects what's actually used — future `npm audit`
  noise drops and contributors can trust the kit's surface.
- A reviewer should spot-check a couple of "deleted" files' names against
  `git log` to ensure none were recently added for an in-progress feature.
