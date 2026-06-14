# Plan 002: Propagate the real `isError` flag for tool output

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row in `plans/README.md`.
>
> **This plan edits BOTH repos**: one file in the `testeiya/` submodule
> (`src/bridge.ts`) and one in the root repo (`hooks/use-testeiya.ts`). Commit
> each in its own repo (submodule first, then root).
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/bridge.ts` and
> `git diff --stat 28e0468..HEAD -- hooks/use-testeiya.ts`
> Compare the "Current state" excerpts to live code on any change; mismatch is a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

Whether a tool call failed is currently inferred from whether its output string
**starts with `"Error:"`**. The SDK already provides the authoritative boolean
`event.isError`, but `bridge.ts` throws it away and re-encodes it as a string
prefix, which the client then re-detects by prefix. The result: any *successful*
tool whose output legitimately begins with `Error:` (reading a log file, a `bash`
result, a test titled `"Error: ..."`) renders as a **failed** call (red error
styling), and any *real* error whose message doesn't start with that exact prefix
renders as success. The truth exists and is discarded. This fix carries the
boolean end-to-end.

## Current state

- `testeiya/src/bridge.ts:21-28` — the `tool_execution_end` case discards
  `event.isError` and bakes it into the string:
  ```ts
  case "tool_execution_end":
    return {
      type: "tool-output-available",
      toolCallId: event.toolCallId,
      output: event.isError
        ? `Error: ${stringifyResult(event.result)}`
        : stringifyResult(event.result),
    };
  ```
- `hooks/use-testeiya.ts:5-11` — the `ToolCall` type:
  ```ts
  export interface ToolCall {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    output?: string;
    state: "input-available" | "output-available" | "output-error";
  }
  ```
- `hooks/use-testeiya.ts:281-300` — the client re-detects the error by prefix:
  ```ts
  case "tool-output-available": {
    const toolCallId = data.toolCallId as string;
    const output = data.output as string;
    setActiveTool(null);
    updateLastAssistant((msg) => ({
      ...msg,
      tools: msg.tools?.map((t) =>
        t.toolCallId === toolCallId
          ? {
              ...t,
              output,
              state: output.startsWith("Error:")
                ? "output-error"
                : "output-available",
            }
          : t
      ),
    }));
    break;
  }
  ```
- The WS protocol is plain JSON (`bridge.ts` → `connection.ts` `send` →
  `use-testeiya.ts` `handleWsMessage`). Adding a new field to the message object
  is backward compatible: old clients ignore unknown fields.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck backend | `cd testeiya && npx tsc --noEmit` | exit 0, no errors |
| Lint root | `bun run lint` (repo root) | exit 0 |
| Typecheck root | `npx tsc --noEmit` (repo root) | exit 0 |
| Build UI | `bun run build` (repo root) | exit 0, static export to `out/` |

> If `npx tsc --noEmit` reports many pre-existing errors unrelated to your two
> files (the root config excludes some `ai-elements` files), that is acceptable —
> confirm your two changed files introduce **no new** errors. Plan 004 fixes the
> typecheck scripts proper.

## Scope

**In scope**:
- `testeiya/src/bridge.ts` (submodule)
- `hooks/use-testeiya.ts` (root)

**Out of scope** (do NOT touch):
- `app/page.tsx` — it already reads `tool.state === "output-error"` to drive
  `errorText` (lines ~826-831); keeping the `state` field semantics means no
  change there. Do not refactor the renderer in this plan (plan 013 owns it).
- Any other WS message type or the `stringifyResult` helper.

## Git workflow

- Submodule change: `cd testeiya`, branch `advisor/002-iserror`, commit
  `emit explicit isError on tool output instead of an Error: prefix`.
- Root change: branch `advisor/002-iserror`, commit (conventional):
  `fix: derive tool error state from isError flag, not output prefix`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Emit `isError` from the bridge (submodule)

In `testeiya/src/bridge.ts`, the `tool_execution_end` case: add an explicit
`isError` boolean while keeping the existing `output` string (so older clients
still work). Target shape:

```ts
case "tool_execution_end":
  return {
    type: "tool-output-available",
    toolCallId: event.toolCallId,
    isError: !!event.isError,
    output: event.isError
      ? `Error: ${stringifyResult(event.result)}`
      : stringifyResult(event.result),
  };
```

**Verify**: `cd testeiya && npx tsc --noEmit` → no new errors in `bridge.ts`.

### Step 2: Read `isError` in the client (root)

In `hooks/use-testeiya.ts`, the `tool-output-available` case: prefer the new
boolean and fall back to the prefix only when it's absent (defensive, for an
old server). Target shape:

```ts
case "tool-output-available": {
  const toolCallId = data.toolCallId as string;
  const output = data.output as string;
  const isError =
    typeof data.isError === "boolean" ? data.isError : output.startsWith("Error:");
  setActiveTool(null);
  updateLastAssistant((msg) => ({
    ...msg,
    tools: msg.tools?.map((t) =>
      t.toolCallId === toolCallId
        ? {
            ...t,
            output,
            state: isError ? "output-error" : "output-available",
          }
        : t
    ),
  }));
  break;
}
```

The `ToolCall` type does not need a new field — `state` already encodes the
outcome. Do not add an `isError` field to `ToolCall`.

**Verify**: `bun run lint` → exit 0; `npx tsc --noEmit` (root) → no new errors in
`hooks/use-testeiya.ts`.

### Step 3: Build the UI

**Verify**: `bun run build` → exit 0, completes the static export.

## Test plan

- No automated UI test harness exists for the frontend (out of scope to add
  one). Manual verification: run `bun run dev`, send a prompt that makes the
  agent read a file whose content starts with `Error:` (or run a `bash` command
  whose output begins with `Error:`), and confirm the tool renders as a **normal
  (non-red)** output. Then trigger a genuinely failing tool (e.g. `read` a
  nonexistent path) and confirm it renders red. Record the two observations in
  your report.
- If you cannot run the app, state that manual verification was skipped and rely
  on the build/lint/typecheck gates.

## Done criteria

ALL must hold:

- [ ] `testeiya/src/bridge.ts` emits `isError: !!event.isError` on
      `tool-output-available`
- [ ] `hooks/use-testeiya.ts` derives `state` from `data.isError` (with the
      prefix only as a fallback)
- [ ] `cd testeiya && npx tsc --noEmit` introduces no new errors in `bridge.ts`
- [ ] `bun run lint` exits 0; `bun run build` exits 0
- [ ] `grep -n 'output.startsWith("Error:")' hooks/use-testeiya.ts` shows the
      prefix used **only** as a fallback inside the `isError` resolution, not as
      the primary check
- [ ] No files outside the in-scope list modified (`git status` in both repos)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts in "Current state" don't match live code (drift).
- `event.isError` is not present on `tool_execution_end` events in the installed
  SDK version (inspect the event shape in `bridge.ts` via a log if unsure) — if
  the field genuinely doesn't exist, STOP and report; do not invent a substitute.
- The build or lint fails for reasons traceable to your change after one fix
  attempt.

## Maintenance notes

- Plan 013 (message-list memoization) edits the same render path in `app/page.tsx`
  — land 002 first so 013 builds on the corrected `state` semantics.
- The string `Error:` prefix is now only a legacy fallback; a future cleanup can
  drop it once no old server can connect, but that's not in scope here.
- A reviewer should confirm the change is additive on the wire (old field kept),
  so a mixed old-server/new-client or new-server/old-client pairing still works.
