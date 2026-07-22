import { test, expect, describe } from "bun:test";
import { createWebUIExtension } from "../src/extensions/webui/index.js";

function makeExtension() {
  const tools = new Map<string, any>();
  let onToolResult: any = null;
  const pi = {
    registerTool: (t: any) => tools.set(t.name, t),
    on: (event: string, handler: any) => {
      if (event === "tool_result") onToolResult = handler;
    },
  };
  createWebUIExtension({} as never, {} as never)(pi as never);
  return { tools, onToolResult };
}

function listResultEvent(callId: string, rows: unknown[], total?: number) {
  return {
    toolName: "mcp_testomatio_x_tests_search",
    toolCallId: callId,
    isError: false,
    content: [
      {
        type: "text",
        text: JSON.stringify({ data: rows, meta: { total: total ?? rows.length } }),
      },
    ],
  };
}

const bigRows = Array.from({ length: 60 }, (_, i) => ({
  id: `t${i}`,
  title: `Test case number ${i} with a reasonably long title`,
  status: i % 3 === 0 ? "failed" : "passed",
  description: "x".repeat(500),
}));

describe("webui list-result middleware", () => {
  test("large results are replaced by a digest, rows cached", async () => {
    const { onToolResult } = makeExtension();
    const result = await onToolResult(listResultEvent("c1", bigRows, 120));
    const digest = JSON.parse(result.content[0].text);
    expect(digest.call_id).toBe("c1");
    expect(digest.kind).toBe("tests");
    expect(digest.total).toBe(120);
    expect(digest.returned).toBe(60);
    expect(digest.fields).toContain("status");
    expect(digest.omitted_fields).toContain("description");
    expect(digest.sample).toHaveLength(2);
    expect(digest.sample[0].description).toBeUndefined();
    const notice = result.content[1].text as string;
    expect(notice).toContain('render_result({call_id: "c1"');
    expect(notice).toContain('query_result({call_id: "c1"');
  });

  test("small results stay inline (no digest)", async () => {
    const { onToolResult } = makeExtension();
    const rows = [{ id: "a", status: "passed" }];
    const result = await onToolResult(listResultEvent("c2", rows));
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.call_id).toBeUndefined();
  });

  test("query_result computes over cached rows", async () => {
    const { tools, onToolResult } = makeExtension();
    await onToolResult(listResultEvent("c3", bigRows));
    const result = await tools
      .get("query_result")
      .execute("q1", { call_id: "c3", fn: "rows => rows.filter(r => r.status === 'failed').length" });
    expect(result.content[0].text).toBe("20");
  });

  test("query_result truncates oversized return values", async () => {
    const { tools, onToolResult } = makeExtension();
    await onToolResult(listResultEvent("c4", bigRows));
    const result = await tools
      .get("query_result")
      .execute("q2", { call_id: "c4", fn: "() => 'y'.repeat(20000)" });
    expect(result.content[0].text).toContain("more chars — narrow");
    expect((result.content[0].text as string).length).toBeLessThan(9000);
  });

  test("query_result reports unknown call ids", async () => {
    const { tools } = makeExtension();
    const result = await tools
      .get("query_result")
      .execute("q3", { call_id: "nope", fn: "rows => rows" });
    expect(result.content[0].text).toContain("not a cached list result");
  });

  test("query_result reports fn failures", async () => {
    const { tools, onToolResult } = makeExtension();
    await onToolResult(listResultEvent("c6", bigRows));
    const result = await tools
      .get("query_result")
      .execute("q4", { call_id: "c6", fn: "rows => nope.bad" });
    expect(result.content[0].text).toContain("fn failed");
  });

  test("render_result returns an ack and the payload via details.widget", async () => {
    const { tools, onToolResult } = makeExtension();
    await onToolResult(listResultEvent("c5", bigRows, 120));
    const result = await tools
      .get("render_result")
      .execute("r1", { call_id: "c5", title: "All tests" });
    expect(result.content[0].text).toContain("Rendered 60 tests rows");
    expect(result.details.widget.data.data).toHaveLength(60);
    expect(result.details.widget.data.meta.total).toBe(120);
  });
});
