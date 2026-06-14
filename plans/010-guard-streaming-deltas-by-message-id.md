# Plan 010: Guard streaming deltas by message id

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the ROOT repo only** (`hooks/use-testeiya.ts`).
>
> **Drift check (run first)**:
> `git diff --stat 28e0468..HEAD -- hooks/use-testeiya.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes the streaming update path — must not regress the normal
  happy path or the re-entrant multi-`agent_start` case)
- **Depends on**: none (but if plan 002 is also being done, land 002 first — both
  touch this file's tool/message handling)
- **Category**: bug
- **Planned at**: root `28e0468`, 2026-06-11

## Why this matters

Streaming text/reasoning deltas are appended to **whatever the last assistant
message is** (`findLastIndex(role === "assistant")`), with no check that the delta
belongs to that message. The server already stamps every delta with a message id
(`data.id`), and the client already tracks the active id (`currentMsgIdRef`), but
the delta handlers ignore both. If a delta arrives before/without its `start`
(reconnect attaching to an in-flight stream; the re-entrant agent loop that emits
a fresh `messageId` per `agent_start`; provider event reordering), the text is
appended to a *finished* bubble — corrupting it or interleaving garbage. The fix:
update the message **by id**, and lazily create the message if a delta arrives for
an id with no `start`.

## Current state

`hooks/use-testeiya.ts`:

- `:117` — `const currentMsgIdRef = useRef("");` (already tracked).
- `:151-162` — the updater targets the last assistant message, id-blind:
  ```ts
  const updateLastAssistant = useCallback(
    (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = updater(updated[idx]);
        return updated;
      });
    },
    []
  );
  ```
- `:209-221` — `start` is the only place a message is created, and sets
  `currentMsgIdRef`:
  ```ts
  case "start": {
    currentMsgIdRef.current = data.messageId as string;
    contentRef.current = "";
    reasoningRef.current = "";
    const skill = pendingSkillRef.current ?? undefined;
    pendingSkillRef.current = null;
    setMessages((prev) => [
      ...prev,
      { id: data.messageId as string, role: "assistant", content: "", skill },
    ]);
    setStatus("submitted");
    break;
  }
  ```
- `:227-251` — deltas use `contentRef`/`reasoningRef` accumulators + `updateLastAssistant`:
  ```ts
  case "text-delta":
    contentRef.current += data.delta as string;
    const text = contentRef.current;
    updateLastAssistant((msg) => ({ ...msg, content: text }));
    break;
  // reasoning-delta similar, using reasoningRef
  ```
- The server stamps `id` on every text/reasoning event (`bridge.ts`
  `transformMessageUpdate` sets `id: messageId`), and `start` carries `messageId`.
  So both `data.id` (deltas) and `data.messageId` (start) are available.

The accumulator refs (`contentRef`/`reasoningRef`) assume a single in-flight
message; with id-keyed updates they remain correct **as long as** they're reset
when the active id changes (today only `start` resets them).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run lint` | exit 0 |
| Typecheck | `npx tsc --noEmit` (root) | no new errors in `use-testeiya.ts` |
| Build UI | `bun run build` | exit 0 |

## Scope

**In scope**:
- `hooks/use-testeiya.ts` (root)

**Out of scope** (do NOT touch):
- `testeiya/src/connection.ts` / `bridge.ts` — the server already sends the ids;
  no server change needed.
- `app/page.tsx` — the render path; plan 013 owns it.
- The reconnect/duplicate-message behavior (a separate, larger issue) — this plan
  only stops cross-message corruption, it does not implement turn resumption.

## Git workflow

- Branch: `advisor/010-delta-by-id`.
- Commit (conventional): `fix: key streaming deltas by message id to prevent cross-message corruption`.

## Steps

### Step 1: Add an id-keyed updater

Add `updateMessageById` alongside `updateLastAssistant` (keep the latter for the
non-delta cases that legitimately target the current message, e.g. tool updates).
Target shape:

```ts
const updateMessageById = useCallback(
  (id: string, updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) {
        // A delta arrived for an id with no `start` — lazily create the message
        // so text is never appended to the wrong (previous) bubble.
        return [...prev, updater({ id, role: "assistant", content: "" })];
      }
      const updated = [...prev];
      updated[idx] = updater(updated[idx]);
      return updated;
    });
  },
  []
);
```

### Step 2: Route text/reasoning deltas through it, keyed by `data.id`

Reset the accumulator refs when the active id changes (so a lazily-created message
doesn't inherit the previous message's accumulated text). Target for `text-delta`:

```ts
case "text-delta": {
  const id = (data.id as string) || currentMsgIdRef.current;
  if (id !== currentMsgIdRef.current) {
    currentMsgIdRef.current = id;
    contentRef.current = "";
    reasoningRef.current = "";
  }
  contentRef.current += data.delta as string;
  const text = contentRef.current;
  updateMessageById(id, (msg) => ({ ...msg, content: text }));
  break;
}
```

Apply the same id-resolution + ref-reset pattern to `reasoning-delta` (using
`reasoningRef`), `reasoning-start`, and `reasoning-end` (these also currently call
`updateLastAssistant`; switch them to `updateMessageById(id, ...)` using
`data.id`). For `reasoning-start`/`reasoning-end`, the id is `data.id`.

`text-start`/`text-end` set status only (no message mutation) — leave them, but if
`text-start` carries `data.id`, you may set `currentMsgIdRef.current = data.id`
there for robustness.

### Step 3: Keep `start` authoritative

`start` still creates the message and sets `currentMsgIdRef`/resets refs as today.
The lazy-create in `updateMessageById` is the safety net for the
delta-before-start case; the normal path is unchanged (start fires first, deltas
match the id).

### Step 4: Lint, typecheck, build

**Verify**: `bun run lint` → 0; `npx tsc --noEmit` → no new errors in
`use-testeiya.ts`; `bun run build` → 0.

## Test plan

- No frontend test harness. Manual verification (record results): run `bun run dev`
  and confirm a normal multi-turn conversation streams correctly (text lands in
  the right bubble, reasoning shows/collapses, multiple `agent_start` re-entries
  in one turn produce distinct bubbles — the re-entrant case the server comments
  describe at `connection.ts:163-165`).
- If you can reproduce a reconnect (let the watchdog fire, then resend), confirm
  text no longer appends to the prior message.
- If you cannot run the app, state that and rely on lint/typecheck/build plus code
  review of the id-keying.

## Done criteria

ALL must hold:

- [ ] Text/reasoning deltas update the message matching `data.id` (not the last
      assistant message)
- [ ] A delta for an unknown id lazily creates that message instead of mutating
      the previous one
- [ ] Accumulator refs (`contentRef`/`reasoningRef`) reset when the active id
      changes
- [ ] `bun run lint` exits 0; `npx tsc --noEmit` no new errors; `bun run build`
      exits 0
- [ ] No files outside `hooks/use-testeiya.ts` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift).
- After the change, the normal happy path renders text into the wrong bubble or
  duplicates messages in dev — STOP and report (likely an id-reset bug in Step 2).
- `data.id` turns out to be absent on delta events in the installed server — STOP
  and report; the fallback to `currentMsgIdRef.current` keeps things working, but
  the cross-message guarantee would be weaker and worth flagging.

## Maintenance notes

- This does not fix the watchdog/reconnect *duplicate user message + orphaned run*
  issue (a separate, larger server-side turn-resumption effort) — it only prevents
  text corruption across messages. Note that follow-up in review.
- Plan 013 (memoization) keys the rendered list by `message.id`; id-correct
  messages here make that memoization sound.
- A reviewer should check that `updateLastAssistant` is still used only for
  cases that legitimately target the current message (tool input/output), and that
  every delta path now uses `updateMessageById`.
