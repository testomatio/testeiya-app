# Plan 013: Memoize the streaming message list

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the ROOT repo only** (`app/page.tsx`, optionally a new small
> component file).
>
> **Drift check (run first)**:
> `git diff --stat 28e0468..HEAD -- app/page.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (memo equality must not drop legitimate re-renders of the
  streaming message)
- **Depends on**: 002 (both touch the per-message tool render path; land 002 first)
- **Category**: perf
- **Planned at**: root `28e0468`, 2026-06-11

## Why this matters

During streaming, every token triggers `setMessages([...])`, and `app/page.tsx`
re-renders the **entire** `messages.map(...)` list. For each message it runs an
inline IIFE that recomputes `segmentTools(tools, isStreaming)` and rebuilds the
`renderRoutine`/`renderRender` closures. That's O(messages × tools) work per
delta even though only the **last** message changes. On a long conversation with
many tool calls this causes visible jank. Extracting the per-message body into a
`React.memo` component (and memoizing `segmentTools` per message) means only the
streaming message re-renders per token.

## Current state

`app/page.tsx:732-900` — the list render. Key shape:

```tsx
{messages.map((message) => (
  <Message
    className={message.role === "user" ? "max-w-[85%]" : "max-w-full"}
    from={message.role}
    key={message.id}
  >
    {/* skill banner, attached files, reasoning ... */}

    {(() => {
      const tools = message.tools ?? [];
      const isLastMessage = messages[messages.length - 1]?.id === message.id;
      const isStreaming =
        isLastMessage && (status === "streaming" || status === "submitted");
      const segments = segmentTools(tools, isStreaming);
      const renderRoutine = (tool: ToolCall): ReactNode => ( /* ... */ );
      const renderRender = (tool: ToolCall, isLatest: boolean): ReactNode => ( /* ... */ );
      return renderSegments(segments, renderRoutine, renderRender);
    })()}

    {/* text content (MessageResponse), MessageActions, AskQuestionRenderer ... */}
  </Message>
))}
```

- The IIFE depends on: `message`, `isLastMessage`/`isStreaming` (derived from
  `messages.length`/`status`), and the handlers `answerQuestion`,
  `renderRichTool`, `segmentTools`, `renderSegments` (module/stable functions).
- `components/ai-elements/message.tsx`: `Message` is a plain component;
  `MessageResponse` (the markdown body) is already `memo`'d (line ~326). So the
  expensive non-memoized work is the per-message tool segmentation + the
  surrounding JSX.
- Each message has a stable `key={message.id}`. A streaming message changes by
  reference each delta (so it must re-render); finished messages are stable.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run lint` | exit 0 |
| Typecheck | `npx tsc --noEmit` (root) | no new errors |
| Build UI | `bun run build` | exit 0 |

## Scope

**In scope**:
- `app/page.tsx` (root) — extract the per-message body into a memoized component.
- Optionally `components/agent-output/MessageItem.tsx` (or similar) if you prefer a
  separate file; keep it colocated and small.

**Out of scope** (do NOT touch):
- `components/ai-elements/message.tsx` — `MessageResponse` is already memoized;
  don't change the shared kit.
- `segmentTools`/`renderSegments`/`renderRichTool` logic — reuse them as-is.
- The tool-state semantics — plan 002 owns `isError`/`state`.

## Git workflow

- Branch: `advisor/013-memoize-messages`.
- Commit (conventional): `perf: memoize per-message render so streaming re-renders only the active message`.

## Steps

### Step 1: Extract a `MessageItem` component

Create a component that takes exactly the props it needs and renders one message's
full body (the skill banner, files, reasoning, the tool-segments IIFE, text
content, and the ask-question list). Props:

```tsx
interface MessageItemProps {
  message: ChatMessage;
  isStreaming: boolean;               // already computed by the parent
  onAnswer: (toolCallId: string, value: string) => void;  // = answerQuestion
}
```

Wrap it in `React.memo`. Because `isStreaming` and `message` are the only
changing inputs and `onAnswer` is stable (`useCallback` from the hook), the
default shallow `memo` comparison is sufficient: finished messages keep the same
`message` reference and `isStreaming=false`, so they skip re-render; the streaming
message gets a new `message` reference each delta and re-renders. **Do not** write
a custom `areEqual` that compares only `message.id` — that would freeze the
streaming message.

Move `segmentTools(...)` into a `useMemo` keyed on `[message.tools, isStreaming]`
inside `MessageItem` so segmentation recomputes only when those change.

### Step 2: Use it in the list

```tsx
{messages.map((message, i) => {
  const isStreaming =
    i === messages.length - 1 &&
    (status === "streaming" || status === "submitted");
  return (
    <MessageItem
      key={message.id}
      message={message}
      isStreaming={isStreaming}
      onAnswer={answerQuestion}
    />
  );
})}
```

The `<Message>` wrapper and its `className`/`from` move inside `MessageItem`.

### Step 3: Lint, typecheck, build

**Verify**: `bun run lint` → 0; `npx tsc --noEmit` → no new errors; `bun run build`
→ 0.

## Test plan

- No frontend test harness. Manual verification (record results): run `bun run dev`,
  hold a long conversation with several tool calls, and confirm streaming is
  smooth and that finished messages don't visibly re-render while a new one
  streams. Confirm `ask_question` buttons still work (the `onAnswer` path), and
  reasoning still streams/collapses.
- Optional: React DevTools "Highlight updates" should show only the last message
  flashing during streaming.
- If you cannot run the app, rely on lint/typecheck/build plus careful review of
  the memo boundary.

## Done criteria

ALL must hold:

- [ ] Per-message body is rendered by a `React.memo` component (`MessageItem`)
- [ ] `segmentTools` runs inside a `useMemo` keyed on `[message.tools, isStreaming]`
- [ ] No custom `areEqual` that compares only `message.id` (the streaming message
      must still re-render each delta)
- [ ] `bun run lint` exits 0; `npx tsc --noEmit` no new errors; `bun run build`
      exits 0
- [ ] `ask_question`, reasoning, skill banner, and attachments still render
      (manual or review)
- [ ] No out-of-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift) — likely if plan 002 reshaped the
  tool render; reconcile against the live `app/page.tsx` before extracting.
- After the change, the streaming message stops updating (frozen text) — your memo
  is too aggressive; STOP and report (remove the custom comparator).
- Extraction forces touching `components/ai-elements/message.tsx` — STOP; keep the
  shared kit out of scope.

## Maintenance notes

- This relies on the streaming message getting a fresh object reference each delta
  (it does — `updateLastAssistant`/`updateMessageById` build a new array and
  object). If a future change mutates messages in place, the memo would stop
  updating; flag that in review.
- Plan 010 (id-keyed deltas) makes message identity correct; this memo keys on
  `message.id`, so the two compose cleanly.
