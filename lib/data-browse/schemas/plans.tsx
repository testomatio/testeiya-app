"use client";

import { col, createTableSchema } from "@/lib/table-schema";
import { ClipboardListIcon } from "@/lib/icons";
import { LabelsRow, MetaPill } from "@/components/widgets/status-pill";
import { resolveType, TypeIcon } from "@/components/widgets/type-icons";
import type { FilterMap } from "../params";

const PLAN_KINDS = ["manual", "automated", "mixed"] as const;

export function buildPlansSchema(opts: {
  labels: { title: string; slug: string }[];
}) {
  const labelSlugs = opts.labels.map((l) => l.slug);
  const labelOptions = opts.labels.map((l) => ({ label: l.title, value: l.slug }));

  const tableSchema = createTableSchema({
    title: col
      .string()
      .label("Plan")
      .size(420)
      .display("custom", { cell: (_v, row) => <PlanTitleCell plan={row as Plan} /> }),
    labels: col
      .array(col.enum(labelSlugs))
      .label("Labels")
      .size(220)
      .filterable("checkbox", { options: labelOptions })
      .display("custom", { cell: (_v, row) => <LabelsRow labels={(row as Plan).labels} /> }),
    counts: col
      .string()
      .label("Counts")
      .notFilterable()
      .size(200)
      .display("custom", { cell: (_v, row) => <CountsCell plan={row as Plan} /> }),
    kind: col.enum(PLAN_KINDS).label("Kind").hidden(),
    hidden: col.boolean().label("Hidden").hidden(),
  });

  const filterMap: FilterMap = {
    title: { param: "search_text", kind: "search" },
    labels: { param: "labels[]", kind: "array" },
    kind: { param: "kind", kind: "single" },
    hidden: { param: "hidden", kind: "boolean" },
  };

  return { tableSchema, filterMap, baseParams: {} };
}

function PlanTitleCell({ plan }: { plan: Plan }) {
  const title = plan.title ?? plan.id ?? "(untitled)";
  const kind = resolveType({ kind: plan.kind });
  return (
    <div className="flex min-w-0 items-center gap-x-2">
      {kind ? (
        <TypeIcon type={kind} />
      ) : (
        <ClipboardListIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate font-medium" title={title}>
        {title}
      </span>
      {plan.hidden ? (
        <MetaPill className="text-amber-600 dark:text-amber-400">hidden</MetaPill>
      ) : null}
      {plan.description ? (
        <span
          className="min-w-0 flex-shrink truncate text-xs text-muted-foreground"
          title={plan.description}
        >
          {plan.description}
        </span>
      ) : null}
    </div>
  );
}

function CountsCell({ plan }: { plan: Plan }) {
  const testsCount =
    plan.tests_count ?? (Array.isArray(plan.tests) ? plan.tests.length : undefined);
  const suitesCount =
    plan.suites_count ??
    (Array.isArray(plan.suites) ? plan.suites.length : undefined);
  return (
    <div className="flex items-center gap-x-3 text-xs tabular-nums text-muted-foreground">
      {testsCount != null ? (
        <span title="tests">
          <span className="font-medium text-foreground">{testsCount}</span> tests
        </span>
      ) : null}
      {suitesCount != null ? (
        <span title="suites">
          <span className="font-medium text-foreground">{suitesCount}</span> suites
        </span>
      ) : null}
      {plan.runs_count != null ? (
        <span title="runs">
          <span className="font-medium text-foreground">{plan.runs_count}</span> runs
        </span>
      ) : null}
    </div>
  );
}

interface Plan {
  id?: string;
  title?: string;
  description?: string;
  kind?: string;
  hidden?: boolean;
  tests_count?: number;
  suites_count?: number;
  runs_count?: number;
  tests?: unknown[];
  suites?: unknown[];
  labels?: unknown;
}
