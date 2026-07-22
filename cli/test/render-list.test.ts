import { test, expect, describe } from "bun:test";
import { createRenderListTool } from "../src/extensions/webui/tools/render-list.js";
import type { CachedList } from "../src/extensions/webui/tools/render-result.js";

const cache = new Map<string, CachedList>([
  [
    "call_all",
    {
      kind: "tests",
      rows: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }],
      total: 3,
    },
  ],
  ["call_passed", { kind: "tests", rows: [{ id: "b", title: "B" }], total: 1 }],
]);

const tool = createRenderListTool(cache);

async function run(params: Record<string, unknown>) {
  return tool.execute("t1", params as never, undefined as never, undefined as never, undefined as never);
}

describe("render_list from+transform", () => {
  test("derives rows from cached results without re-emission", async () => {
    const result = await run({
      kind: "tests",
      from: ["call_all", "call_passed"],
      transform:
        "(all, passed) => { const ok = new Set(passed.map(t => t.id)); " +
        "return all.map(t => ({...t, status: ok.has(t.id) ? 'passed' : undefined})); }",
      title: "All with statuses",
    });
    const payload = (result as any).details.widget;
    expect(payload.data.data).toHaveLength(3);
    expect(payload.data.data[1].status).toBe("passed");
    expect(payload.data.data[0].status).toBeUndefined();
    expect(payload.transform).toBeUndefined();
  });

  test("model-facing content is a short ack, not the rows", async () => {
    const result = await run({ kind: "tests", from: "call_all" });
    const text = (result as any).content[0].text as string;
    expect(text).toContain("Rendered 3 tests rows");
    expect(text).not.toContain('"id"');
  });

  test("single from without transform passes rows through", async () => {
    const result = await run({ kind: "tests", from: "call_passed" });
    const payload = (result as any).details.widget;
    expect(payload.data.data).toHaveLength(1);
    expect(payload.data.meta.total).toBe(1);
  });

  test("unknown call id returns an instructive error", async () => {
    const result = await run({ kind: "tests", from: "nope" });
    expect((result as any).content[0].text).toContain('"nope" is not a cached list result');
    expect((result as any).details).toBeUndefined();
  });

  test("throwing transform returns the failure, not a crash", async () => {
    const result = await run({
      kind: "tests",
      from: "call_all",
      transform: "() => { throw new Error('boom'); }",
    });
    const text = (result as any).content[0].text as string;
    expect(text).toContain("transform failed");
    expect(text).toContain("boom");
  });

  test("transform must return an array", async () => {
    const result = await run({
      kind: "tests",
      from: "call_all",
      transform: "() => 42",
    });
    expect((result as any).content[0].text).toContain("must return an array");
  });
});
