import { mcpConfig, seedMetadataCache } from "./mcp.js";

// `pi-mcp-adapter` ships raw TypeScript and no compiled output, so it can only
// be loaded by pi's jiti-backed extension loader — which is what loads this
// file. The specifier goes through a variable on purpose: a static import would
// drag the adapter's own sources into this package's typecheck, where their
// `.ts` import paths are invalid.
const ADAPTER = "pi-mcp-adapter";

/** The MCP adapter, configured from the environment, as a pi extension. */
export default async function mcpExtension(pi: unknown): Promise<void> {
  const config = mcpConfig();
  await seedMetadataCache(config);

  const { createMcpAdapter } = (await import(ADAPTER)) as {
    createMcpAdapter: (options: { config: unknown }) => (pi: unknown) => void | Promise<void>;
  };
  await createMcpAdapter({ config })(pi);
}
