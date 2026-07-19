"use client";

import { col, createTableSchema } from "@/lib/table-schema";
import { LabelsRow, MetaPill } from "@/components/widgets/status-pill";
import { resolveType, SuiteGlyph, TypeIcon } from "@/components/widgets/type-icons";
import type { FilterMap } from "../params";
import type { Option } from "../use-filter-options";

const PRIORITIES = ["low", "normal", "important", "high", "critical"] as const;
const STATES = ["manual", "automated"] as const;
const SYNC = ["sync", "unsync"] as const;

export function buildTestsSchema(opts: {
  labels: { title: string; slug: string }[];
  tags: string[];
  suites: Option[];
}) {
  const labelValues = opts.labels.map((l) => l.slug);
  const labelOptions = opts.labels.map((l) => ({ label: l.title, value: l.slug }));
  const suiteIds = opts.suites.map((s) => s.value);

  const tableSchema = createTableSchema({
    suite_title: col
      .string()
      .label("Suite")
      .notFilterable()
      .size(220)
      .display("custom", { cell: (_v, row) => <SuiteCell test={row as Test} /> }),
    title: col
      .string()
      .label("Test")
      .size(400)
      .display("custom", { cell: (_v, row) => <TestTitleCell test={row as Test} /> }),
    labels: col
      .array(col.enum(labelValues))
      .label("Labels")
      .size(220)
      .filterable("checkbox", { options: labelOptions })
      .display("custom", { cell: (_v, row) => <TagsCell test={row as Test} /> }),
    state: col
      .enum(STATES)
      .label("State")
      .size(120)
      .display("custom", { cell: (_v, row) => <StateCell test={row as Test} /> }),
    priority: col.enum(PRIORITIES).label("Priority").hidden(),
    sync_status: col.enum(SYNC).label("Sync").hidden(),
    suites: col
      .array(col.enum(suiteIds))
      .label("Suites")
      .hidden()
      .filterable("checkbox", { options: opts.suites }),
    tags: col
      .array(col.enum(opts.tags))
      .label("Tags")
      .hidden()
      .filterable("checkbox", {
        options: opts.tags.map((t) => ({ label: t, value: t })),
      }),
  });

  const filterMap: FilterMap = {
    title: { param: "search_text", kind: "search" },
    state: { param: "state", kind: "single" },
    priority: { param: "priority", kind: "single" },
    sync_status: { param: "sync_status", kind: "single" },
    suites: { param: "suites[]", kind: "array" },
    tags: { param: "tags[]", kind: "array" },
    labels: { param: "labels[]", kind: "array" },
  };

  return { tableSchema, filterMap, baseParams: {} };
}

function SuiteCell({ test }: { test: Test }) {
  const suite = test.suite_title ?? test.suite?.title ?? undefined;
  return (
    <div className="flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
      <SuiteGlyph className="size-4 shrink-0" />
      <span className="truncate" title={suite}>
        {suite ?? "—"}
      </span>
    </div>
  );
}

function TestTitleCell({ test }: { test: Test }) {
  const title = test.title ?? test.clean_title ?? test.id ?? "(untitled)";
  const kind = resolveType({ state: test.state });
  return (
    <div className="flex min-w-0 items-center gap-x-2 overflow-hidden">
      {test.emoji ? (
        <span
          className="flex h-6 w-5 shrink-0 items-center justify-center text-[15px] leading-none"
          aria-hidden
        >
          {test.emoji}
        </span>
      ) : kind ? (
        <TypeIcon type={kind} />
      ) : (
        <SuiteGlyph className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate font-medium" title={title}>
        {title}
      </span>
      {typeof test.steps_count === "number" && test.steps_count > 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {test.steps_count} step{test.steps_count === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

function TagsCell({ test }: { test: Test }) {
  return <LabelsRow labels={test.labels} tags={test.tags} />;
}

function StateCell({ test }: { test: Test }) {
  return (
    <div className="flex min-w-0 items-center gap-x-1 overflow-hidden">
      {test.priority && test.priority !== "normal" ? (
        <MetaPill>{test.priority}</MetaPill>
      ) : null}
      {test.state && test.state !== "manual" && test.state !== "automated" ? (
        <MetaPill>{test.state}</MetaPill>
      ) : null}
    </div>
  );
}

interface Test {
  id?: string;
  title?: string;
  clean_title?: string;
  emoji?: string | null;
  suite_title?: string;
  suite?: { title?: string };
  priority?: string;
  state?: string;
  labels?: unknown;
  tags?: unknown;
  steps_count?: number;
}
