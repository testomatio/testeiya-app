import { test, expect, describe } from "bun:test";
import { transformEvent } from "../src/bridge.js";

const NOTICE =
  "\n\n[UI notice — not part of the data]\n" +
  "This list was just auto-rendered to the user as a rich interactive table in the chat UI.";

describe("transformEvent tool_execution_end", () => {
  test("strips the appended UI notice so the client output stays parseable JSON", () => {
    const data = JSON.stringify({ data: [{ id: "t1" }], meta: { total: 1 } });
    const msg = transformEvent(
      {
        type: "tool_execution_end",
        toolCallId: "call1",
        isError: false,
        result: {
          content: [
            { type: "text", text: data },
            { type: "text", text: NOTICE },
          ],
        },
      },
      "m1"
    );
    expect(msg?.output).toBe(data);
    expect(JSON.parse(msg?.output).meta.total).toBe(1);
  });

  test("keeps ordinary multi-part text results intact", () => {
    const msg = transformEvent(
      {
        type: "tool_execution_end",
        toolCallId: "call2",
        isError: false,
        result: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
      },
      "m1"
    );
    expect(msg?.output).toBe("a\nb");
  });
});
