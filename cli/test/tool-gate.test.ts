import { test, expect, describe } from "bun:test";
import { createToolGateExtension, type ToolGateRuntime, type ToolGateConfig } from "../src/extensions/tool-gate.js";

function mcpTool(server: string, name: string) {
  return {
    name: `mcp_${server.replace(/-/g, "_")}_${name}`,
    mcpToolName: name,
    mcpServerName: server,
  };
}

const NON_MCP = ["read", "bash", "render_result", "query_result", "ask_question"];

function makeGate(mcpTools: unknown[], config?: ToolGateConfig) {
  const runtime: ToolGateRuntime = {
    mcpManager: { getTools: () => mcpTools as never },
  };
  const tools = new Map<string, any>();
  let onBeforeAgentStart: any = null;
  let activeTools: string[] | null = null;
  const pi = {
    registerTool: (t: any) => tools.set(t.name, t),
    on: (event: string, handler: any) => {
      if (event === "before_agent_start") onBeforeAgentStart = handler;
    },
    getAllTools: () => [
      ...NON_MCP,
      "enable_tools",
      ...(mcpTools as Array<{ name: string }>).map((t) => t.name),
    ],
    setActiveTools: async (names: string[]) => {
      activeTools = names;
    },
  };
  createToolGateExtension(runtime, config)(pi as never);
  return {
    tools,
    start: (systemPrompt = "SYS") => onBeforeAgentStart({ type: "before_agent_start", prompt: "q", systemPrompt }),
    getActive: () => activeTools,
  };
}

const testomatTools = [
  mcpTool("testomatio-uat", "tests_list"),
  mcpTool("testomatio-uat", "tests_search"),
  mcpTool("testomatio-uat", "tests_get"),
  mcpTool("testomatio-uat", "tests_create"),
  mcpTool("testomatio-uat", "tests_issues_link"),
  mcpTool("testomatio-uat", "testruns_search"),
  mcpTool("testomatio-uat", "analytics_stats"),
  mcpTool("testomatio-uat", "system_ping"),
  mcpTool("testomatio-uat", "attachments_upload"),
];

describe("tool gate", () => {
  test("testomatio server keeps the curated read set active", async () => {
    const gate = makeGate(testomatTools);
    const result = await gate.start();
    const active = gate.getActive()!;
    expect(active).toContain("mcp_testomatio_uat_tests_search");
    expect(active).toContain("mcp_testomatio_uat_testruns_search");
    expect(active).toContain("mcp_testomatio_uat_analytics_stats");
    expect(active).toContain("mcp_testomatio_uat_system_ping");
    expect(active).not.toContain("mcp_testomatio_uat_tests_create");
    expect(active).not.toContain("mcp_testomatio_uat_tests_issues_link");
    expect(result.systemPrompt).toContain("<deferred_tools>");
    expect(result.systemPrompt).toContain("mcp_testomatio_uat_tests_create");
    expect(result.systemPrompt).toStartWith("SYS\n\n");
  });

  test("non-MCP tools always stay active", async () => {
    const gate = makeGate(testomatTools);
    await gate.start();
    for (const name of NON_MCP) expect(gate.getActive()!).toContain(name);
    expect(gate.getActive()!).toContain("enable_tools");
  });

  test("generic server: mutating verbs deferred, reads active", async () => {
    const gate = makeGate([
      mcpTool("jira", "search_issues"),
      mcpTool("jira", "get_issue"),
      mcpTool("jira", "create_issue"),
      mcpTool("jira", "transition_issue"),
      mcpTool("jira", "add_comment"),
    ]);
    const result = await gate.start();
    const active = gate.getActive()!;
    expect(active).toContain("mcp_jira_search_issues");
    expect(active).toContain("mcp_jira_get_issue");
    expect(active).not.toContain("mcp_jira_create_issue");
    expect(active).not.toContain("mcp_jira_transition_issue");
    expect(active).not.toContain("mcp_jira_add_comment");
    expect(result.systemPrompt).toContain("jira: mcp_jira_add_comment");
  });

  test("generic server: budget caps active reads, prioritizing search/list/get", async () => {
    const many = Array.from({ length: 25 }, (_, i) => mcpTool("wiki", `topic_${i}_info`));
    const gate = makeGate([mcpTool("wiki", "search_pages"), mcpTool("wiki", "list_spaces"), ...many]);
    await gate.start();
    const active = gate.getActive()!.filter((n: string) => n.startsWith("mcp_wiki"));
    expect(active).toHaveLength(15);
    expect(active).toContain("mcp_wiki_search_pages");
    expect(active).toContain("mcp_wiki_list_spaces");
  });

  test("config globs override heuristics for that server", async () => {
    const gate = makeGate(
      [
        mcpTool("jira", "search_issues"),
        mcpTool("jira", "create_issue"),
        mcpTool("jira", "get_issue"),
      ],
      { activeTools: { jira: ["create_*", "search_*"] } }
    );
    await gate.start();
    const active = gate.getActive()!;
    expect(active).toContain("mcp_jira_create_issue");
    expect(active).toContain("mcp_jira_search_issues");
    expect(active).not.toContain("mcp_jira_get_issue");
  });

  test("enable_tools activates a deferred tool for the session", async () => {
    const gate = makeGate(testomatTools);
    await gate.start();
    const result = await gate.tools
      .get("enable_tools")
      .execute("t1", { tools: ["mcp_testomatio_uat_tests_create"] });
    expect(result.content[0].text).toContain("Enabled: mcp_testomatio_uat_tests_create");
    expect(gate.getActive()!).toContain("mcp_testomatio_uat_tests_create");
    const next = await gate.start();
    expect(gate.getActive()!).toContain("mcp_testomatio_uat_tests_create");
    expect(next.systemPrompt).toContain("mcp_testomatio_uat_tests_create");
  });

  test("enable_tools rejects unknown names", async () => {
    const gate = makeGate(testomatTools);
    await gate.start();
    const result = await gate.tools.get("enable_tools").execute("t1", { tools: ["nope"] });
    expect(result.content[0].text).toContain("Unknown tool(s): nope");
  });

  test("deferred block is byte-stable across turns", async () => {
    const gate = makeGate(testomatTools);
    const first = await gate.start();
    const second = await gate.start();
    expect(second.systemPrompt).toBe(first.systemPrompt);
  });

  test("no MCP tools → prompt untouched, no setActiveTools call", async () => {
    const gate = makeGate([]);
    const result = await gate.start();
    expect(result).toBeUndefined();
    expect(gate.getActive()).toBeNull();
  });
});
