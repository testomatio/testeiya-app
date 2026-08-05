import { Type } from "@oh-my-pi/omptype/typebox";
import vm from "node:vm";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import type { CachedList } from "./render-result.js";
import { widgetResult } from "./widget-result.js";

/**
 * `render_list` — display a list the agent assembled. Rows come from `data`,
 * or are derived server-side: `from` references cached `*_list`/`*_search`
 * results by call id and `transform` (a pure JS function source, run in a
 * vm sandbox) converts those arrays into the rows to render — so derived
 * lists never require re-emitting rows through the model.
 * For showing one fetched result as-is use `render_result`.
 */
export function createRenderListTool(cache: Map<string, CachedList>): ToolDefinition {
  return {
    name: "render_list",
    label: "Render List",
    loadMode: "essential",
    approval: "read",
    description:
      "Display a list as a rich table in the chat UI. Pass rows via `data`, " +
      "or derive them server-side: `from` = call ids of fetched *_list/*_search " +
      "results, `transform` = a pure JS function over those arrays returning " +
      "the rows to render (no need to re-type rows). For one result as-is, " +
      "use render_result.",
    parameters: Type.Object({
      kind: Type.Union(
        [
          Type.Literal("runs"),
          Type.Literal("tests"),
          Type.Literal("suites"),
          Type.Literal("plans"),
          Type.Literal("testruns"),
        ],
        { description: "What the rows are." }
      ),
      data: Type.Optional(
        Type.Union(
          [Type.Array(Type.Any()), Type.Object({}, { additionalProperties: true })],
          { description: "Explicit rows: `{data:[...], meta}` or a plain array." }
        )
      ),
      from: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description:
            "Call id(s) of fetched *_list/*_search results (from their UI " +
            "notices). Their row arrays become the transform's arguments, in order.",
        })
      ),
      transform: Type.Optional(
        Type.String({
          description:
            "Pure JS function source, e.g. \"(all, passed) => { const ok = new " +
            "Set(passed.map(t => t.id)); return all.map(t => ({...t, status: " +
            "ok.has(t.id) ? 'passed' : t.status})); }\". Receives one array per " +
            "`from` id (or the `data` array) and returns the rows to render. " +
            "Sandboxed: no imports, no IO, 1s limit.",
        })
      ),
      title: Type.Optional(
        Type.String({
          description: "Card header: what this list is and how it was derived.",
        })
      ),
      columns: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Row fields to show as columns, rendered in exactly this order " +
            "(e.g. ['title', 'status']). Priority is never a column — it " +
            "renders as an icon next to the title. Omit for the kind's defaults.",
        })
      ),
      summary: Type.Optional(
        Type.String({ description: "Optional caption above the table." })
      ),
    }),
    async execute(_toolCallId, params) {
      const p = params as RenderListParams;
      let inputs: Array<unknown[]>;
      try {
        inputs = resolveInputs(p, cache);
      } catch (err) {
        return errorText(err);
      }

      let rows: unknown[];
      if (p.transform) {
        try {
          rows = runTransform(p.transform, inputs);
        } catch (err) {
          return errorText(err, "transform failed: ");
        }
      } else if (inputs.length === 1) {
        rows = inputs[0];
      } else {
        return errorText(
          new Error("multiple `from` results need a `transform` to combine them")
        );
      }

      const payload: Record<string, unknown> = { ...p };
      delete payload.transform;
      delete payload.from;
      payload.data = { data: rows, meta: metaFor(p, rows) };
      console.log(
        `[render_list] kind=${p.kind} count=${rows.length} source=${p.data ? "data" : `from(${p.from})`}`
      );
      return widgetResult(
        `Rendered ${rows.length} ${p.kind} rows as a table.`,
        payload
      );
    },
  };
}

function resolveInputs(p: RenderListParams, cache: Map<string, CachedList>): Array<unknown[]> {
  if (p.data) {
    const rows = Array.isArray(p.data)
      ? p.data
      : (p.data as { data?: unknown[] }).data;
    if (!Array.isArray(rows)) throw new Error("`data` holds no row array");
    return [rows];
  }
  if (!p.from) throw new Error("pass `data`, or `from` call id(s) of fetched results");
  const ids = Array.isArray(p.from) ? p.from : [p.from];
  return ids.map((id) => {
    const entry = cache.get(id);
    if (!entry) {
      const known = [...cache.keys()].slice(-5).join(", ") || "none";
      throw new Error(`call_id "${id}" is not a cached list result (recent: ${known})`);
    }
    return entry.rows;
  });
}

function runTransform(src: string, inputs: Array<unknown[]>): unknown[] {
  const sandbox: { __inputs: Array<unknown[]>; __result?: unknown } = {
    __inputs: inputs,
  };
  vm.runInNewContext(`__result = (${src})(...__inputs)`, sandbox, { timeout: 1000 });
  const result = sandbox.__result;
  if (!Array.isArray(result)) {
    throw new Error("transform must return an array of rows");
  }
  return result;
}

function metaFor(p: RenderListParams, rows: unknown[]): { total: number } {
  if (p.data && !Array.isArray(p.data)) {
    const total = (p.data as { meta?: { total?: number } }).meta?.total;
    if (typeof total === "number") return { total };
  }
  return { total: rows.length };
}

function errorText(err: unknown, prefix = ""): { content: Array<{ type: "text"; text: string }> } {
  const reason = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `${prefix}${reason}` }],
  };
}

interface RenderListParams {
  kind: string;
  data?: unknown;
  from?: string | string[];
  transform?: string;
  title?: string;
  summary?: string;
  columns?: string[];
}
