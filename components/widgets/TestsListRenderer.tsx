"use client";

import { useState } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import TestItemRenderer from "./items/TestItemRenderer";
import { useListWidget } from "./use-list-widget";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { PreviewPane } from "./preview-pane";
import { PriorityIcon } from "./priority-icon";
import { LabelsRow, MetaPill, RunStatusDot, StatusCount, StatusFilterChip, statusKind } from "./status-pill";
import { resolveType, SuiteGlyph, TypeIcon } from "./type-icons";

interface McpTest {
  id?: string;
  title?: string;
  clean_title?: string;
  emoji?: string | null;
  suite_id?: string;
  suite_title?: string;
  suite?: { title?: string };
  priority?: string;
  state?: string;
  status?: string;
  labels?: unknown;
  tags?: unknown;
  steps_count?: number;
  updated_at?: string | null;
}

const TESTS_GRID = "minmax(0,3fr) minmax(0,6fr) minmax(0,3fr) minmax(0,2fr)";

export default function TestsListRenderer({
  json,
  summary,
  widgetId,
  groupBy,
}: {
  json: unknown;
  summary?: string;
  widgetId?: string;
  groupBy?: string;
}) {
  const { items, meta, selected, setSelected, pager } = useListWidget<McpTest>({
    widgetId,
    resource: "tests",
    json,
    getId: (t) => (t.id != null ? String(t.id) : undefined),
  });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const statusCounts = countStatuses(items);
  let rows = items;
  if (statusFilter) {
    rows = items.filter((t) => (t.status ?? "").toLowerCase() === statusFilter);
  }
  const statusChips = statusCounts.length > 1 && (
    <div className="flex flex-wrap items-center gap-1.5">
      {statusCounts.map(([s, n]) => (
        <StatusFilterChip
          key={s}
          status={s}
          label={s}
          count={n}
          active={statusFilter === s}
          onClick={() => setStatusFilter(statusFilter === s ? null : s)}
        />
      ))}
    </div>
  );

  if (items.length === 0) {
    return (
      <ConversationEmptyState
        title="No tests"
        description="Nothing matched the query."
        icon={<SuiteGlyph className="size-6 text-muted-foreground" />}
      />
    );
  }

  if (selected) {
    const title = selected.title ?? selected.clean_title ?? selected.id ?? "Test";
    return (
      <div className="space-y-2">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <PreviewPane title={title} onBack={() => setSelected(null)}>
          <TestItemRenderer data={selected as unknown as Record<string, unknown>} />
        </PreviewPane>
      </div>
    );
  }

  const renderRow = (t: McpTest, idx: number) => {
    const title = t.title ?? t.clean_title ?? t.id ?? "(untitled)";
    const suite = t.suite_title ?? t.suite?.title ?? undefined;
    return (
      <ListRow key={t.id ?? idx} gridCols={TESTS_GRID} onOpen={() => setSelected(t)}>
        <div className="flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
          <SuiteGlyph className="size-4 shrink-0" />
          <span className="truncate" title={suite}>{suite ?? "—"}</span>
        </div>
        <div className="flex min-w-0 items-center gap-x-2 overflow-hidden">
          {(() => {
            const kind = resolveType({ state: t.state });
            if (t.emoji) {
              return (
                <span
                  className="flex h-6 w-5 shrink-0 items-center justify-center text-[15px] leading-none"
                  aria-hidden
                >
                  {t.emoji}
                </span>
              );
            }
            if (kind) return <TypeIcon type={kind} />;
            return (
              <SuiteGlyph className="size-4 shrink-0 text-muted-foreground" />
            );
          })()}
          <PriorityIcon priority={t.priority} />
          <span className="truncate font-medium" title={title}>
            {title}
          </span>
          {typeof t.steps_count === "number" && t.steps_count > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {t.steps_count} step{t.steps_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <TagsCell labels={t.labels} tags={t.tags} />
        </div>
        <div className="flex min-w-0 items-center gap-x-1.5 overflow-hidden">
          {t.status && (
            <span className="flex shrink-0 items-center gap-x-1 text-xs capitalize">
              <RunStatusDot status={t.status} title={t.status} />
              {t.status}
            </span>
          )}
          {t.state &&
            t.state !== "manual" &&
            t.state !== "automated" && <MetaPill>{t.state}</MetaPill>}
        </div>
      </ListRow>
    );
  };

  if (groupBy) {
    return (
      <div className="space-y-3">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        {statusChips}
        {groupTests(rows, groupBy).map(([key, groupRows]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center gap-x-2 px-1.5 pt-1">
              {groupBy === "status" && <RunStatusDot status={key} title={key} />}
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {key}
              </span>
              <StatusCount value={groupRows.length} tone={countTone(groupBy, key)} />
            </div>
            <ListRowGroup gridCols={TESTS_GRID}>{groupRows.map(renderRow)}</ListRowGroup>
          </div>
        ))}
        {pager}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      {statusChips}
      <ListRowGroup gridCols={TESTS_GRID}>
        <ListRowHeader gridCols={TESTS_GRID}>
          <div className="min-w-0 truncate">Suite</div>
          <div className="min-w-0 truncate">Test</div>
          <div className="min-w-0 truncate">Tags</div>
          <div className="min-w-0 truncate">Status</div>
        </ListRowHeader>
        {rows.map(renderRow)}
        {!pager && meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} tests
          </ListRowCaption>
        )}
      </ListRowGroup>
      {pager}
    </div>
  );
}

function TagsCell({ labels, tags }: { labels?: unknown; tags?: unknown }) {
  return <LabelsRow labels={labels} tags={tags} />;
}

const STATUS_ORDER = ["passed", "failed", "skipped", "running", "pending"];

function groupTests(items: McpTest[], groupBy: string): Array<[string, McpTest[]]> {
  const map = new Map<string, McpTest[]>();
  for (const t of items) {
    const raw = (t as unknown as Record<string, unknown>)[groupBy];
    const key = raw == null || raw === "" ? "no status" : String(raw);
    const bucket = map.get(key);
    if (bucket) bucket.push(t);
    else map.set(key, [t]);
  }
  if (groupBy !== "status") return [...map.entries()];
  return [...map.entries()].sort((a, b) => orderIndex(a[0]) - orderIndex(b[0]));
}

function orderIndex(status: string): number {
  const i = STATUS_ORDER.indexOf(status.toLowerCase());
  return i === -1 ? STATUS_ORDER.length : i;
}

function countTone(groupBy: string, key: string): "pass" | "fail" | "skip" {
  if (groupBy !== "status") return "skip";
  const kind = statusKind(key);
  if (kind === "passed") return "pass";
  if (kind === "failed") return "fail";
  return "skip";
}

function countStatuses(items: McpTest[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const t of items) {
    const s = t.status?.toLowerCase();
    if (!s) continue;
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => orderIndex(a[0]) - orderIndex(b[0]));
}
