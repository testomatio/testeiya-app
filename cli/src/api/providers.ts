import { join } from "node:path";
import { HOME_DIR } from "../project-dir.js";
import { mkdirSync } from "node:fs";
import { AuthStorage, ModelRegistry } from "@oh-my-pi/pi-coding-agent";
import {
  getOAuthProviders,
  PROVIDER_DESCRIPTORS,
  DEFAULT_MODEL_PER_PROVIDER,
} from "@oh-my-pi/pi-ai";
import {
  loadConfig,
  saveProviderSelection,
  saveThinkingLevel,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "../config.js";

/**
 * Providers & Models API.
 *
 * The provider list is built **from the SDK's own registry** — never a curated
 * list in our code:
 *   - sign-in providers from `getOAuthProviders()` (support `AuthStorage.login`)
 *   - API-key providers from `PROVIDER_DESCRIPTORS`
 *   - default model per provider from `DEFAULT_MODEL_PER_PROVIDER`
 *   - the available models from live `ModelRegistry` discovery
 *
 * Secrets (api keys, OAuth tokens) are stored via `AuthStorage` and are NEVER
 * returned to the client — only status flags and model ids/names.
 */

function agentDir(): string {
  const dir = HOME_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function openAuthStorage(): Promise<AuthStorage> {
  const auth = await AuthStorage.create(join(agentDir(), "auth.json"));
  // `create()` does not populate in-memory state from disk — without this the
  // store only reflects env-var keys and never sees stored API keys / OAuth
  // credentials (so a signed-in subscription would look unconfigured).
  await auth.reload();
  return auth;
}

const defaultModelFor = (id: string): string | undefined =>
  (DEFAULT_MODEL_PER_PROVIDER as Record<string, string>)[id];

/** Title-case a provider id as a last-resort display name (e.g. "lm-studio" -> "Lm Studio"). */
function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface ProviderInfo {
  id: string;
  name: string;
  /** Supports an interactive sign-in via AuthStorage.login (subscription / OAuth). */
  canLogin: boolean;
  /** Accepts a pasted API key. */
  canKey: boolean;
  defaultModel: string | null;
  configured: boolean;
  loggedIn: boolean;
  group: "subscription" | "api";
}

/** Build the provider list purely from SDK data + auth status. */
function listProviders(auth: AuthStorage): ProviderInfo[] {
  const oauth = getOAuthProviders().filter((p) => p.available);
  const oauthIds = new Set(oauth.map((p) => String(p.id)));
  const oauthName = new Map(oauth.map((p) => [String(p.id), p.name]));

  const keyedIds = new Set(PROVIDER_DESCRIPTORS.map((d) => String(d.providerId)));
  const keyedLabel = new Map(
    PROVIDER_DESCRIPTORS.map((d) => [
      String(d.providerId),
      d.catalogDiscovery?.label,
    ]),
  );

  const ids = new Set<string>([...oauthIds, ...keyedIds]);
  const providers: ProviderInfo[] = [];
  for (const id of ids) {
    const canLogin = oauthIds.has(id);
    const canKey = keyedIds.has(id);
    const name = oauthName.get(id) || keyedLabel.get(id) || titleCase(id);
    providers.push({
      id,
      name,
      canLogin,
      canKey,
      defaultModel: defaultModelFor(id) ?? null,
      configured: auth.hasAuth(id),
      loggedIn: auth.hasOAuth(id),
      group: canLogin ? "subscription" : "api",
    });
  }
  providers.sort((a, b) => a.name.localeCompare(b.name));
  return providers;
}

/** Every provider id the SDK knows about (for validating select/login requests). */
function knownProviderIds(): Set<string> {
  const ids = new Set<string>();
  for (const p of getOAuthProviders()) ids.add(String(p.id));
  for (const d of PROVIDER_DESCRIPTORS) ids.add(String(d.providerId));
  for (const id of Object.keys(DEFAULT_MODEL_PER_PROVIDER)) ids.add(id);
  return ids;
}

// ---------------------------------------------------------------------------
// GET /api/providers
// ---------------------------------------------------------------------------
export async function providersGet(): Promise<Response> {
  const config = loadConfig();
  const auth = await openAuthStorage();
  return Response.json({
    current: { provider: config.provider.name, model: config.provider.model },
    providers: listProviders(auth),
    thinkingLevel: config.thinkingLevel,
    thinkingLevels: THINKING_LEVELS,
  });
}

// ---------------------------------------------------------------------------
// GET /api/providers/models?provider=<id>  — live discovery
// ---------------------------------------------------------------------------
export async function providersModels(request: Request): Promise<Response> {
  const provider = new URL(request.url).searchParams.get("provider")?.trim();
  if (!provider) {
    return Response.json({ error: "provider is required" }, { status: 400 });
  }
  const auth = await openAuthStorage();
  const registry = new ModelRegistry(auth);
  try {
    await registry.refreshProvider(provider, "online-if-uncached");
  } catch {
    // Discovery is best-effort — fall back to whatever is already loaded.
  }
  let models = registry.getAvailable().filter((m) => m.provider === provider);
  if (models.length === 0) {
    models = registry.getAll().filter((m) => m.provider === provider);
  }
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const m of models) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ id: m.id, name: m.name ?? m.id });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return Response.json({
    provider,
    default: defaultModelFor(provider) ?? null,
    models: out,
  });
}

// ---------------------------------------------------------------------------
// POST /api/providers/select  { provider, model? }
// ---------------------------------------------------------------------------
export async function providersSelect(request: Request): Promise<Response> {
  let body: { provider?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const provider = body.provider?.trim();
  if (!provider || !knownProviderIds().has(provider)) {
    return Response.json(
      { error: `unknown provider: ${provider ?? ""}` },
      { status: 400 },
    );
  }
  const model = body.model?.trim() || defaultModelFor(provider);
  if (!model) {
    return Response.json(
      { error: `no model specified and no default for ${provider}` },
      { status: 400 },
    );
  }
  saveProviderSelection({ provider, model });
  return Response.json({
    current: { provider, model },
    appliesOnRestart: true,
  });
}

// ---------------------------------------------------------------------------
// POST /api/providers/thinking  { thinkingLevel }
// ---------------------------------------------------------------------------
export async function providersThinking(request: Request): Promise<Response> {
  let body: { thinkingLevel?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const level = body.thinkingLevel?.trim();
  if (!level || !THINKING_LEVELS.includes(level as ThinkingLevel)) {
    return Response.json(
      { error: `invalid thinking level: ${level ?? ""}` },
      { status: 400 },
    );
  }
  saveThinkingLevel(level as ThinkingLevel);
  return Response.json({ thinkingLevel: level, appliesOnRestart: true });
}

// ---------------------------------------------------------------------------
// POST /api/providers/key  { provider, apiKey }
// ---------------------------------------------------------------------------
export async function providersKey(request: Request): Promise<Response> {
  let body: { provider?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const provider = body.provider?.trim();
  const apiKey = body.apiKey?.trim();
  if (!provider || !knownProviderIds().has(provider)) {
    return Response.json(
      { error: `unknown provider: ${provider ?? ""}` },
      { status: 400 },
    );
  }
  if (!apiKey) {
    return Response.json({ error: "apiKey is required" }, { status: 400 });
  }
  const auth = await openAuthStorage();
  await auth.set(provider, { type: "api_key", key: apiKey });
  return Response.json({ ok: true, provider, configured: true });
}

// ---------------------------------------------------------------------------
// POST /api/providers/logout  { provider }
// ---------------------------------------------------------------------------
export async function providersLogout(request: Request): Promise<Response> {
  let body: { provider?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const provider = body.provider?.trim();
  if (!provider) {
    return Response.json({ error: "provider is required" }, { status: 400 });
  }
  const auth = await openAuthStorage();
  await auth.remove(provider);
  loginSessions.delete(provider);
  return Response.json({ ok: true, provider });
}

// ---------------------------------------------------------------------------
// OAuth login bridge (subscriptions)
//
// `AuthStorage.login()` runs the entire flow server-side (it starts its own
// localhost callback server for Codex/Gemini, polls the device endpoint for
// Copilot). We kick it off, capture the auth URL via `onAuth`, return it to the
// client to open in a browser, and let the flow finish in the background. The
// client polls GET /api/providers/login/:provider for completion.
// ---------------------------------------------------------------------------
type LoginStatus = "pending" | "done" | "error";
interface LoginSession {
  status: LoginStatus;
  authUrl?: string;
  instructions?: string;
  progress?: string;
  error?: string;
  abort: AbortController;
  /** Fulfils the SDK's manual code/URL prompt (fallback when the localhost
   *  callback doesn't round-trip). */
  resolveCode?: (code: string) => void;
}

const loginSessions = new Map<string, LoginSession>();

async function openInBrowser(url: string): Promise<void> {
  // Only the desktop (Electrobun) runtime may import `electrobun/bun`; in web
  // mode that import boots a stray Electrobun server and throws an Updater
  // error, and the client opens the URL with window.open anyway.
  if (process.env.TESTEIYA_RUNTIME !== "desktop") return;
  try {
    const { Utils } = await import("electrobun/bun");
    Utils.openExternal(url);
  } catch (err) {
    console.warn(
      "[providers] openExternal failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function providersLogin(request: Request): Promise<Response> {
  let body: { provider?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const provider = body.provider?.trim();
  if (!provider) {
    return Response.json({ error: "provider is required" }, { status: 400 });
  }
  const canLogin = getOAuthProviders().some(
    (p) => p.available && String(p.id) === provider,
  );
  if (!canLogin) {
    return Response.json(
      { error: `${provider} does not support sign-in` },
      { status: 400 },
    );
  }

  const existing = loginSessions.get(provider);
  if (existing && existing.status === "pending") {
    return Response.json({
      provider,
      status: existing.status,
      authUrl: existing.authUrl ?? null,
      instructions: existing.instructions ?? null,
      error: null,
    });
  }

  const auth = await openAuthStorage();
  const abort = new AbortController();
  const session: LoginSession = { status: "pending", abort };
  loginSessions.set(provider, session);

  let resolveAuthReady!: () => void;
  const authReady = new Promise<void>((resolve) => {
    resolveAuthReady = resolve;
  });

  const ctrl = {
    onAuth: (info: { url: string; instructions?: string }) => {
      session.authUrl = info.url;
      session.instructions = info.instructions;
      console.log(`[providers] login ${provider}: auth url ready → ${info.url}`);
      resolveAuthReady();
      void openInBrowser(info.url);
    },
    onProgress: (message: string) => {
      session.progress = message;
      console.log(`[providers] login ${provider}: ${message}`);
    },
    // Resolve immediately so providers that prompt for optional input
    // (e.g. GitHub Copilot's enterprise domain) proceed with the default.
    onPrompt: async () => "",
    // Resolves only when the client posts a code/URL to .../login/:provider/code.
    // For Codex/Gemini the localhost callback server normally wins this race;
    // this is the fallback when the browser redirect can't reach the callback
    // server (e.g. a busy port). Stays pending until a code is submitted, so it
    // never busy-loops.
    onManualCodeInput: () =>
      new Promise<string>((resolve) => {
        session.resolveCode = resolve;
      }),
    signal: abort.signal,
  };

  void auth
    .login(provider, ctrl)
    .then(() => {
      session.status = "done";
      console.log(`[providers] login ${provider}: done`);
      resolveAuthReady();
    })
    .catch((err: unknown) => {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
      console.warn(`[providers] login ${provider}: failed — ${session.error}`);
      resolveAuthReady();
    });

  // Respond once we have the auth URL (or the flow already failed), but don't
  // block the request forever if a provider is slow to produce one.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 15000));
  await Promise.race([authReady, timeout]);

  return Response.json({
    provider,
    status: session.status,
    authUrl: session.authUrl ?? null,
    instructions: session.instructions ?? null,
    error: session.error ?? null,
  });
}

export function providersLoginStatus(provider: string): Response {
  const session = loginSessions.get(provider);
  if (!session) {
    return Response.json({ provider, status: "idle" });
  }
  return Response.json({
    provider,
    status: session.status,
    authUrl: session.authUrl ?? null,
    instructions: session.instructions ?? null,
    progress: session.progress ?? null,
    error: session.error ?? null,
  });
}

export function providersLoginCancel(provider: string): Response {
  const session = loginSessions.get(provider);
  if (session && session.status === "pending") {
    session.abort.abort();
    session.status = "error";
    session.error = "cancelled";
  }
  return Response.json({ ok: true, provider });
}

/**
 * Manual fallback: the user pastes the authorization code (or the full redirect
 * URL) when the localhost callback couldn't reach the SDK's callback server.
 */
export async function providersLoginCode(
  provider: string,
  request: Request
): Promise<Response> {
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const code = body.code?.trim();
  if (!code) {
    return Response.json({ error: "code is required" }, { status: 400 });
  }
  const session = loginSessions.get(provider);
  if (!session || session.status !== "pending" || !session.resolveCode) {
    return Response.json(
      { error: "no pending sign-in awaiting a code" },
      { status: 409 }
    );
  }
  console.log(`[providers] login ${provider}: received manual code`);
  session.resolveCode(code);
  return Response.json({ ok: true, provider });
}
