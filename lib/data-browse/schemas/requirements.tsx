"use client";

import { col, createTableSchema } from "@/lib/table-schema";
import { ClipboardCheckIcon, ExternalLinkIcon } from "@/lib/icons";
import { LabelsRow, MetaPill } from "@/components/widgets/status-pill";
import type { FilterMap } from "../params";

const SOURCES = [
  "jira",
  "github",
  "linear",
  "link",
  "confluence",
  "file",
  "text",
] as const;

export function buildRequirementsSchema() {
  const tableSchema = createTableSchema({
    title: col
      .string()
      .label("Requirement")
      .icon("rule")
      .size(440)
      .display("custom", { cell: (_v, row) => <RequirementCell req={row as Req} /> }),
    status: col
      .string()
      .label("Status")
      .notFilterable()
      .size(140)
      .display("custom", { cell: (_v, row) => <StatusCell req={row as Req} /> }),
    tests: col
      .string()
      .label("Tests")
      .notFilterable()
      .size(120)
      .display("custom", { cell: (_v, row) => <TestsCell req={row as Req} /> }),
    source: col.enum(SOURCES).label("Source").icon("hub").hidden(),
  });

  const filterMap: FilterMap = {
    title: { param: "search_text", kind: "search" },
    source: { param: "source", kind: "single" },
  };

  return { tableSchema, filterMap, baseParams: {} };
}

function RequirementCell({ req }: { req: Req }) {
  const key = pick(req.jira_key, req.key, req.jira_id, req.identifier);
  const title =
    pick(req.title, req.summary, req.name, key, req.url) ??
    (req.id != null ? String(req.id) : "(untitled)");
  return (
    <div className="flex min-w-0 items-center gap-x-2">
      <ClipboardCheckIcon className="size-4 shrink-0 text-muted-foreground" />
      {key ? (
        <MetaPill className="font-mono" title={req.source ?? "issue"}>
          {key}
        </MetaPill>
      ) : null}
      <span className="truncate font-medium" title={title}>
        {title}
      </span>
      <LabelsRow labels={req.labels} className="min-w-0" />
    </div>
  );
}

function StatusCell({ req }: { req: Req }) {
  const status = pick(req.status, req.state);
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  return <MetaPill className="capitalize">{status}</MetaPill>;
}

function TestsCell({ req }: { req: Req }) {
  const count =
    pick(req.tests_count, req.linked_tests_count) ??
    (Array.isArray(req.tests) ? req.tests.length : undefined);
  const url = pick(req.url, req.link);
  return (
    <div className="flex items-center gap-x-1.5 text-xs tabular-nums text-muted-foreground">
      <span>{count ?? "—"}</span>
      {url ? <ExternalLinkIcon className="size-3 shrink-0 opacity-60" /> : null}
    </div>
  );
}

function pick<T>(...values: (T | null | undefined)[]): T | undefined {
  for (const value of values) {
    if (value != null && value !== "") return value;
  }
  return undefined;
}

interface Req {
  id?: string | number;
  title?: string;
  name?: string;
  summary?: string;
  url?: string;
  link?: string;
  jira_id?: string;
  jira_key?: string;
  key?: string;
  identifier?: string;
  source?: string;
  status?: string;
  state?: string;
  tests_count?: number;
  linked_tests_count?: number;
  tests?: unknown[];
  labels?: unknown;
}
