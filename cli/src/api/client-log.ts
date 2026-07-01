// Sink for webview-side failures. The UI runs inside Electrobun's webview, whose
// `console` and uncaught errors never reach the Bun process (and thus never hit
// the file logger). The client forwards `window.onerror` / `unhandledrejection`
// here so client-side crashes land in `~/.testeiya/testeiya.log` alongside the
// server logs.

export async function clientLog(req: Request): Promise<Response> {
  let body: ClientLogBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const kind = body.kind === "unhandledrejection" ? "unhandledrejection" : "error";
  const where = body.source ? ` (${body.source}:${body.line ?? "?"}:${body.column ?? "?"})` : "";
  const stack = body.stack ? `\n${body.stack}` : "";
  console.error(`[webview] ${kind}: ${body.message ?? "(no message)"}${where}${stack}`);
  return Response.json({ logged: true });
}

type ClientLogBody = {
  kind?: string;
  message?: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
};
