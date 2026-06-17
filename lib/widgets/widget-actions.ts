import type { WidgetDescriptor } from "@/lib/services/widget-service";

/**
 * The single source of truth for "what can be done to a widget".
 *
 * Each rendered widget has a `kind` (derived from its descriptor by
 * `widgetKindFor`). `WIDGET_DEFS[kind]` declares the actions the agent may
 * invoke through the one `ui_widget(widget_id, action, params)` tool — the same
 * actions the user's buttons trigger. When a widget is active, its id + this
 * definition is serialized into the `<active_widget>` block fed to the agent
 * (`serializeActiveWidget`), so the agent sees a clear menu of legal commands.
 */
export type WidgetParamType = "number" | "string" | "enum" | "boolean";

export interface WidgetParamDef {
  name: string;
  type: WidgetParamType;
  required?: boolean;
  values?: string[];
  description: string;
}

export interface WidgetActionDef {
  name: string;
  description: string;
  destructive?: boolean;
  params?: WidgetParamDef[];
}

export interface WidgetDef {
  kind: string;
  description: string;
  actions: WidgetActionDef[];
}

const LIST_ACTIONS: WidgetActionDef[] = [
  {
    name: "list",
    description:
      "Load a page of the list and/or filter it. The result returns the page's " +
      "items plus pagination meta (page, per_page, total). Walk pages by " +
      "incrementing `page` to read the whole list.",
    params: [
      { name: "page", type: "number", description: "1-based page number to load." },
      {
        name: "query",
        type: "string",
        description:
          "Optional Testomat.io query. Plain text searches; prefix with `=` for " +
          "TQL, e.g. `=status == 'failed'`.",
      },
    ],
  },
  {
    name: "open",
    description:
      "Open one item's detail view (the same as the user clicking a row). " +
      "Returns the opened item.",
    params: [{ name: "id", type: "string", required: true, description: "The item id to open." }],
  },
];

export const WIDGET_DEFS: Record<string, WidgetDef> = {
  "runs-list": {
    kind: "runs-list",
    description: "A list of test runs.",
    actions: LIST_ACTIONS,
  },
  "tests-list": {
    kind: "tests-list",
    description: "A list of test cases.",
    actions: LIST_ACTIONS,
  },
  "testruns-list": {
    kind: "testruns-list",
    description: "A list of individual test runs (per-test results).",
    actions: LIST_ACTIONS,
  },
  "plans-list": {
    kind: "plans-list",
    description: "A list of test plans.",
    actions: LIST_ACTIONS,
  },
  "suites-list": {
    kind: "suites-list",
    description: "A list of suites.",
    actions: LIST_ACTIONS,
  },
  "requirements-list": {
    kind: "requirements-list",
    description: "A list of requirements (issues).",
    actions: [
      LIST_ACTIONS[0],
      {
        name: "open",
        description: "Open a requirement's external link.",
        params: [{ name: "id", type: "string", required: true, description: "The requirement id." }],
      },
    ],
  },
  "run-item": {
    kind: "run-item",
    description: "A single run's details with its per-test results.",
    actions: [
      { name: "open_external", description: "Open this run in Testomat.io." },
      {
        name: "start_manual_run",
        description: "Start executing this manual run (opens the manual-run view).",
        destructive: true,
      },
      {
        name: "testruns",
        description:
          "Page through this run's per-test results. Returns the page's test runs + total.",
        params: [{ name: "page", type: "number", description: "1-based page of test results." }],
      },
    ],
  },
  "manual-run": {
    kind: "manual-run",
    description:
      "Manual test execution — step through the run's tests and record results.",
    actions: [
      {
        name: "list",
        description: "Page through the test list. Returns the page number.",
        params: [{ name: "page", type: "number", description: "1-based page number." }],
      },
      {
        name: "search",
        description: "Filter the test list by text.",
        params: [{ name: "query", type: "string", description: "Search text." }],
      },
      {
        name: "filter_status",
        description: "Show only tests in a status bucket (or all).",
        params: [
          {
            name: "status",
            type: "enum",
            required: true,
            values: ["passed", "failed", "skipped", "pending", "all"],
            description: "Bucket to filter by.",
          },
        ],
      },
      {
        name: "select_test",
        description:
          "Select a test to record, by id or 0-based row index on the current page. Returns the selected test.",
        params: [
          { name: "id", type: "string", description: "Test-run id." },
          { name: "index", type: "number", description: "0-based row index on the page." },
        ],
      },
      {
        name: "set_status",
        description: "Set the selected test's result as a draft (not saved yet).",
        params: [
          {
            name: "status",
            type: "enum",
            required: true,
            values: ["passed", "failed", "skipped"],
            description: "Result to record.",
          },
        ],
      },
      {
        name: "set_message",
        description: "Set a note on the selected test (draft).",
        params: [{ name: "text", type: "string", required: true, description: "Message." }],
      },
      {
        name: "save_next",
        description: "Save the selected test's result to Testomat.io and move to the next test.",
        destructive: true,
        params: [
          {
            name: "status",
            type: "enum",
            values: ["passed", "failed", "skipped"],
            description: "Optional result to set before saving.",
          },
        ],
      },
      {
        name: "finish_run",
        description: "Finish this manual run.",
        destructive: true,
      },
    ],
  },
};

export function widgetKindFor(descriptor: WidgetDescriptor | null): string | null {
  if (!descriptor) return null;
  if (descriptor.source === "resource") return `${descriptor.resource}-list`;
  if (descriptor.source === "file") return "file-edit";
  if (descriptor.source === "search") return null;
  const listKind = listKindForTool(descriptor.toolName, descriptor.input);
  if (listKind) return `${listKind}-list`;
  if (descriptor.toolName === "render_tree") return "tree";
  if (descriptor.toolName === "write" || descriptor.toolName === "edit") return "file-edit";
  if (descriptor.toolName === "render_item") {
    const kind = itemKind(descriptor.input);
    if (kind) return `${kind}-item`;
  }
  return null;
}

/** v2 REST resource backing a list kind, for live pagination via useTestomatio. */
export function widgetResourceForKind(kind: string | null): string | undefined {
  if (kind === "runs-list") return "runs";
  if (kind === "tests-list") return "tests";
  if (kind === "testruns-list") return "testruns";
  if (kind === "plans-list") return "plans";
  if (kind === "suites-list") return "suites";
  if (kind === "requirements-list") return "issues";
  return undefined;
}

/** Build the `<active_widget>` context block for the active widget (or null). */
export function serializeActiveWidget(
  descriptor: WidgetDescriptor | null,
  extra?: { title?: string; state?: string; kind?: string }
): string | null {
  const kind = extra?.kind ?? widgetKindFor(descriptor);
  if (!kind || !descriptor) return null;
  const def = WIDGET_DEFS[kind];
  if (!def) return null;

  const lines = [`id: ${descriptor.key}`, `kind: ${kind} — ${def.description}`];
  if (extra?.title) lines.push(`title: ${extra.title}`);
  if (extra?.state) lines.push(`state: ${extra.state}`);
  lines.push("actions:");
  for (const action of def.actions) {
    lines.push(`- ${formatAction(action)}`);
  }
  return `<active_widget>\n${lines.join("\n")}\n</active_widget>`;
}

function formatAction(action: WidgetActionDef): string {
  const sig = (action.params ?? [])
    .map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type}`)
    .join(", ");
  const flag = action.destructive ? " [destructive]" : "";
  return `${action.name}(${sig})${flag} — ${action.description}`;
}

function listKindForTool(toolName: string, input: unknown): string | null {
  const suffixes: Array<[string, string]> = [
    ["_testruns_list", "testruns"],
    ["_runs_list", "runs"],
    ["_tests_list", "tests"],
    ["_suites_list", "suites"],
    ["_plans_list", "plans"],
  ];
  const match = suffixes.find(([s]) => toolName.endsWith(s));
  if (match) return match[1];
  if (toolName === "render_list") {
    const kind = (input as { kind?: string })?.kind;
    if (kind && widgetResourceForKind(`${kind}-list`)) return kind;
  }
  return null;
}

function itemKind(input: unknown): string | null {
  const kind = (input as { kind?: string })?.kind;
  return kind ?? null;
}
