// Pure Testomat.io URL helpers (no React, no state) shared by the project
// service and any view that needs a sign-in link / external open.

export const DEFAULT_BASE_URL = "https://app.testomat.io";

/** Normalize a (possibly schemeless) base URL the same way the server does. */
export function normalizeBaseUrl(raw: string): string {
  let url = (raw || "").trim();
  if (!url) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

/** Browser URL the user opens to mint an app JWT, derived from the base URL. */
export function buildSignInUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/app-auth?app_name=Testeiya`;
}

/**
 * Open `url` in the user's real browser. In the Electrobun desktop webview a
 * plain anchor does nothing, so we ask the server (native `openExternal`); in a
 * plain browser the server reports `opened: false` and we use `window.open`.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const res = await fetch("/api/open-external", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => null);
    if (data?.opened) return;
  } catch {
    /* fall through to the browser path */
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
