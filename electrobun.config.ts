/**
 * Electrobun build configuration for the Testeiya desktop app.
 *
 * The app is a single Bun main process (src/bun/index.ts) that serves the
 * statically-exported Next UI + HTTP API + agent WebSocket and opens a native
 * window pointed at it. There are no Electrobun-managed `views` because the UI
 * is served over http by our own Bun server rather than via the `views://`
 * scheme.
 *
 * Build order (see package.json scripts):
 *   1. `next build`  → produces `out/` (static UI)
 *   2. `electrobun build` → bundles src/bun/index.ts + copies `out/` and the
 *      agent runtime dependencies, then packages per-platform artifacts.
 *
 * REMAINING VALIDATION (must be done on a real machine, cannot run here):
 *   - Confirm the runtime location of the copied `out/` dir matches
 *     resolveStaticDir() in src/bun/index.ts.
 *   - Confirm the agent's dynamic deps are present in the bundle:
 *       • cli/skills          (prebuilt skills vendored from GitHub, read as files)
 *       • @testomatio/mcp     (spawned as a subprocess per project)
 *       • check-tests         (required dynamically by api/agent-start)
 *     Bun.build statically bundles *imported* JS, but these are loaded via
 *     dynamic require()/readFile/subprocess, so the package files must be
 *     copied into the bundle (the copy map below) and resolvable at runtime.
 *   - Confirm MCP subprocess launch works inside the packaged app (the mcp.json
 *     command uses process.execPath = bundled Bun + the mcp bin path).
 */

import pkg from "./package.json";

const config = {
  app: {
    name: "Testeiya",
    identifier: "io.testomat.testeiya",
    version: pkg.version,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      // `build.bun` accepts Bun.build() options. The agent SDK's transitive tree
      // includes packages that can't be statically bundled (e.g. `mupdf` uses a
      // top-level await inside a require()). Keep the heavy/native agent deps
      // EXTERNAL and ship them via the copy map below so they resolve from the
      // bundled node_modules at runtime instead of being inlined.
      // NOTE: this external list is a starting point — validate/extend it by
      // running `electrobun build` on a real machine until the bundle succeeds.
      external: [
        "@oh-my-pi/pi-coding-agent",
        "@oh-my-pi/pi-ai",
        "@testomatio/mcp",
        "check-tests",
        "markit-ai",
        "mupdf",
        "ws",
      ],
    },
    // No webview entrypoints — the UI is served over http by our Bun server.
    views: {},
    // Copy assets and the agent runtime into the bundle.
    // Paths are <source on disk> : <destination in bundle>.
    copy: {
      out: "out",
      // The prebuilt skills vendored by `bunosh vendor:skills` (loaded at
      // runtime as files by loadBundledSkills) + the manifest the skills API
      // reads for category names. resolveBundledSkillsDir()/resolveSkillsManifestPath()
      // probe for these next to the bundled entry.
      "cli/skills": "skills",
      "cli/skills.yaml": "skills.yaml",
      // The vendored models catalog produced by `bunosh collect:models`;
      // resolveModelsCatalogPath() probes for it next to the bundled entry.
      "cli/models.catalog.json": "models.catalog.json",
      // Ship the cli package's full node_modules so the externalized imports
      // above resolve, and so the agent's dynamic require()/readFile/subprocess
      // loads (@testomatio/mcp bin, check-tests, @playwright/cli skill) find
      // their packages at runtime.
      "cli/node_modules": "node_modules",
      // @oh-my-pi/pi-natives is bundled INTO index.js (not externalized), so its
      // loader resolves the prebuilt addon at import.meta.dir/../native i.e.
      // Resources/app/native/. Ship the .node files there so the loader finds them.
      "cli/node_modules/@oh-my-pi/pi-natives/native": "native",
    },
    mac: {
      // Enable once Apple Developer ID + notarization credentials are wired up.
      codesign: false,
      notarize: false,
      // .iconset folder converted to AppIcon.icns via iconutil during the build.
      icons: "assets/icon.iconset",
    },
    win: {
      icon: "assets/icon.ico",
    },
    linux: {
      icon: "assets/icon.png",
    },
  },
  release: {
    // CI builds are standalone; never fetch a previous version to diff against.
    generatePatch: false,
  },
};

export default config;
