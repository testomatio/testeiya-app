"use client";

import { col, createTableSchema } from "@/lib/table-schema";
import {
  LabelsRow,
  MetaPill,
  OverflowBadgeList,
  RunProgress,
  RunStatusDot,
  StatusTriplet,
} from "@/components/widgets/status-pill";
import { resolveType, TypeIcon } from "@/components/widgets/type-icons";
import type { FilterMap } from "../params";
import type { Option } from "../use-filter-options";

const RUN_STATUSES = [
  "passed",
  "failed",
  "running",
  "scheduled",
  "terminated",
] as const;

const RUN_KINDS = ["manual", "automated", "mixed"] as const;

export function buildRunsSchema(opts: {
  environments: string[];
  labels: { title: string; slug: string }[];
  rungroups: Option[];
}) {
  const labelSlugs = opts.labels.map((l) => l.slug);
  const labelOptions = opts.labels.map((l) => ({
    label: l.title,
    value: l.slug,
  }));
  const rungroupIds = opts.rungroups.map((r) => r.value);

  const tableSchema = createTableSchema({
    title: col
      .string()
      .label("Run")
      .icon("play_circle")
      .size(360)
      .tql("title")
      .display("custom", { cell: (_v, row) => <RunTitleCell run={row as Run} /> }),
    status: col
      .enum(RUN_STATUSES)
      .label("Status")
      .icon("check_circle")
      .defaultOpen()
      .size(160)
      .display("custom", { cell: (_v, row) => <RunStatusCell run={row as Run} /> }),
    env: col
      .array(col.enum(opts.environments))
      .label("Environment")
      .icon("cloud")
      .size(170)
      .filterable("checkbox", {
        options: opts.environments.map((e) => ({ label: e, value: e })),
      })
      .tql("env")
      .display("custom", { cell: (_v, row) => <RunEnvCell run={row as Run} /> }),
    rungroup_path: col
      .string()
      .label("Group")
      .notFilterable()
      .size(200)
      .display("custom", { cell: (_v, row) => <RungroupPathCell run={row as Run} /> }),
    kind: col.enum(RUN_KINDS).label("Kind").icon("category").hidden(),
    labels: col
      .array(col.enum(labelSlugs))
      .label("Labels")
      .icon("label")
      .hidden()
      .filterable("checkbox", { options: labelOptions })
      .tql("label"),
    group: col
      .enum(rungroupIds)
      .label("Rungroup")
      .icon("workspaces")
      .hidden()
      .filterable("checkbox", { options: opts.rungroups }),
    unfinished: col.boolean().label("Unfinished").icon("pending").hidden(),
    archived: col.boolean().label("Archived").icon("archive").hidden(),
    in_group: col.boolean().label("In group").icon("account_tree").hidden(),
    assigned_to: col.string().label("Assigned").notFilterable().hidden(),
  });

  const filterMap: FilterMap = {
    title: { param: "search", kind: "search" },
    status: { param: "filter[status]", kind: "csv" },
    env: { param: "filter[env]", kind: "csv" },
    kind: { param: "filter[kind]", kind: "csv" },
    labels: { param: "filter[labels][]", kind: "array" },
    group: { param: "groupId", kind: "single" },
    unfinished: { param: "filter[unfinished]", kind: "boolean" },
    archived: { param: "filter[archived]", kind: "boolean" },
    in_group: { param: "filter[in_group]", kind: "boolean" },
  };

  return { tableSchema, filterMap, baseParams: { with_rungroups: "true" } };
}

function RunTitleCell({ run }: { run: Run }) {
  const title = run.title ?? run.clean_title ?? run.id ?? "(untitled)";
  const kind = resolveType({ kind: run.kind, automated: run.automated });
  const branch =
    typeof run.branch === "string" ? run.branch : run.branch?.title ?? undefined;
  const total =
    run.tests_count ??
    (run.passed_count ?? 0) + (run.failed_count ?? 0) + (run.skipped_count ?? 0);
  return (
    <div className="flex min-w-0 items-center gap-x-2">
      <span className="flex size-5 shrink-0 items-center justify-center">
        <RunStatusDot status={run.status} title={run.status} />
      </span>
      <span className="flex size-5 shrink-0 items-center justify-center">
        {kind ? <TypeIcon type={kind} /> : null}
      </span>
      <span className="truncate font-medium" title={title}>
        {title}
      </span>
      {branch ? (
        <MetaPill title="branch" className="max-w-[120px] truncate">
          {branch}
        </MetaPill>
      ) : null}
      <LabelsRow labels={run.labels} className="min-w-0" />
      {total > 0 ? (
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
          {total} test{total === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

function RunStatusCell({ run }: { run: Run }) {
  const finished =
    run.finished_at != null || (run.status ?? "").toLowerCase() === "finished";
  if (finished) {
    return (
      <StatusTriplet
        passed={run.passed_count}
        failed={run.failed_count}
        skipped={(run.skipped_count ?? 0) + (run.pending_count ?? 0)}
      />
    );
  }
  return (
    <RunProgress
      percent={run.percent_marked ?? run.percent}
      automated={run.automated}
    />
  );
}

function RunEnvCell({ run }: { run: Run }) {
  const env = run.env ?? run.environment ?? undefined;
  if (!env) return null;
  return (
    <OverflowBadgeList
      items={env
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)}
    />
  );
}

function RungroupPathCell({ run }: { run: Run }) {
  const path = run.rungroup_path;
  if (!Array.isArray(path) || path.length === 0) return null;
  const text = path.map((p) => p.title).filter(Boolean).join(" / ");
  return (
    <span className="truncate text-xs text-muted-foreground" title={text}>
      {text}
    </span>
  );
}

interface Run {
  id?: string;
  title?: string;
  clean_title?: string;
  status?: string;
  kind?: string;
  environment?: string | null;
  env?: string | null;
  tests_count?: number;
  passed_count?: number;
  failed_count?: number;
  skipped_count?: number;
  pending_count?: number;
  finished_at?: string | null;
  assigned_to?: string | null;
  automated?: boolean;
  percent?: number;
  percent_marked?: number;
  branch?: { title?: string } | string | null;
  labels?: unknown;
  rungroup_path?: { id?: string; title?: string }[];
}
