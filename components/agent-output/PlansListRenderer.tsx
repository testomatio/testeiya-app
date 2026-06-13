"use client";

import { useMemo, useState } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { ClipboardListIcon } from "@/lib/icons";
import PlanItemRenderer from "./items/PlanItemRenderer";
import { extractList } from "./extract-list";
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

const PLANS_GRID = "minmax(0,6fr) minmax(0,3fr) minmax(0,2fr)";

export default function PlansListRenderer({
  json,
  summary,
}: {
  json: unknown;
  summary?: string;
}) {
  const { items, meta } = useMemo(() => extractList<McpPlan>(json), [json]);
  const [selected, setSelected] = useState<McpPlan | null>(null);

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

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <ListRowGroup>
        <ListRowHeader gridCols={PLANS_GRID}>
          <div className="min-w-0 truncate">Plan</div>
          <div className="min-w-0 truncate">Labels</div>
          <div className="min-w-0 truncate">Counts</div>
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
              gridCols={PLANS_GRID}
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
              <div className="min-w-0">
                <LabelsRow labels={p.labels} />
              </div>
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
            </ListRow>
          );
        })}
        {meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} plans
          </ListRowCaption>
        )}
      </ListRowGroup>
    </div>
  );
}
