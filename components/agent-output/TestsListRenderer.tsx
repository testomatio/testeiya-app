"use client";

import { useMemo, useState } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import TestItemRenderer from "./items/TestItemRenderer";
import { extractList } from "./extract-list";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { PreviewPane } from "./preview-pane";
import { LabelsRow, MetaPill } from "./status-pill";
import { resolveType, SuiteGlyph, TypeIcon } from "./type-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
const VISIBLE_TAGS = 3;

export default function TestsListRenderer({
  json,
  summary,
}: {
  json: unknown;
  summary?: string;
}) {
  const { items, meta } = useMemo(() => extractList<McpTest>(json), [json]);
  const [selected, setSelected] = useState<McpTest | null>(null);

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
      <ListRowGroup>
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
              <div className="min-w-0 truncate text-xs text-muted-foreground">
                <span className="truncate" title={suite}>
                  {suite ?? "—"}
                </span>
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
              <div className="flex min-w-0 items-center gap-x-1 overflow-hidden">
                <LabelsRow labels={t.labels} className="min-w-0 overflow-hidden" />
                <OverflowTags tags={t.tags} />
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
        {meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} tests
          </ListRowCaption>
        )}
      </ListRowGroup>
    </div>
  );
}

function resolveTagTitle(tag: unknown): string {
  if (typeof tag === "string") return tag;
  return String(
    (tag as { name?: string; title?: string })?.name ??
      (tag as { title?: string })?.title ??
      ""
  );
}

function OverflowTags({ tags }: { tags?: unknown }) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const all = (tags as unknown[]).map(resolveTagTitle).filter(Boolean);
  const visible = all.slice(0, VISIBLE_TAGS);
  const hidden = all.slice(VISIBLE_TAGS);
  return (
    <>
      {visible.map((tag, i) => (
        <MetaPill key={`tag-${i}`}>#{tag}</MetaPill>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={
            <MetaPill className="cursor-default">+{hidden.length}</MetaPill>
          } />
          <TooltipContent>
            <div className="flex flex-col gap-0.5">
              {hidden.map((tag, i) => (
                <span key={i}>#{tag}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
