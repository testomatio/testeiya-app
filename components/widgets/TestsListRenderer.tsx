"use client";

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
import { LabelsRow, MetaPill, RunStatusDot, StatusCount, statusKind } from "./status-pill";
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

  // Grouping by status already labels each section with the run status, so the
  // per-row dot would be redundant there; show it in every other view.
  const showRowStatus = groupBy !== "status";
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
          {showRowStatus && t.status && (
            <RunStatusDot status={t.status} title={t.status} />
          )}
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
        <div className="flex min-w-0 items-center gap-x-1 overflow-hidden">
          {t.priority && t.priority !== "normal" && (
            <MetaPill>{t.priority}</MetaPill>
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
        {groupTests(items, groupBy).map(([key, rows]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center gap-x-2 px-1.5 pt-1">
              {groupBy === "status" && <RunStatusDot status={key} title={key} />}
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {key}
              </span>
              <StatusCount value={rows.length} tone={countTone(groupBy, key)} />
            </div>
            <ListRowGroup gridCols={TESTS_GRID}>{rows.map(renderRow)}</ListRowGroup>
          </div>
        ))}
        {pager}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <ListRowGroup gridCols={TESTS_GRID}>
        <ListRowHeader gridCols={TESTS_GRID}>
          <div className="min-w-0 truncate">Suite</div>
          <div className="min-w-0 truncate">Test</div>
          <div className="min-w-0 truncate">Tags</div>
          <div className="min-w-0 truncate">State</div>
        </ListRowHeader>
        {items.map(renderRow)}
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
