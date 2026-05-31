"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { MdiIcon, RenderKindIcon } from "@/components/icons";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  mdiFileDocumentEditOutline,
  mdiFileTreeOutline,
  mdiPencilOutline,
} from "@mdi/js";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement, useState } from "react";
import dynamic from "next/dynamic";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({
  className,
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
  ...props
}: ToolProps) => {
  // We go "controlled" so that `defaultOpen` may change after mount (e.g.
  // when a tool call receives its output). Base UI's Collapsible ignores
  // `defaultOpen` after initial render and warns about it; binding `open`
  // explicitly silences the warning and lets us react to the flag flip.
  const [userOverride, setUserOverride] = useState<boolean | undefined>(
    undefined
  );
  const effectiveOpen =
    controlledOpen !== undefined
      ? controlledOpen
      : userOverride !== undefined
        ? userOverride
        : !!defaultOpen;

  return (
    <Collapsible
      className={cn("group not-prose mb-4 w-full rounded-md border", className)}
      open={effectiveOpen}
      onOpenChange={(v, details) => {
        setUserOverride(v);
        onOpenChange?.(v, details);
      }}
      {...props}
    />
  );
};

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
  "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title ?? derivedName}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
  toolName?: string;
};

const loadingFallback = (
  <div className="p-3 text-xs text-muted-foreground">Loading rich view…</div>
);

const RunsListRenderer = dynamic(
  () => import("@/components/agent-output/RunsListRenderer"),
  { ssr: false, loading: () => loadingFallback }
);
const TestsListRenderer = dynamic(
  () => import("@/components/agent-output/TestsListRenderer"),
  { ssr: false, loading: () => loadingFallback }
);
const SuitesListRenderer = dynamic(
  () => import("@/components/agent-output/SuitesListRenderer"),
  { ssr: false, loading: () => loadingFallback }
);
const PlansListRenderer = dynamic(
  () => import("@/components/agent-output/PlansListRenderer"),
  { ssr: false, loading: () => loadingFallback }
);
const TestRunsListRenderer = dynamic(
  () => import("@/components/agent-output/TestRunsListRenderer"),
  { ssr: false, loading: () => loadingFallback }
);
const TreeOutputRenderer = dynamic(
  () => import("@/components/agent-output/TreeOutputRenderer"),
  { ssr: false, loading: () => loadingFallback }
);
const ItemOutputRenderer = dynamic(
  () => import("@/components/agent-output/ItemOutputRenderer"),
  { ssr: false, loading: () => loadingFallback }
);
const FileEditRenderer = dynamic(
  () => import("@/components/agent-output/FileEditRenderer"),
  { ssr: false, loading: () => loadingFallback }
);

type RichRenderer = (payload: { data: unknown; summary?: string }) => ReactNode;

const KIND_RENDERERS: Record<string, RichRenderer> = {
  runs: ({ data, summary }) => (
    <RunsListRenderer json={data} summary={summary} />
  ),
  tests: ({ data, summary }) => (
    <TestsListRenderer json={data} summary={summary} />
  ),
  suites: ({ data, summary }) => (
    <SuitesListRenderer json={data} summary={summary} />
  ),
  plans: ({ data, summary }) => (
    <PlansListRenderer json={data} summary={summary} />
  ),
  testruns: ({ data, summary }) => (
    <TestRunsListRenderer json={data} summary={summary} />
  ),
};

// Maps MCP tool-name suffix → rich-view kind. Derived from the Testomat.io
// MCP server's list tools: `*_runs_list`, `*_tests_list`, etc.
const MCP_LIST_TO_KIND: Array<{ suffix: string; kind: string }> = [
  { suffix: "_testruns_list", kind: "testruns" }, // test before _runs_list
  { suffix: "_runs_list", kind: "runs" },
  { suffix: "_tests_list", kind: "tests" },
  { suffix: "_suites_list", kind: "suites" },
  { suffix: "_plans_list", kind: "plans" },
];

function mcpListKind(toolName?: string): string | null {
  if (!toolName) return null;
  const match = MCP_LIST_TO_KIND.find((m) => toolName.endsWith(m.suffix));
  return match?.kind ?? null;
}

/**
 * How should this tool's rich view be laid out in the chat?
 *  - `"below"`: keep the tool card visible, put the rich block below it
 *    (used for auto-rendered MCP `*_list` tool output)
 *  - `"inline"`: skip the tool card entirely, just show the rich block
 *    (used for explicit `render_*` tools + the agent's `write`/`edit`)
 *  - `null`: no rich view, render the normal tool card only
 */
export function richViewMode(
  toolName?: string
): "below" | "inline" | null {
  if (
    toolName === "render_list" ||
    toolName === "render_tree" ||
    toolName === "render_item" ||
    toolName === "write" ||
    toolName === "edit"
  ) {
    return "inline";
  }
  if (mcpListKind(toolName)) return "below";
  return null;
}

/** Legacy alias — returns true when any rich view applies. */
export function hasRichRenderer(toolName?: string): boolean {
  return richViewMode(toolName) !== null;
}

/** True for every `render_*` custom tool — used to drive auto-collapse. */
export function isRenderTool(toolName?: string): boolean {
  return (
    toolName === "render_list" ||
    toolName === "render_tree" ||
    toolName === "render_item"
  );
}

/** Header metadata derived from a `render_*` tool call. */
export interface RenderHeader {
  icon: ReactNode;
  title: string;
  tag?: string;
}

function deriveHeader(
  toolName: string,
  payload: { kind?: string; title?: string; path?: string }
): RenderHeader {
  if (toolName === "write" || toolName === "edit") {
    const file = payload.path ? payload.path.split("/").pop() ?? payload.path : "file";
    return {
      icon: (
        <MdiIcon
          path={toolName === "edit" ? mdiFileDocumentEditOutline : mdiPencilOutline}
        />
      ),
      title: `${toolName === "edit" ? "Edited" : "Wrote"}: ${file}`,
      tag: toolName,
    };
  }
  if (toolName === "render_tree") {
    return {
      icon: <MdiIcon path={mdiFileTreeOutline} />,
      title: payload.title ?? "Tree",
    };
  }
  if (toolName === "render_item") {
    const kind = payload.kind ?? "item";
    return {
      icon: <RenderKindIcon kind={kind} />,
      title: payload.title ?? `${kind.charAt(0).toUpperCase() + kind.slice(1)}`,
      tag: kind,
    };
  }
  // render_list
  const kind = payload.kind ?? "items";
  return {
    icon: <RenderKindIcon kind={kind} />,
    title: payload.title ?? `List: ${kind}`,
    tag: kind,
  };
}

/**
 * Result of rendering a rich-view tool: the raw body (already wrapped in
 * minimum needed styling) and a derived header so the caller can slot it
 * into a `<RenderFrame>` if desired.
 */
export interface RichRenderResult {
  body: ReactNode;
  header: RenderHeader;
}

export function renderRichTool(
  toolName: string | undefined,
  input: unknown,
  output: unknown
): RichRenderResult | null {
  if (!toolName) return null;

  // Agent's `write` / `edit` tool → FileEditRenderer with the path+content.
  if (toolName === "write" || toolName === "edit") {
    const payload =
      input && typeof input === "object"
        ? (input as { path?: string; content?: string })
        : null;
    if (!payload?.path) return null;
    return {
      body: <FileEditRenderer json={payload} />,
      header: deriveHeader(toolName, payload),
    };
  }

  // Every `render_*` custom tool: payload comes from `tool.input`
  // (arrives earlier than output), fallback to parsing output.
  if (isRenderTool(toolName)) {
    const fromInput =
      input && typeof input === "object"
        ? (input as { kind?: string; data?: unknown; summary?: string; title?: string; nodes?: unknown })
        : null;
    const fromOutput = !fromInput
      ? (parseMcpOutput(output) as
          | { kind?: string; data?: unknown; summary?: string; title?: string; nodes?: unknown }
          | null)
      : null;
    const payload = fromInput ?? fromOutput;
    if (!payload) return null;

    if (toolName === "render_tree") {
      if (payload.nodes === undefined) return null;
      return {
        body: <TreeOutputRenderer json={{ nodes: payload.nodes }} />,
        header: deriveHeader(toolName, payload),
      };
    }
    if (toolName === "render_item") {
      if (!payload.kind || payload.data === undefined) return null;
      return {
        body: (
          <ItemOutputRenderer
            json={{ kind: payload.kind, data: payload.data, summary: payload.summary }}
          />
        ),
        header: deriveHeader(toolName, payload),
      };
    }
    // render_list
    if (!payload.kind || payload.data === undefined) return null;
    const renderer = KIND_RENDERERS[payload.kind];
    if (!renderer) return null;
    return {
      body: renderer({ data: payload.data, summary: payload.summary }),
      header: deriveHeader(toolName, payload),
    };
  }

  // MCP `*_list` — auto-render output as the matching kind.
  const kind = mcpListKind(toolName);
  if (!kind) return null;
  const renderer = KIND_RENDERERS[kind];
  if (!renderer) return null;
  const parsed = parseMcpOutput(output);
  if (parsed === null || parsed === undefined) return null;
  return {
    body: renderer({ data: parsed }),
    header: deriveHeader("render_list", { kind }),
  };
}

function parseMcpOutput(raw: unknown): unknown | null {
  if (raw == null) return null;
  if (typeof raw === "object") {
    // MCP shape: { content: [{ type: 'text', text: '<json>' }], details: {...} }
    const obj = raw as { content?: Array<{ type?: string; text?: string }> };
    const first = obj.content?.find((c) => c?.type === "text")?.text;
    if (typeof first === "string") {
      try { return JSON.parse(first); } catch { /* fallthrough */ }
    }
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const first = (parsed as { content?: Array<{ type?: string; text?: string }> })
          .content?.find((c) => c?.type === "text")?.text;
        if (typeof first === "string") {
          try { return JSON.parse(first); } catch { return parsed; }
        }
      }
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export const ToolOutput = ({
  className,
  output,
  errorText,
  toolName,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output: ReactNode = <div>{output as ReactNode}</div>;

  // Rich renderer: the agent's `render_list` custom tool.
  // Tool input is { kind: 'runs' | 'tests' | ..., data: <payload>, summary? }.
  // Server-side it just echoes the input back as output, so either the input
  // OR the parsed output works — we prefer whatever is available.
  if (!errorText && toolName === "render_list") {
    const parsed = parseMcpOutput(output) as
      | { kind?: string; data?: unknown; summary?: string }
      | null;
    const kind = parsed?.kind;
    const renderer = kind ? KIND_RENDERERS[kind] : undefined;
    if (renderer && parsed?.data !== undefined) {
      return (
        <div className={cn("space-y-2", className)} {...props}>
          {parsed.summary && (
            <p className="text-sm text-muted-foreground">{parsed.summary}</p>
          )}
          <div className="overflow-x-auto rounded-md bg-muted/50 p-2 text-foreground">
            {renderer({ data: parsed.data, summary: parsed.summary })}
          </div>
        </div>
      );
    }
  }

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
