// Bundled at build time into dist/vendor/mcp.js.
//
// pi-mcp-adapter ships raw TypeScript and no compiled output, and Node refuses
// to strip types from files under node_modules — so it cannot be imported at
// runtime from an installed package. Bundling its own sources (dependencies
// stay external) makes it plain JavaScript we can import anywhere, keeps the
// version pinned by our lockfile, and needs no network at run time.
//
// Both files are referenced by relative path rather than by package specifier:
// the adapter's `exports` map does not expose metadata-cache, and the seed logic
// needs its hash function to agree with the adapter's own.
export { createMcpAdapter } from "../node_modules/pi-mcp-adapter/index.ts";
export { computeServerHash } from "../node_modules/pi-mcp-adapter/metadata-cache.ts";
