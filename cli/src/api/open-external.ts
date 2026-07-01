// Open a URL in the user's real browser.
//
// In the desktop app the UI runs inside Electrobun's webview, where a plain
// `<a target="_blank">` / `window.open` does nothing — so the client posts the
// URL here and we hand it to Electrobun's native `Utils.openExternal`. When
// Electrobun isn't present (plain browser / `bun serve:app`) we report
// `opened: false` and the client falls back to `window.open`.

export async function openExternal(req: Request): Promise<Response> {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return Response.json(
      { error: "a valid http(s) url is required" },
      { status: 400 }
    );
  }

  // Only import electrobun in the desktop runtime; in web mode the import has
  // heavy side effects (boots an Electrobun server, fails an Updater), and the
  // client opens the URL itself when we report `opened: false`.
  if (process.env.TESTEIYA_RUNTIME !== "desktop") {
    return Response.json({ opened: false });
  }
  try {
    const { Utils } = await import("electrobun/bun");
    Utils.openExternal(url);
    return Response.json({ opened: true });
  } catch {
    // Electrobun not available — the client opens the URL itself.
    return Response.json({ opened: false });
  }
}
