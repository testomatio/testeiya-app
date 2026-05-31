/**
 * Normalize whatever data-shape the agent passes into `render_list` to
 * `{ items, meta }`. Accepts:
 *   - a raw array: [...]
 *   - `{ data: [...], meta: {...} }` (JSON-API style Testomat.io response)
 *   - the MCP stringified envelope `{ content: [{ type: 'text', text: '<json>' }] }`
 *   - JSON strings of any of the above
 *   - nested double-encoded JSON (model sometimes stringifies twice)
 */
export interface ExtractListResult<T = unknown> {
  items: T[];
  meta?: { total?: number };
}

export function extractList<T = unknown>(raw: unknown): ExtractListResult<T> {
  let current: unknown = raw;
  // Unwrap up to 3 levels of JSON stringification / MCP envelopes.
  for (let i = 0; i < 3; i++) {
    if (Array.isArray(current)) {
      return { items: current as T[] };
    }
    if (current && typeof current === "object") {
      const obj = current as {
        data?: unknown;
        meta?: { total?: number };
        content?: Array<{ type?: string; text?: string }>;
      };
      if (Array.isArray(obj.data)) {
        return { items: obj.data as T[], meta: obj.meta };
      }
      // MCP envelope: { content: [{ type: 'text', text: '<json>' }], details: ... }
      const nested = obj.content?.find((c) => c?.type === "text")?.text;
      if (typeof nested === "string") {
        try {
          current = JSON.parse(nested);
          continue;
        } catch {
          return { items: [] };
        }
      }
      // Object with data as string (double-encoded)
      if (typeof obj.data === "string") {
        try {
          current = JSON.parse(obj.data);
          continue;
        } catch {
          return { items: [] };
        }
      }
      return { items: [] };
    }
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return { items: [] };
      }
    }
    return { items: [] };
  }
  return { items: [] };
}
