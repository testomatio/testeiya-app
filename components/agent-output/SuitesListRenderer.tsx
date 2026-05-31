"use client";

import { useMemo, useState } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { FolderGlyph } from "@/components/icons";
import SuiteItemRenderer from "./items/SuiteItemRenderer";
import { extractList } from "./extract-list";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { PreviewPane } from "./preview-pane";
import { LabelsRow } from "./status-pill";
import { SuiteKindIcon } from "./type-icons";

interface McpSuite {
  id?: string;
  title?: string;
  emoji?: string | null;
  file_type?: "file" | "folder";
  parent_id?: string | null;
  tests_count?: number;
  tests_total_count?: number;
  labels?: unknown;
  updated_at?: string | null;
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SUITES_GRID = "minmax(0,8fr) 2fr 2fr";

export default function SuitesListRenderer({
  json,
  summary,
}: {
  json: unknown;
  summary?: string;
}) {
  const { items, meta } = useMemo(() => extractList<McpSuite>(json), [json]);
  const [selected, setSelected] = useState<McpSuite | null>(null);

  if (items.length === 0) {
    return (
      <ConversationEmptyState
        title="No suites"
        description="Nothing matched the query."
        icon={<FolderGlyph className="size-6" />}
      />
    );
  }

  if (selected) {
    const title = selected.title ?? selected.id ?? "Suite";
    return (
      <div className="space-y-2">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <PreviewPane title={title} onBack={() => setSelected(null)}>
          <SuiteItemRenderer data={selected as unknown as Record<string, unknown>} />
        </PreviewPane>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <ListRowGroup>
        <ListRowHeader gridCols={SUITES_GRID}>
          <div className="min-w-0 truncate">Suite</div>
          <div className="min-w-0 truncate text-right pr-3">Tests</div>
          <div className="min-w-0 truncate">Updated</div>
        </ListRowHeader>
        {items.map((s, idx) => {
          const title = s.title ?? s.id ?? "(untitled)";
          const isFolder = s.file_type === "folder";
          const count = s.tests_total_count ?? s.tests_count ?? null;
          return (
            <ListRow
              key={s.id ?? idx}
              gridCols={SUITES_GRID}
              onOpen={() => setSelected(s)}
            >
              <div className="flex min-w-0 items-center gap-x-2">
                {s.emoji ? (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none"
                    aria-hidden
                  >
                    {s.emoji}
                  </span>
                ) : (
                  <SuiteKindIcon
                    fileType={s.file_type}
                    isRoot={s.parent_id == null && isFolder}
                  />
                )}
                <span className="truncate font-medium" title={title}>
                  {title}
                </span>
                <LabelsRow labels={s.labels} className="min-w-0" />
              </div>
              <div className="text-right pr-3 text-xs tabular-nums text-muted-foreground">
                {count ?? "—"}
              </div>
              <div className="min-w-0 truncate text-xs text-muted-foreground">
                {formatDate(s.updated_at) ?? "—"}
              </div>
            </ListRow>
          );
        })}
        {meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} suites
          </ListRowCaption>
        )}
      </ListRowGroup>
    </div>
  );
}
