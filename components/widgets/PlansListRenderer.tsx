"use client";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { ClipboardListIcon } from "@/lib/icons";
import PlanItemRenderer from "./items/PlanItemRenderer";
import { useListWidget } from "./use-list-widget";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { PreviewPane } from "./preview-pane";
import { LabelsRow, MetaPill } from "./status-pill";
import { resolveType, TypeIcon } from "./type-icons";

interface McpPlan {
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

export default function PlansListRenderer({
  json,
  summary,
  widgetId,
}: {
  json: unknown;
  summary?: string;
  widgetId?: string;
}) {
  const { items, meta, selected, setSelected, pager } = useListWidget<McpPlan>({
    widgetId,
    resource: "plans",
    json,
    getId: (p) => (p.id != null ? String(p.id) : undefined),
  });

  if (items.length === 0) {
    return (
      <ConversationEmptyState
        title="No plans"
        description="Nothing matched the query."
        icon={<ClipboardListIcon className="size-6" />}
      />
    );
  }

  if (selected) {
    const title = selected.title ?? selected.id ?? "Plan";
    return (
      <div className="space-y-2">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <PreviewPane title={title} onBack={() => setSelected(null)}>
          <PlanItemRenderer data={selected as unknown as Record<string, unknown>} />
        </PreviewPane>
      </div>
    );
  }

  const hasLabels = items.some((p) => {
    if (Array.isArray(p.labels)) return p.labels.length > 0;
    return p.labels != null;
  });
  const hasCounts = items.some(
    (p) =>
      p.tests_count != null ||
      p.suites_count != null ||
      p.runs_count != null ||
      Array.isArray(p.tests) ||
      Array.isArray(p.suites)
  );
  let grid = "minmax(0,6fr)";
  if (hasLabels) grid += " minmax(0,3fr)";
  if (hasCounts) grid += " minmax(0,2fr)";

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <ListRowGroup gridCols={grid}>
        <ListRowHeader gridCols={grid}>
          <div className="min-w-0 truncate">Plan</div>
          {hasLabels && <div className="min-w-0 truncate">Labels</div>}
          {hasCounts && <div className="min-w-0 truncate">Counts</div>}
        </ListRowHeader>
        {items.map((p, idx) => {
          const title = p.title ?? p.id ?? "(untitled)";
          const testsCount =
            p.tests_count ??
            (Array.isArray(p.tests) ? p.tests.length : undefined);
          const suitesCount =
            p.suites_count ??
            (Array.isArray(p.suites) ? p.suites.length : undefined);
          return (
            <ListRow
              key={p.id ?? idx}
              gridCols={grid}
              onOpen={() => setSelected(p)}
            >
              <div className="flex min-w-0 items-center gap-x-2">
                {(() => {
                  const kind = resolveType({ kind: p.kind });
                  return kind ? (
                    <TypeIcon type={kind} />
                  ) : (
                    <ClipboardListIcon className="size-4 shrink-0 text-muted-foreground" />
                  );
                })()}
                <span className="truncate font-medium" title={title}>
                  {title}
                </span>
                {p.hidden && (
                  <MetaPill className="text-amber-600 dark:text-amber-400">
                    hidden
                  </MetaPill>
                )}
                {p.description && (
                  <span
                    className="min-w-0 flex-shrink truncate text-xs text-muted-foreground"
                    title={p.description}
                  >
                    {p.description}
                  </span>
                )}
              </div>
              {hasLabels && (
                <div className="min-w-0">
                  <LabelsRow labels={p.labels} />
                </div>
              )}
              {hasCounts && (
              <div className="flex items-center gap-x-3 text-xs tabular-nums text-muted-foreground">
                {testsCount != null && (
                  <span title="tests">
                    <span className="font-medium text-foreground">{testsCount}</span> tests
                  </span>
                )}
                {suitesCount != null && (
                  <span title="suites">
                    <span className="font-medium text-foreground">{suitesCount}</span> suites
                  </span>
                )}
                {p.runs_count != null && (
                  <span title="runs">
                    <span className="font-medium text-foreground">{p.runs_count}</span> runs
                  </span>
                )}
              </div>
              )}
            </ListRow>
          );
        })}
        {!pager && meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} plans
          </ListRowCaption>
        )}
      </ListRowGroup>
      {pager}
    </div>
  );
}
