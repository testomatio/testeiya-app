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
import { LabelsRow, MetaPill } from "./status-pill";
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
}: {
  json: unknown;
  summary?: string;
  widgetId?: string;
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
        {items.map((t, idx) => {
          const title = t.title ?? t.clean_title ?? t.id ?? "(untitled)";
          const suite = t.suite_title ?? t.suite?.title ?? undefined;
          return (
            <ListRow
              key={t.id ?? idx}
              gridCols={TESTS_GRID}
              onOpen={() => setSelected(t)}
            >
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
        })}
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
