import { Type } from "@sinclair/typebox";
import vm from "node:vm";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import type { CachedList } from "./render-result.js";

const MAX_RESULT = 8000;

/**
 * `query_result` — compute over cached `*_list`/`*_search` results without
 * pulling their rows into model context. The model writes a JS function
 * (guided by the digest's `fields`/`sample`) that receives one row array per
 * referenced call id; only its return value comes back as the tool result.
 */
export function createQueryResultTool(cache: Map<string, CachedList>): ToolDefinition {
  return {
    name: "query_result",
    label: "Query Result",
    description:
      "Compute over previously fetched *_list/*_search results — counts, " +
      "filters, grouping, joins — without re-reading their rows. `fn` is a " +
      "pure JS function receiving one row array per `call_id`; its return " +
      "value is the tool result. Use the digest's `fields`/`sample` to " +
      "write it. To show rows to the user use render_result/render_list.",
    parameters: Type.Object({
      call_id: Type.Union([Type.String(), Type.Array(Type.String())], {
        description:
          "Call id(s) of cached *_list/*_search results (from their UI notices).",
      }),
      fn: Type.String({
        description:
          "Pure JS function source, e.g. \"rows => rows.filter(r => " +
          "r.status === 'passed').length\", or \"(all, failed) => …\" for " +
          "several call ids. Sandboxed: no imports, no IO, 1s limit.",
      }),
    }),
    async execute(_toolCallId, params) {
      const p = params as { call_id: string | string[]; fn: string };
      const ids = Array.isArray(p.call_id) ? p.call_id : [p.call_id];
      const inputs: Array<unknown[]> = [];
      for (const id of ids) {
        const entry = cache.get(id);
        if (!entry) {
          const known = [...cache.keys()].slice(-5).join(", ") || "none";
          return textResult(
            `call_id "${id}" is not a cached list result (recent: ${known}).`
          );
        }
        inputs.push(entry.rows);
      }

      let result: unknown;
      try {
        const sandbox: { __inputs: Array<unknown[]>; __result?: unknown } = {
          __inputs: inputs,
        };
        vm.runInNewContext(`__result = (${p.fn})(...__inputs)`, sandbox, {
          timeout: 1000,
        });
        result = sandbox.__result;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return textResult(`fn failed: ${reason}`);
      }

      let json = JSON.stringify(result) ?? "undefined";
      if (json.length > MAX_RESULT) {
        json =
          json.slice(0, MAX_RESULT) +
          `… (+${json.length - MAX_RESULT} more chars — narrow the fn's return value)`;
      }
      console.log(`[query_result] calls=${ids.join(",")} → ${json.length} chars`);
      return textResult(json);
    },
  };
}

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}
