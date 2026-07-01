import { getSession } from "../session-store.js";
import { resolveTestomatioTarget } from "./testomatio-proxy.js";
import { loggedServerFetch } from "../debug-bus.js";

/*
 * Upload a file as an attachment on a Testomat.io entity:
 *
 *   POST /api/testomatio/attachment?session=<sid>&testrun_id=<id>[&...]  (multipart "file")
 *
 * Upstream call: `${baseUrl}/api/{project_slug}/attachments?<context>` with the
 * file as multipart/form-data field `file` and `Authorization: Bearer <token>`.
 * The client-upload endpoint here backs the "from screen" / "upload image"
 * sources; the controlled-browser source reuses `uploadAttachmentToTestomatio`
 * after capturing the PNG server-side (see playwright-cli.ts).
 */

const ATTACH_CONTEXT_PARAMS = [
  "testrun_id",
  "test_id",
  "suite_id",
  "run_id",
  "requirement_id",
];

export async function testomatioAttachUpload(req: Request): Promise<Response> {
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

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "file required" }, { status: 400 });
  }
  const filename = file instanceof File ? file.name : "attachment.png";
  return uploadAttachmentToTestomatio(target, url.searchParams, file, filename);
}

export async function uploadAttachmentToTestomatio(
  target: { baseUrl: string; projectSlug: string; token: string },
  context: URLSearchParams,
  file: Blob,
  filename: string
): Promise<Response> {
  const upstream = new URL(
    `/api/${encodeURIComponent(target.projectSlug)}/attachments`,
    target.baseUrl
  );
  for (const key of ATTACH_CONTEXT_PARAMS) {
    const v = context.get(key);
    if (v) upstream.searchParams.set(key, v);
  }

  const body = new FormData();
  body.append("file", file, filename);

  const { res, text } = await loggedServerFetch(
    upstream.toString(),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${target.token}`, Accept: "application/json" },
      body,
    },
    `[multipart] ${filename}`
  );
  if (!res.ok) {
    return Response.json(
      { error: text || `attachment upload failed (HTTP ${res.status})` },
      { status: res.status }
    );
  }
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return Response.json({ ok: true, attachment: data });
}
