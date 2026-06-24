/**
 * Electrobun main-process entry (runs under Bun).
 *
 * It boots the unified Testeiya app-server (static UI + HTTP API + agent
 * WebSocket) on a free localhost port, then opens a native window pointed at
 * it. The whole app — UI, API and agent — lives behind that single origin.
 *
 * NOTE: This file is the desktop shell. It must be validated with a real
 * `electrobun dev` / `electrobun build` on a machine with a display; the
 * static-dir resolution and bundled-dependency layout below are best-effort
 * and may need adjustment once the real bundle layout is confirmed.
 */
import { BrowserWindow } from "electrobun/bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startAppServer } from "../../testeiya/src/app-server";
import { installApplicationMenu } from "./app-menu";

// Mark this process as the desktop (Electrobun) runtime. The app-server uses
// this to decide whether it may import `electrobun/bun` to open external URLs —
// in web/`bun src/app-server.ts` mode that import has heavy side effects
// (boots an Electrobun server, fails an Updater) and must be skipped.
process.env.TESTEIYA_RUNTIME = "desktop";

// support shortcut menu on macOS
installApplicationMenu("Testeiya");

/**
 * Locate the static Next export (`out/`) inside the bundle. `electrobun.config`
 * copies `out` into the app bundle; the exact runtime location depends on the
 * bundle layout, so we probe a few candidates and fall back to an env override.
 */
function resolveStaticDir(): string {
  const candidates = [
    process.env.TESTEIYA_STATIC_DIR,
    join(import.meta.dir, "out"),
    join(import.meta.dir, "../out"),
    join(import.meta.dir, "../../out"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  // Last resort — log so a packaging mismatch is obvious in the app logs.
  console.warn("[electrobun] could not locate static UI; tried:", candidates);
  return candidates[candidates.length - 1];
}

const server = startAppServer({ port: 0, staticDir: resolveStaticDir() });
const url = `http://127.0.0.1:${server.port}/`;
console.log(`[electrobun] app-server ready at ${url}`);

const win = new BrowserWindow({
  title: "Testeiya",
  url,
  frame: {
    width: 1280,
    height: 860,
    x: 0,
    y: 0,
  },
});

export { win };
