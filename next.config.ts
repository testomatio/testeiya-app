import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Two build modes:
//   • Desktop/static (`NEXT_EXPORT=1 next build`) — emits a static `out/` that the
//     Bun app-server serves. API routes live in the Bun server, not Next.
//   • Web dev (`next dev`) — Next serves the UI with hot reload and *proxies*
//     `/api/*` to the Bun agent server so you don't rebuild the desktop bundle
//     to iterate. (Rewrites + headers aren't allowed with `output: "export"`,
//     so they're only added in dev.)
const isExport = process.env.NEXT_EXPORT === "1";
const agentServer = process.env.AGENT_SERVER_URL || "http://localhost:3210";

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export" as const } : {}),
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: path.dirname(projectRoot),
  },
  ...(isExport
    ? {}
    : {
        async rewrites() {
          // Dev only: forward API calls to the Bun agent server. (WebSocket
          // upgrades can't be rewritten — the client connects to the agent
          // server directly via NEXT_PUBLIC_TESTEIYA_WS_URL in dev.)
          return [
            { source: "/api/:path*", destination: `${agentServer}/api/:path*` },
          ];
        },
      }),
};

export default nextConfig;
