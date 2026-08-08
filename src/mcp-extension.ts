import { mcpConfig, seedMetadataCache, vendorBundle } from "./mcp.js";

/** The MCP adapter, configured from the environment, as a pi extension. */
export default async function mcpExtension(pi: unknown): Promise<void> {
  const config = mcpConfig();
  await seedMetadataCache(config);

  const { createMcpAdapter } = (await import(vendorBundle())) as {
    createMcpAdapter: (options: { config: unknown }) => (pi: unknown) => void | Promise<void>;
  };
  await createMcpAdapter({ config })(pi);
}
