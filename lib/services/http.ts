// Tiny fetch helpers shared by the client services. Always same-origin; throw a
// useful Error on non-2xx, surfacing the server's `{ error }` message when present.

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (HTTP ${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* keep the generic message */
  }
  throw new Error(message);
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<T>;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<T>;
}

export async function del<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<T>;
}
