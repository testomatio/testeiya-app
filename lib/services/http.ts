// Tiny fetch helpers shared by the client services. Always same-origin; throw a
// useful Error on non-2xx, surfacing the server's `{ error }` message when
// present. Every call is recorded to the Debug panel via `logApiRequest`.

import { logApiRequest } from "@/lib/debug/external-log";

export async function getJson<T>(url: string): Promise<T> {
  return request<T>("GET", url);
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  return request<T>("POST", url, body);
}

export async function del<T>(url: string): Promise<T> {
  return request<T>("DELETE", url);
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const requestBody = body === undefined ? null : JSON.stringify(body);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: requestBody === null ? undefined : { "Content-Type": "application/json" },
      body: requestBody ?? undefined,
    });
  } catch (e) {
    logApiRequest({
      method,
      url,
      requestBody,
      status: null,
      ok: false,
      responseBody: null,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    });
    throw e;
  }
  const text = await res.text();
  logApiRequest({
    method,
    url,
    requestBody,
    status: res.status,
    ok: res.ok,
    responseBody: text,
    error: null,
    durationMs: Date.now() - started,
  });
  if (!res.ok) return parseError(text, res.status);
  return JSON.parse(text) as T;
}

function parseError(text: string, status: number): never {
  let message = `Request failed (HTTP ${status})`;
  try {
    const body = JSON.parse(text);
    if (body?.error) message = body.error;
  } catch {
    /* keep the generic message */
  }
  throw new Error(message);
}
