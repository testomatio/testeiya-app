"use client";

import { col, createTableSchema } from "@/lib/table-schema";
import {
  formatDuration,
  MetaPill,
  RunStatusDot,
} from "@/components/widgets/status-pill";
import { resolveType, TypeIcon } from "@/components/widgets/type-icons";
import type { FilterMap } from "../params";
import type { Option } from "../use-filter-options";

const TESTRUN_STATUSES = ["passed", "failed", "skipped", "pending"] as const;
const TESTRUN_KINDS = ["manual", "automated"] as const;
const PRIORITIES = ["low", "normal", "important", "high", "critical"] as const;
const DEFECTS = ["has_defects", "without_defects"] as const;

export function buildTestrunsSchema(opts: {
  environments: string[];
  labels: { title: string; slug: string }[];
  tags: string[];
  rungroups: Option[];
}) {
  const labelSlugs = opts.labels.map((l) => l.slug);
  const labelOptions = opts.labels.map((l) => ({ label: l.title, value: l.slug }));
  const rungroupIds = ["root", ...opts.rungroups.map((r) => r.value)];
  const rungroupOptions = [
    { label: "Ungrouped", value: "root" },
    ...opts.rungroups,
  ];

  const tableSchema = createTableSchema({
    title: col
      .string()
      .label("Test")
      .icon("science")
      .size(420)
      .display("custom", { cell: (_v, row) => <TestRunTitleCell tr={row as TestRun} /> }),
    status: col
      .enum(TESTRUN_STATUSES)
      .label("Status")
      .icon("check_circle")
      .defaultOpen()
      .size(140)
      .display("custom", { cell: (_v, row) => <TestRunStatusCell tr={row as TestRun} /> }),
    run_time: col
      .string()
      .label("Duration")
      .notFilterable()
      .size(110)
      .display("custom", { cell: (_v, row) => <DurationCell tr={row as TestRun} /> }),
    environment: col
      .string()
      .label("Env")
      .notFilterable()
      .size(140)
      .display("custom", { cell: (_v, row) => <EnvCell tr={row as TestRun} /> }),
    kind: col.enum(TESTRUN_KINDS).label("Kind").icon("category").hidden(),
    priority: col.enum(PRIORITIES).label("Priority").icon("flag").hidden(),
    defects: col.enum(DEFECTS).label("Defects").icon("bug_report").hidden(),
    envs: col
      .array(col.enum(opts.environments))
      .label("Environments")
      .icon("cloud")
      .hidden()
      .filterable("checkbox", {
        options: opts.environments.map((e) => ({ label: e, value: e })),
      }),
    labels: col
      .array(col.enum(labelSlugs))
      .label("Labels")
      .icon("label")
      .hidden()
      .filterable("checkbox", { options: labelOptions }),
    tags: col
      .array(col.enum(opts.tags))
      .label("Tags")
      .icon("sell")
      .hidden()
      .filterable("checkbox", {
        options: opts.tags.map((t) => ({ label: t, value: t })),
      }),
    rungroups: col
      .array(col.enum(rungroupIds))
      .label("Rungroups")
      .icon("workspaces")
      .hidden()
      .filterable("checkbox", { options: rungroupOptions }),
    message: col.boolean().label("Has message").icon("chat_bubble").hidden(),
    link: col.boolean().label("Has linked issue").icon("link").hidden(),
    finished_at: col.timestamp().label("Finished").icon("calendar_month").hidden(),
  });

  const filterMap: FilterMap = {
    title: { param: "filter[search]", kind: "search" },
    status: { param: "filter[status]", kind: "csv" },
    kind: { param: "filter[kind]", kind: "csv" },
    priority: { param: "filter[priority]", kind: "single" },
    defects: { param: "defects", kind: "single" },
    envs: { param: "envs", kind: "csv" },
    labels: { param: "labels", kind: "csv" },
    tags: { param: "tags", kind: "csv" },
    rungroups: { param: "rungroups", kind: "csv" },
    message: { param: "filter[message]", kind: "boolean" },
    link: { param: "filter[link]", kind: "boolean" },
    finished_at: { param: "filter[finished_at_date_range]", kind: "daterange" },
  };

  return { tableSchema, filterMap, baseParams: {} };
}

function TestRunTitleCell({ tr }: { tr: TestRun }) {
  const title =
    tr.test_title ?? tr.title ?? tr.test?.title ?? tr.id ?? "(untitled)";
  const kind = resolveType({ automated: tr.automated });
  return (
    <div className="flex min-w-0 flex-col justify-center">
      <div className="flex min-w-0 items-center gap-x-2">
        <span className="flex size-5 shrink-0 items-center justify-center">
          <RunStatusDot status={tr.status} title={tr.status} />
        </span>
        <span className="flex size-5 shrink-0 items-center justify-center">
          {kind ? <TypeIcon type={kind} /> : null}
        </span>
        <span className="truncate font-medium" title={String(title)}>
          {title}
        </span>
      </div>
      {tr.suite_title ? (
        <span className="truncate pl-14 text-xs text-muted-foreground">
          {tr.suite_title}
        </span>
      ) : null}
    </div>
  );
}

function TestRunStatusCell({ tr }: { tr: TestRun }) {
  return (
    <div className="flex min-w-0 items-center gap-x-1">
      <span className="text-xs capitalize text-muted-foreground">
        {tr.status ?? "—"}
      </span>
      {tr.substatus ? <MetaPill>{tr.substatus}</MetaPill> : null}
    </div>
  );
}

function DurationCell({ tr }: { tr: TestRun }) {
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {formatDuration(tr.run_time ?? tr.duration) ?? "—"}
    </span>
  );
}

function EnvCell({ tr }: { tr: TestRun }) {
  return (
    <span className="min-w-0 truncate text-xs text-muted-foreground">
      {tr.environment ?? tr.browser ?? "—"}
    </span>
  );
}

interface TestRun {
  id?: string;
  run_id?: string;
  test_id?: string;
  test_title?: string;
  title?: string;
  suite_title?: string;
  test?: { title?: string };
  status?: string;
  substatus?: string;
  run_time?: number;
  duration?: number;
  automated?: boolean;
  environment?: string | null;
  browser?: string | null;
}
