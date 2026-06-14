# Plan 007: Gate `/api/*` + the agent WS behind auth; lock down `mcp/add`

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. This is a security-sensitive plan touching every client
> call path — read the whole plan before editing. Update `plans/README.md` when
> done.
>
> **This plan edits the `testeiya/` submodule** (server + a couple of client
> fetch helpers in the root if you choose the token approach — see Step 0 and the
> decision). Commit each repo separately.
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/app-server.ts src/api/mcp.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the request path and the WS upgrade; easy to break local
  dev if the token isn't wired everywhere)
- **Depends on**: none
- **Category**: security
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

**No `/api/*` endpoint and no agent WebSocket performs any authentication.** The
default bind is `127.0.0.1` (safe on a single-user desktop), but `HOST` is an env
override (`app-server.ts:72`) and a `Dockerfile` exists for hosted web mode. The
moment the port is reachable beyond loopback, an attacker gets: arbitrary
workspace file read/write (`/api/files/*`), full agent control over the WS (the
agent can run bash/edit files), test pull/push with stored tokens, and provider/
MCP config writes. The sharpest escalation is `POST /api/mcp/add`'s custom-server
branch: it accepts an arbitrary `command`/`args`/`env`, persists it to the
session's `mcp.json`, and **the agent spawns it on the next session start** — i.e.
arbitrary command execution, bypassing the read-only permission gating (which only
governs the agent's own bash/edit tools, not MCP server launch).

The goal: refuse to serve `/api/*` and WS upgrades without a valid token whenever
the server is reachable beyond loopback, and refuse `mcp/add` custom (non-catalog)
stdio commands unless explicitly trusted.

## Decision (scope the safe, shippable version)

A full bearer-token scheme threaded through every client fetch is the complete
fix but high-risk for a desktop app whose port is random per launch. Ship this in
two layers, in order, and STOP after Layer 1 if Layer 2's client wiring proves
too broad for one pass:

- **Layer 1 (required): bind-safety + a server token gate that is a no-op on
  loopback.** When `HOST` resolves to a non-loopback address, require a shared
  secret (`TESTEIYA_AUTH_TOKEN` env) on every `/api/*` request and the WS
  upgrade; reject otherwise. On loopback (the desktop/default case) the gate is
  bypassed, so local dev and the desktop app are unaffected. Also **refuse to
  start** on a non-loopback `HOST` when no token is configured (fail safe).
- **Layer 2 (required regardless of bind): lock down `mcp/add` custom commands.**
  This is exploitable even on loopback by any local process, and is the RCE path.

## Current state

- `testeiya/src/app-server.ts:72` — `const HOSTNAME = process.env.HOST || "127.0.0.1";`
- `testeiya/src/app-server.ts:290-318` — the `fetch` handler upgrades any WS and
  dispatches any `/api/*` with no auth:
  ```ts
  async fetch(req, server) {
    const url = new URL(req.url);
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const ok = server.upgrade(req, {
        data: { storedSessionId: url.searchParams.get("session"), conn: null },
      });
      if (ok) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(req, url.pathname); }
      catch (err: any) { /* 500 */ }
    }
    return serveStatic(staticDir, url.pathname);
  }
  ```
- `testeiya/src/api/mcp.ts:304-324` — the custom-server branch of `mcpAdd`
  accepts raw `command`/`args`/`env` with only `name` regex-validated:
  ```ts
  } else if (body.server) {
    const s = body.server;
    name = (s.name ?? "").trim();
    if (!name) return Response.json({ error: "server name required" }, { status: 400 });
    if (!/^[\w.-]+$/.test(name)) { /* 400 */ }
    config = cleanConfig({
      command: s.command?.trim(),
      args: s.args,
      env: s.env,
      url: s.url?.trim(),
      headers: s.headers,
      type: s.type,
    });
  }
  ```
  The `fromCatalog` branch (lines 275-303) builds config from a trusted local
  catalog (`getCatalogService`) — that path is fine.
- The client connects the WS in `hooks/use-testeiya.ts` (`getWsBase`,
  `new WebSocket(wsUrl)`) and calls the API with relative `fetch("/api/...")`
  across `lib/services/*` and components.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `cd testeiya && npx tsc --noEmit` | no new errors |
| Server boots (loopback) | `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 \| head` | "listening" line, no auth required |
| Refuses non-loopback w/o token | `cd testeiya && HOST=0.0.0.0 PORT=0 timeout 5 bun src/app-server.ts 2>&1 \| head` | exits/logs a clear refusal |
| Tests | `cd testeiya && bun test src/api/mcp.test.ts` | all pass |

## Scope

**In scope** (submodule):
- `testeiya/src/app-server.ts` — Layer 1 gate + startup safety check.
- `testeiya/src/api/mcp.ts` — Layer 2 `mcpAdd` lockdown.
- `testeiya/src/api/mcp.test.ts` (create) — tests for the lockdown.

**Out of scope** (do NOT touch in this plan):
- Threading a bearer token through every root client fetch — explicitly deferred
  (Layer 1 makes the gate a loopback no-op, so the desktop client needs no
  change). If you decide Layer 1's non-loopback path needs the client to send the
  token, document it as a follow-up; do not refactor all of `lib/services/*` here.
- The static-file path (`serveStatic`) — unrelated.
- The `fromCatalog` branch of `mcpAdd` — it's already trusted.

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/007-api-auth`, commit
  `gate api+ws on non-loopback bind; lock down mcp/add custom commands`.

## Steps

### Step 1 (Layer 1): Resolve loopback + token at startup

In `app-server.ts`, near `HOSTNAME`, add helpers:

```ts
function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}
const AUTH_TOKEN = process.env.TESTEIYA_AUTH_TOKEN || "";
const REQUIRE_AUTH = !isLoopbackHost(HOSTNAME);
```

In `startServer()`, before `Bun.serve`, fail safe:

```ts
if (REQUIRE_AUTH && !AUTH_TOKEN) {
  throw new Error(
    "Refusing to start: HOST is non-loopback but TESTEIYA_AUTH_TOKEN is not set. " +
    "Set a token, or bind to 127.0.0.1, or place the server behind an authenticating proxy."
  );
}
```

**Verify**: `cd testeiya && HOST=0.0.0.0 PORT=0 timeout 5 bun src/app-server.ts 2>&1 | head`
→ prints the refusal and does not serve.

### Step 2 (Layer 1): Enforce the token on `/api/*` and the WS upgrade

Add a check helper and call it in `fetch` before upgrading/dispatching:

```ts
function authOk(req: Request, url: URL): boolean {
  if (!REQUIRE_AUTH) return true;
  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${AUTH_TOKEN}`) return true;
  // WS upgrades can't set headers in the browser — accept a query token too.
  if (url.searchParams.get("token") === AUTH_TOKEN) return true;
  return false;
}
```

In `fetch`, gate both branches:

```ts
async fetch(req, server) {
  const url = new URL(req.url);
  const wantsWs = req.headers.get("upgrade")?.toLowerCase() === "websocket";
  if ((wantsWs || url.pathname.startsWith("/api/")) && !authOk(req, url)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ...existing upgrade + /api + static logic unchanged...
}
```

Static asset serving stays unauthenticated (the UI shell must load to prompt for
anything); only `/api/*` and WS are gated.

**Verify**: loopback still works with no token:
`cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 | head` → "listening",
and a same-origin client (the desktop app / `bun run dev`) is unaffected because
`REQUIRE_AUTH` is false on `127.0.0.1`.

### Step 3 (Layer 2): Lock down `mcpAdd` custom stdio commands

In `api/mcp.ts`, in the `body.server` branch, reject a custom **stdio** server
(one with a `command`) unless an explicit opt-in env is set. Remote (`url`-based)
custom servers are less dangerous (no local exec) but still gate them behind the
same opt-in to be safe. Target:

```ts
} else if (body.server) {
  const s = body.server;
  name = (s.name ?? "").trim();
  if (!name) return Response.json({ error: "server name required" }, { status: 400 });
  if (!/^[\w.-]+$/.test(name)) { /* existing 400 */ }
  if (s.command && process.env.TESTEIYA_ALLOW_CUSTOM_MCP !== "1") {
    return Response.json(
      { error: "custom MCP commands are disabled; add this server from the catalog, or set TESTEIYA_ALLOW_CUSTOM_MCP=1 to enable local custom commands" },
      { status: 403 }
    );
  }
  config = cleanConfig({ /* unchanged */ });
}
```

This preserves the catalog flow (the normal UI path) and the ability for a power
user to opt in locally, while closing the network-reachable arbitrary-exec hole.

**Verify**: see Step 4 tests.

### Step 4 (Layer 2): Tests for the lockdown

Create `testeiya/src/api/mcp.test.ts`. Isolate `HOME` to a temp dir before
importing (the catalog/config write under `~/.testeiya`); seed a session via the
store. Cover:
1. `mcpAdd` with `{ server: { name: "x", command: "/bin/evil" } }` and
   `TESTEIYA_ALLOW_CUSTOM_MCP` unset → 403, and the server is **not** written to
   the catalog (`readCatalog` has no `x`).
2. Same with `TESTEIYA_ALLOW_CUSTOM_MCP=1` → succeeds (200) and `x` is in the
   catalog.
3. `mcpAdd` with an unknown `fromCatalog` → 404 (existing behavior, regression
   guard).

Use the `bun test` runner (added by plan 001/006). Model the temp-`HOME` setup on
plan 006's `session-store.test.ts`.

**Verify**: `cd testeiya && bun test src/api/mcp.test.ts` → all pass.

### Step 5: Full check

**Verify**: `cd testeiya && bun test` → all pass; `npx tsc --noEmit` → no new
errors; loopback server boots; non-loopback-without-token refuses.

## Test plan

- New `testeiya/src/api/mcp.test.ts` (3 cases above).
- Manual: confirm the desktop/dev flow is unchanged (loopback, no token). If you
  can, run `HOST=0.0.0.0 TESTEIYA_AUTH_TOKEN=secret PORT=0 bun src/app-server.ts`
  and confirm `curl localhost:<port>/api/settings` → 401 without the header and
  200 with `-H "authorization: Bearer secret"`.
- Verification: `cd testeiya && bun test` → all pass.

## Done criteria

ALL must hold:

- [ ] Server refuses to start on a non-loopback `HOST` with no `TESTEIYA_AUTH_TOKEN`
- [ ] On non-loopback bind, `/api/*` and WS upgrades return 401 without a valid
      token (header `Bearer` or `?token=`); on loopback the gate is a no-op
- [ ] `mcpAdd` custom-server with a `command` returns 403 unless
      `TESTEIYA_ALLOW_CUSTOM_MCP=1`, and does not persist the server
- [ ] `cd testeiya && bun test` exits 0 including `api/mcp.test.ts`
- [ ] `cd testeiya && npx tsc --noEmit` no new errors; loopback server boots
- [ ] No files outside the in-scope list modified (`cd testeiya && git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift).
- Enabling the gate breaks the **loopback** desktop/dev flow (it must not —
  `REQUIRE_AUTH` is false there). If it does, STOP and report.
- You find the browser embed (iframe) flow needs the token on the WS but cannot
  determine how the host would supply it — STOP and report; do not hardcode.
- `cleanConfig`/`validateServer` semantics differ from the excerpt such that the
  `command` check can't be placed where shown — STOP and report.

## Maintenance notes

- This is deliberately scoped to be safe by default (loopback no-op) and fail-safe
  (refuses unsafe binds). A full per-user auth scheme for multi-tenant hosted mode
  is a larger effort; the hosted deployment should additionally sit behind an
  authenticating proxy.
- Direction DIR-03 (embed CSP `frame-ancestors`) is complementary: it controls
  *who can frame* the app; this controls *who can call* it.
- A reviewer should verify the loopback bypass cannot be tricked (e.g. `HOST`
  being a hostname that resolves to a public IP — `isLoopbackHost` only treats the
  literal loopback strings as safe, which is the conservative choice).
