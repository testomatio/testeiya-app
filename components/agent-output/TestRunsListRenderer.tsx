"use client";

import { useMemo, useState } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { PlayIcon } from "lucide-react";
import TestRunItemRenderer from "./items/TestRunItemRenderer";
import { extractList } from "./extract-list";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { PreviewPane } from "./preview-pane";
import { formatDuration, RunStatusDot } from "./status-pill";
import { resolveType, TypeIcon } from "./type-icons";

// A testrun = one test's execution result inside a run.
interface McpTestRun {
  id?: string;
  run_id?: string;
  test_id?: string;
  test_title?: string;
  title?: string;
  test?: { title?: string };
  status?: string;
  run_time?: number;
  duration?: number;
  automated?: boolean;
  environment?: string | null;
  browser?: string | null;
  assigned_to?: string | null;
}

const TESTRUNS_GRID = "minmax(0,8fr) 2fr 2fr";

export default function TestRunsListRenderer({
  json,
  summary,
}: {
  json: unknown;
  summary?: string;
}) {
  const { items, meta } = useMemo(() => extractList<McpTestRun>(json), [json]);
  const [selected, setSelected] = useState<McpTestRun | null>(null);

  if (items.length === 0) {
    return (
      <ConversationEmptyState
        title="No test runs"
        description="Nothing matched the query."
        icon={<PlayIcon className="size-6" />}
      />
    );
  }

  if (selected) {
    const title =
      selected.test_title ??
      selected.title ??
      selected.test?.title ??
      (selected.id != null ? `Test run #${selected.id}` : "Test run");
    return (
      <div className="space-y-2">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <PreviewPane title={title} onBack={() => setSelected(null)}>
          <TestRunItemRenderer
            data={selected as unknown as Record<string, unknown>}
          />
        </PreviewPane>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <ListRowGroup>
        <ListRowHeader gridCols={TESTRUNS_GRID}>
          <div className="min-w-0 truncate">Test</div>
          <div className="min-w-0 truncate">Duration</div>
          <div className="min-w-0 truncate">Env</div>
        </ListRowHeader>
        {items.map((tr, idx) => {
          const title =
            tr.test_title ??
            tr.title ??
            tr.test?.title ??
            tr.id ??
            "(untitled)";
          const duration = tr.run_time ?? tr.duration;
          return (
            <ListRow
              key={tr.id ?? idx}
              gridCols={TESTRUNS_GRID}
              onOpen={() => setSelected(tr)}
            >
              <div className="flex min-w-0 items-center gap-x-2">
                <RunStatusDot status={tr.status} title={tr.status} />
                {(() => {
                  const kind = resolveType({ automated: tr.automated });
                  return kind ? <TypeIcon type={kind} /> : null;
                })()}
                <span className="truncate font-medium" title={title}>
                  {title}
                </span>
                {tr.assigned_to && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {tr.assigned_to}
                  </span>
                )}
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {formatDuration(duration) ?? "—"}
              </div>
              <div className="min-w-0 truncate text-xs text-muted-foreground">
                {tr.environment ?? tr.browser ?? "—"}
              </div>
            </ListRow>
          );
        })}
        {meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} test runs
          </ListRowCaption>
        )}
      </ListRowGroup>
    </div>
  );
}
