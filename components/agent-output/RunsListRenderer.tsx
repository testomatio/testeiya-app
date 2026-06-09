"use client";

import { useMemo, useState } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { ListChecksIcon } from "@/lib/icons";
import RunItemRenderer from "./items/RunItemRenderer";
import ManualRunRenderer from "./items/ManualRunRenderer";
import { extractList } from "./extract-list";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { PreviewPane } from "./preview-pane";
import {
  formatDuration,
  LabelsRow,
  MetaPill,
  RunProgress,
  RunStatusDot,
  StatusTriplet,
} from "./status-pill";
import { resolveType, TypeIcon } from "./type-icons";

interface McpRun {
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
  duration?: number;
  finished_at?: string | null;
  started_at?: string | null;
  assigned_to?: string | null;
  automated?: boolean;
  percent?: number;
  percent_marked?: number;
  branch?: { title?: string } | string | null;
  labels?: unknown;
}

// Frontend's grid: `minmax(0, 8fr) 2fr 2fr` — title column takes 8/12,
// statuses 2/12, meta 2/12. Column gap 0.5rem matches list-runs.scss.
const RUNS_GRID = "minmax(0,8fr) 2fr 2fr";

export default function RunsListRenderer({
  json,
  summary,
}: {
  json: unknown;
  summary?: string;
}) {
  const { items, meta } = useMemo(() => extractList<McpRun>(json), [json]);
  const [selected, setSelected] = useState<McpRun | null>(null);
  const [manualRun, setManualRun] = useState(false);

  if (selected && manualRun) {
    return (
      <ManualRunRenderer
        data={selected as unknown as Record<string, unknown>}
        onExit={() => setManualRun(false)}
      />
    );
  }

  if (items.length === 0) {
    return (
      <ConversationEmptyState
        title="No runs"
        description="Nothing matched the query."
        icon={<ListChecksIcon className="size-6" />}
      />
    );
  }

  if (selected) {
    const title =
      selected.title ?? selected.clean_title ?? selected.id ?? "Run";
    return (
      <div className="space-y-2">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <PreviewPane title={title} onBack={() => setSelected(null)}>
          <RunItemRenderer
            data={selected as unknown as Record<string, unknown>}
            onStartManualRun={() => setManualRun(true)}
          />
        </PreviewPane>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summary && (
        <p className="text-sm text-muted-foreground">{summary}</p>
      )}
      <ListRowGroup>
        <ListRowHeader gridCols={RUNS_GRID}>
          <div className="min-w-0 truncate">Run</div>
          <div className="min-w-0 truncate">Status</div>
          <div className="min-w-0 truncate">Finished</div>
        </ListRowHeader>
        {items.map((r, idx) => {
          const total =
            r.tests_count ??
            (r.passed_count ?? 0) + (r.failed_count ?? 0) + (r.skipped_count ?? 0);
          const finished =
            r.finished_at != null || (r.status ?? "").toLowerCase() === "finished";
          const env = r.environment ?? r.env ?? undefined;
          const branch =
            typeof r.branch === "string"
              ? r.branch
              : r.branch?.title ?? undefined;
          const title = r.title ?? r.clean_title ?? r.id ?? "(untitled)";
          const percent = r.percent_marked ?? r.percent;
          return (
            <ListRow
              key={r.id ?? idx}
              gridCols={RUNS_GRID}
              onOpen={() => setSelected(r)}
            >
              <div className="flex min-w-0 items-center gap-x-2">
                <RunStatusDot status={r.status} title={r.status} />
                {(() => {
                  const kind = resolveType({
                    kind: r.kind,
                    automated: r.automated,
                  });
                  return kind ? <TypeIcon type={kind} /> : null;
                })()}
                <span className="truncate font-medium" title={title}>
                  {title}
                </span>
                {branch && (
                  <MetaPill title="branch" className="max-w-[120px] truncate">
                    {branch}
                  </MetaPill>
                )}
                <LabelsRow labels={r.labels} className="min-w-0" />
                {total > 0 && (
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {total} test{total === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 items-center">
                {finished ? (
                  <StatusTriplet
                    passed={r.passed_count}
                    failed={r.failed_count}
                    skipped={(r.skipped_count ?? 0) + (r.pending_count ?? 0)}
                  />
                ) : (
                  <RunProgress percent={percent} automated={r.automated} />
                )}
              </div>
              <div className="flex min-w-0 items-center justify-between gap-x-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {formatDuration(r.duration) ?? "—"}
                </span>
                {env && (
                  <span className="truncate" title={env}>
                    {env}
                  </span>
                )}
                {r.assigned_to && (
                  <span className="truncate" title={r.assigned_to}>
                    {r.assigned_to}
                  </span>
                )}
              </div>
            </ListRow>
          );
        })}
        {meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} runs
          </ListRowCaption>
        )}
      </ListRowGroup>
    </div>
  );
}
