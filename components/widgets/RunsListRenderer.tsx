"use client";

import { useEffect, useState } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { useStores } from "@/lib/services/StoreProvider";
import { ListChecksIcon } from "@/lib/icons";
import RunItemRenderer from "./items/RunItemRenderer";
import ManualRunRenderer from "./items/ManualRunRenderer";
import { useListWidget } from "./use-list-widget";
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
  OverflowBadgeList,
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

export default function RunsListRenderer({
  json,
  summary,
  widgetId,
}: {
  json: unknown;
  summary?: string;
  widgetId?: string;
}) {
  const [manualRun, setManualRun] = useState(false);
  const store = useStores();
  // While a manual run is showing it owns this widget id, so the list yields.
  const { items, meta, selected, setSelected, pager } = useListWidget<McpRun>({
    widgetId: manualRun ? undefined : widgetId,
    resource: "runs",
    json,
    getId: (r) => (r.id != null ? String(r.id) : undefined),
  });

  // When a run is opened from the list, tell the agent + the chat context chip
  // which run it is — the widget id stays the list (runs-list), so override the
  // reported kind to run-item with this run's identity. Yields while the manual
  // run executes (ManualRunRenderer sets its own override).
  const opened = manualRun ? null : selected;
  const openedId = opened?.id;
  const openedTitle = opened?.title ?? opened?.clean_title ?? undefined;
  const openedStatus = opened?.status;
  const openedTests = opened?.tests_count;
  useEffect(() => {
    if (!opened) return;
    const parts: string[] = [];
    if (openedStatus) parts.push(String(openedStatus));
    if (openedTests != null) parts.push(`${openedTests} tests`);
    store.widget.setActiveOverride({
      kind: "run-item",
      id: openedId,
      title: openedTitle,
      state: parts.length > 0 ? parts.join(" · ") : undefined,
    });
    return () => store.widget.clearActiveOverride();
  }, [opened, openedId, openedTitle, openedStatus, openedTests, store]);

  if (selected && manualRun) {
    return (
      <ManualRunRenderer
        data={selected as unknown as Record<string, unknown>}
        onExit={() => setManualRun(false)}
        widgetId={widgetId}
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

  const hasAssigned = items.some((r) => r.assigned_to);
  const hasEnv = items.some((r) => r.environment ?? r.env);
  let grid = "minmax(0,7fr) minmax(0,2fr)";
  if (hasAssigned) grid += " minmax(0,3fr)";
  if (hasEnv) grid += " minmax(0,2fr)";

  return (
    <div className="space-y-2">
      {summary && (
        <p className="text-sm text-muted-foreground">{summary}</p>
      )}
      <ListRowGroup gridCols={grid}>
        <ListRowHeader gridCols={grid}>
          <div className="min-w-0 truncate">Run</div>
          <div className="min-w-0 truncate">Status</div>
          {hasAssigned && <div className="min-w-0 truncate">Finished</div>}
          {hasEnv && <div className="min-w-0 truncate">Environment</div>}
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
              gridCols={grid}
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
              {hasAssigned && (
                <div className="flex min-w-0 items-center text-xs text-muted-foreground overflow-hidden">
                  <span className="truncate">{r.assigned_to ?? "—"}</span>
                </div>
              )}
              {hasEnv && (
                <div className="min-w-0">
                  {env && <OverflowBadgeList items={env.split(/[,;]+/).map(s => s.trim()).filter(Boolean)} />}
                </div>
              )}
            </ListRow>
          );
        })}
        {!pager && meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} runs
          </ListRowCaption>
        )}
      </ListRowGroup>
      {pager}
    </div>
  );
}
