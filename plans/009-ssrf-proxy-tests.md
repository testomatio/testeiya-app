# Plan 009: Characterization tests for the SSRF proxy whitelist

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the `testeiya/` submodule** (a new test + a tiny seam in
> `src/api/testomatio-proxy.ts` if needed for testability — see Step 1). Commit
> inside the submodule.
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/api/testomatio-proxy.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (the `bun test` harness/script)
- **Category**: tests
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

`testomatio-proxy.ts` is the only thing stopping the browser-reachable
`/api/testomatio/:resource` endpoint from being turned into a request forge: a
resource whitelist, a writable-resource whitelist, a filter whitelist, and an
id-required-for-PUT rule. Today these guards have **no tests**, so a future edit
that adds a resource/filter — or accidentally drops the `ALLOWED_RESOURCES` check
— is undetectable. This plan pins the guard behavior with characterization tests
so any regression fails CI.

## Current state

`testeiya/src/api/testomatio-proxy.ts`:

```ts
const ALLOWED_RESOURCES = new Set([
  "runs", "tests", "suites", "plans", "testruns", "rungroups", "issues",
]);
const WRITABLE_RESOURCES = new Set(["testruns", "runs"]);
const ALLOWED_FILTERS = new Set(["run_id", "page", "per_page", "query"]);

export async function testomatioProxy(req: Request, resource: string): Promise<Response> {
  if (!ALLOWED_RESOURCES.has(resource)) {
    return Response.json({ error: "bad resource" }, { status: 400 });
  }
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  // ... requires session, looks up via getSession ...
  if (!sessionId) return Response.json({ error: "session required" }, { status: 400 });
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "session not found" }, { status: 404 });
  // ... resolves projectSlug/token/baseUrl ...
  if (method === "PUT") {
    if (!WRITABLE_RESOURCES.has(resource)) return Response.json({ error: "resource not writable" }, { status: 400 });
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    // ...
  }
  if (method !== "PUT") {
    for (const [k, v] of url.searchParams) {
      if (ALLOWED_FILTERS.has(k) && v) upstream.searchParams.set(k, v);
    }
  }
  const res = await fetch(upstream.toString(), init);   // <-- the only outbound call
  // ...returns upstream body...
}
```

Important for tests: the guards that need **no** upstream call are reachable
without mocking `fetch`:
- a bad resource → 400 **before** any session lookup;
- a missing session → 400/404 **before** `fetch`;
- a non-writable PUT / PUT without id → 400 **before** `fetch`.

The filter-stripping and slug/id encoding happen right before `fetch`. To assert
those without hitting the network, you need to intercept the global `fetch`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `cd testeiya && bun test src/api/testomatio-proxy.test.ts` | all pass |
| All tests | `cd testeiya && bun test` | all pass |
| Backend typecheck | `cd testeiya && npx tsc --noEmit` | no new errors |

## Scope

**In scope** (submodule):
- `testeiya/src/api/testomatio-proxy.test.ts` (create)
- `testeiya/src/api/testomatio-proxy.ts` — **only if** a tiny export is needed for
  testability (see Step 1). Prefer not to change it.

**Out of scope** (do NOT touch):
- The whitelists' membership — this plan pins current behavior, it does not change
  what's allowed.
- `session-store.ts` — use it as-is to seed a session (or stub `getSession`).

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/009-ssrf-proxy-tests`, commit
  `add characterization tests for testomatio proxy SSRF guard`.

## Steps

### Step 1: Decide the test seam (prefer no source change)

The no-source-change path: seed a real session via `createSession` (isolate
`HOME` to a temp dir first, as in plan 006) so the handler's `getSession`
succeeds, and intercept the global `fetch` to capture the upstream URL without
network. Use Bun's mock:

```ts
import { test, expect, mock, beforeEach, afterEach } from "bun:test";
// set process.env.HOME to a temp dir, then:
const store = await import("../session-store.js");
const { testomatioProxy } = await import("./testomatio-proxy.js");
```

Only if `getSession` cannot be satisfied without elaborate setup should you export
a thin internal for direct testing — keep any such change minimal and additive.

### Step 2: Tests that need no upstream

These assert the guard before any `fetch`:

1. **Bad resource** — `testomatioProxy(new Request("http://x/api/testomatio/secrets?session=s"), "secrets")`
   → 400 with `{ error: "bad resource" }`. (No session needed.)
2. **Missing session** — allowed resource, no `?session` → 400 "session required".
3. **Unknown session** — allowed resource, `?session=nope` → 404 "session not found".
4. **Non-writable PUT** — `PUT` to `tests` (allowed for GET, not writable) with a
   valid session + id → 400 "resource not writable".
5. **PUT without id** — `PUT` to `testruns` (writable) without `id` → 400
   "id required".

For cases 4-5, seed a session whose `projects[0].slug`, `tokens[slug]`, and
`backendUrl` are set so the handler reaches the PUT branch.

### Step 3: Tests that intercept `fetch`

Mock the global `fetch` to return a canned `Response` and record the URL it was
called with:

```ts
let lastUrl = "";
beforeEach(() => {
  globalThis.fetch = mock(async (u: any) => {
    lastUrl = String(u);
    return new Response(JSON.stringify({ data: [], meta: { total: 0 } }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as any;
});
afterEach(() => mock.restore());
```

6. **Allowed filter passes through** — GET `tests?session=s&query=foo` → after the
   call, `lastUrl` contains `query=foo`.
7. **Disallowed filter stripped** — GET `tests?session=s&evil=1&query=foo` →
   `lastUrl` contains `query=foo` but **not** `evil=1`.
8. **Slug/id encoding** — GET `tests?session=s&id=a%2Fb` (or set a slug with a
   special char) → the upstream path uses `encodeURIComponent` (no raw `/` from
   the id segment beyond the path separators the handler itself adds).

**Verify**: `cd testeiya && bun test src/api/testomatio-proxy.test.ts` → all pass.

### Step 4: Full check

**Verify**: `cd testeiya && bun test` → all pass; `npx tsc --noEmit` no new errors.

## Test plan

- New `testeiya/src/api/testomatio-proxy.test.ts` with cases 1-8.
- Cases 1-5 need no network; 6-8 mock global `fetch`.
- Verification: `cd testeiya && bun test` → all pass.

## Done criteria

ALL must hold:

- [ ] Tests assert: bad resource → 400; missing/unknown session → 400/404;
      non-writable PUT → 400; PUT-without-id → 400
- [ ] Tests assert: allowed filters reach the upstream URL; disallowed query
      params are stripped; slug/id are URL-encoded
- [ ] `cd testeiya && bun test` exits 0 including the new suite
- [ ] `cd testeiya && npx tsc --noEmit` no new errors
- [ ] `testomatio-proxy.ts` source unchanged, OR changed only by a minimal
      additive export needed for testability (documented in the commit)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The whitelists or guard order in the source differ from the excerpts (drift) —
  STOP and re-derive the expected behavior before writing assertions.
- A test reveals the guard actually lets a disallowed resource/filter through —
  that's a real bug: STOP and report it (do not "fix" the proxy under a tests-only
  plan).
- Mocking `globalThis.fetch` doesn't take effect because the handler captured a
  reference at import — if so, document it and fall back to asserting only the
  no-network cases (1-5), noting the gap.

## Maintenance notes

- These tests are the regression gate for the SSRF whitelist: any future change to
  `ALLOWED_RESOURCES`/`WRITABLE_RESOURCES`/`ALLOWED_FILTERS` must update them
  deliberately, which is the point.
- A reviewer should confirm the tests pin *current* behavior and don't silently
  widen the allowlist.
