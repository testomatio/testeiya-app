# Plan 005: Validate `postMessage` origin in the host bridge

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the ROOT repo only** (`lib/host-bridge.tsx`).
>
> **Drift check (run first)**:
> `git diff --stat 28e0468..HEAD -- lib/host-bridge.tsx lib/theme.tsx`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: root `28e0468`, 2026-06-11

## Why this matters

When Testeiya is embedded as an iframe in the Testomat.io product, it learns its
auth context (`jwt`, `apiUrl`, `projectSlug`, theme) from a `postMessage` the
host sends. The handler **never checks `event.origin`**, and it replies/broadcasts
with a wildcard target (`postMessage(..., "*")`). So any page that frames the app
— or any window with a handle to it — can inject a forged `testomatio:init` with
an attacker-controlled `apiUrl`/`jwt` (redirecting the embedded app's API calls
and identity), and any framing page receives the app's outbound messages. This is
the classic embedded-token trust gap; the fix is a standard origin allowlist.

## Current state

- `lib/host-bridge.tsx:42-63` — the message handler, no origin check:
  ```tsx
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "testomatio:init") return;
      if (typeof data.jwt !== "string" || typeof data.projectSlug !== "string") return;
      const theme: Theme = data.theme === "light" ? "light" : "dark";
      setValue({
        jwt: data.jwt,
        projectSlug: data.projectSlug,
        apiUrl: data.apiUrl,
        isEmbedded: true,
        theme,
        railsEnv: typeof data.railsEnv === "string" ? data.railsEnv : "production",
      });
    };
    window.addEventListener("message", onMessage);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "testomatio:ready" }, "*");
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);
  ```
- `lib/host-bridge.tsx:77-81` — the outbound helper, wildcard target:
  ```tsx
  export function postToHost(message: { type: string } & Record<string, unknown>) {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    window.parent.postMessage(message, "*");
  }
  ```
- `lib/host-bridge.tsx:27-28` — the env vars already used for the non-embedded
  default: `NEXT_PUBLIC_TESTOMATIO_API_URL`, `NEXT_PUBLIC_DEFAULT_PROJECT_SLUG`.
  There is no existing allowlist env var; this plan introduces one.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run lint` | exit 0 |
| Typecheck | `npx tsc --noEmit` (root) | no new errors in `host-bridge.tsx` |
| Build UI | `bun run build` | exit 0 |

## Scope

**In scope**:
- `lib/host-bridge.tsx` (root)

**Out of scope** (do NOT touch):
- `lib/theme.tsx` — it reads the host context but does not need changes; the
  origin check belongs only in the bridge.
- Server-side CSP/`frame-ancestors` — that's a separate effort (direction DIR-03);
  this plan is client-side origin validation only.
- `lib/host-bridge.tsx:25-40` (the non-embedded default value initializer) — keep
  it as-is.

## Git workflow

- Branch: `advisor/005-postmessage-origin`.
- Commit (conventional): `fix(security): validate host postMessage origin and target`.

## Steps

### Step 1: Define the allowed-host-origin resolver

At the top of `lib/host-bridge.tsx` (module scope, below imports), add a function
that builds the set of trusted host origins from an env var, with a sensible
default for the Testomat.io app. Target shape:

```tsx
// Origins allowed to embed this app and send `testomatio:init`. Configurable via
// NEXT_PUBLIC_TESTOMATIO_ALLOWED_ORIGINS (comma-separated) for staging/self-host.
function allowedHostOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_TESTOMATIO_ALLOWED_ORIGINS;
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ["https://app.testomat.io"];
}
```

> If `lib/host-bridge.tsx` already references a configured Testomat.io origin
> elsewhere (search the file), reuse that value as an additional default rather
> than hardcoding a second source of truth.

### Step 2: Reject messages from untrusted origins

In `onMessage`, reject any event whose origin is not in the allowlist **before**
reading `data`. Update the `useEffect` so it computes the allowlist once and
guards on it:

```tsx
useEffect(() => {
  const allowed = new Set(allowedHostOrigins());
  const onMessage = (event: MessageEvent) => {
    if (!allowed.has(event.origin)) return;          // <-- new guard
    const data = event.data;
    if (!data || data.type !== "testomatio:init") return;
    // ...unchanged...
  };
  window.addEventListener("message", onMessage);
  if (window.parent !== window) {
    for (const origin of allowed) {
      window.parent.postMessage({ type: "testomatio:ready" }, origin);  // <-- targeted
    }
  }
  return () => window.removeEventListener("message", onMessage);
}, []);
```

Rationale for posting `ready` to each allowed origin: at handshake time the app
doesn't yet know which host framed it; posting to each *trusted* origin (instead
of `"*"`) means only a trusted parent can receive it. A browser silently drops a
`postMessage` whose `targetOrigin` doesn't match the actual parent, so this is
safe.

### Step 3: Fix the outbound `postToHost` target

`postToHost` runs after init, so it can target the first allowed origin (or, if
you prefer, store the validated origin from the init message in a module variable
and use that). Simplest correct version:

```tsx
export function postToHost(message: { type: string } & Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  for (const origin of allowedHostOrigins()) {
    window.parent.postMessage(message, origin);
  }
}
```

> Optional improvement (only if straightforward): capture `event.origin` from the
> accepted `testomatio:init` into a module-scoped `let hostOrigin` and have
> `postToHost` target exactly that. Either approach removes the `"*"`.

**Verify**: `grep -n '"\*"' lib/host-bridge.tsx` → no matches (no wildcard
targets remain).

### Step 4: Lint, typecheck, build

**Verify**: `bun run lint` → 0; `npx tsc --noEmit` → no new errors in
`host-bridge.tsx`; `bun run build` → 0.

## Test plan

- No frontend test harness exists. Manual verification (record results): with the
  app loaded standalone, confirm it still works (non-embedded path unchanged).
  If you can stand up a trivial parent page on `http://localhost:3050` that frames
  the app and posts `testomatio:init` — a same-origin parent — confirm init is
  accepted only when the parent's origin is in the allowlist (you can temporarily
  add `http://localhost:3050` to `NEXT_PUBLIC_TESTOMATIO_ALLOWED_ORIGINS` to test,
  then revert).
- If you cannot exercise the embed path, state that and rely on the static-analysis
  gate (no `"*"` remains; origin guard present).

## Done criteria

ALL must hold:

- [ ] `onMessage` returns early unless `event.origin` is in the allowlist
- [ ] `grep -n '"\*"' lib/host-bridge.tsx` returns no matches
- [ ] The allowlist is configurable via `NEXT_PUBLIC_TESTOMATIO_ALLOWED_ORIGINS`
      with a documented default
- [ ] `bun run lint` exits 0; `npx tsc --noEmit` no new errors; `bun run build`
      exits 0
- [ ] No files outside `lib/host-bridge.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift).
- You discover the production host origin is NOT `https://app.testomat.io` and you
  cannot determine the correct value from the repo or env — STOP and report; an
  over-tight default would break the real embed.
- The non-embedded standalone app stops working after the change — STOP (the guard
  should not affect the standalone path, which never receives a host message).

## Maintenance notes

- Document `NEXT_PUBLIC_TESTOMATIO_ALLOWED_ORIGINS` in the env reference (the
  `.env.example` reconciliation is a separate DX item).
- This is the client half of safe embedding; the server-side `frame-ancestors`
  CSP (so the host is *allowed* to frame the app, and others are not) is direction
  DIR-03 and must be set in the Bun `app-server` (static export forbids headers).
- A reviewer should confirm there is no remaining `"*"` target and that the
  default origin matches the real product host.
