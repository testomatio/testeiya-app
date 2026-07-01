import { getSession } from "../session-store.js";
import { resolveTestomatioTarget } from "./testomatio-proxy.js";
import { loadStoredAuth } from "../testomatio-auth.js";
import { loggedServerFetch } from "../debug-bus.js";

/*
 * Speech-to-text for the chat voice input:
 *
 *   POST /api/testomatio/transcription?session=<sid>  (multipart "file" [+ "language"])
 *
 * Upstream call: `${baseUrl}/api/{project_slug}/transcriptions` with the audio as
 * multipart/form-data field `file` and `Authorization: Bearer <jwt>` (Groq Whisper).
 * Unlike the v2 proxy, this endpoint lives on the app API (`Api::ApiController`),
 * which authenticates the *user JWT* (`eyJ...`) — the per-project `tstmt_` token
 * is rejected here (403 Unauthorized). So we resolve the project slug + baseUrl
 * from the session but send the stored user JWT for auth.
 */

export async function testomatioTranscribe(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return Response.json({ error: "session required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  const target = resolveTestomatioTarget(session);
  if ("error" in target) {
    return Response.json({ error: target.error }, { status: 400 });
  }
  const auth = loadStoredAuth();
  if (!auth) {
    return Response.json(
      { error: "Sign in to Testomat.io to use voice input" },
      { status: 401 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "file required" }, { status: 400 });
  }
  const filename = file instanceof File ? file.name : "recording.webm";
  const language = form.get("language");

  const upstream = new URL(
    `/api/${encodeURIComponent(target.projectSlug)}/transcriptions`,
    target.baseUrl
  );

  const body = new FormData();
  body.append("file", file, filename);
  if (typeof language === "string" && language) body.append("language", language);

  const { res, text } = await loggedServerFetch(
    upstream.toString(),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
      body,
    },
    `[multipart] ${filename}`
  );
  if (!res.ok) {
    let error = text || `transcription failed (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) error = parsed.error;
    } catch {}
    return Response.json({ error }, { status: res.status });
  }
  let transcript = "";
  try {
    transcript = (JSON.parse(text) as { text?: string })?.text ?? "";
  } catch {
    transcript = "";
  }
  return Response.json({ text: transcript });
}
