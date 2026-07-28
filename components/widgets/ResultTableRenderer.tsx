"use client";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { extractList } from "./extract-list";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { PriorityIcon } from "./priority-icon";
import { LabelsRow, RunStatusDot } from "./status-pill";
import { resolveType, SuiteGlyph, TypeIcon } from "./type-icons";

const DEFAULT_COLUMNS: Record<string, string[]> = {
  tests: ["suite_title", "title", "status"],
  runs: ["title", "status", "env"],
  suites: ["title", "tests_count"],
  plans: ["title", "kind"],
  testruns: ["title", "status", "run_time"],
};

const WIDE_COLUMNS = new Set(["title", "clean_title", "public_title"]);

/**
 * Generic column table for `render_result` — renders any fetched list with
 * agent-picked columns, in exactly the given order. Known fields render as
 * the product's icons: `status` as the colored status disc, `state`
 * (manual/automated) as the type icon, `priority` as a pill, labels/tags
 * as chips.
 */
export default function ResultTableRenderer({
  json,
  kind,
  columns,
  summary,
}: {
  json: unknown;
  kind?: string;
  columns?: string[];
  summary?: string;
}) {
  const { items, meta } = extractList<Record<string, unknown>>(json);
  if (items.length === 0) {
    return (
      <ConversationEmptyState
        title="No rows"
        description="Nothing matched the query."
        icon={<SuiteGlyph className="size-6 text-muted-foreground" />}
      />
    );
  }

  let cols = columns?.filter(Boolean) ?? [];
  if (cols.length === 0) cols = defaultColumns(kind, items[0]);
  const withData = cols.filter((c) => items.some((row) => row[c] != null && row[c] !== ""));
  if (withData.length > 0) cols = withData;
  // Priority rides along with the title as an icon, never as its own column.
  if (cols.some((c) => WIDE_COLUMNS.has(c))) cols = cols.filter((c) => c !== "priority");
  const grid = cols
    .map((c) => (WIDE_COLUMNS.has(c) ? "minmax(0,4fr)" : "minmax(0,2fr)"))
    .join(" ");

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <ListRowGroup gridCols={grid}>
        <ListRowHeader gridCols={grid}>
          {cols.map((c) => (
            <div key={c} className="min-w-0 truncate">
              {label(c)}
            </div>
          ))}
        </ListRowHeader>
        {items.map((row, idx) => (
          <ListRow key={String(row.id ?? idx)} gridCols={grid}>
            {cols.map((c) => (
              <div key={c} className="flex min-w-0 items-center gap-x-1.5 overflow-hidden">
                <Cell field={c} row={row} />
              </div>
            ))}
          </ListRow>
        ))}
        {meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total}
          </ListRowCaption>
        )}
      </ListRowGroup>
    </div>
  );
}

function Cell({ field, row }: { field: string; row: Record<string, unknown> }) {
  const value = row[field];
  if (field === "status") {
    if (!value) return <span className="text-xs text-muted-foreground">—</span>;
    const s = String(value);
    return (
      <span className="flex shrink-0 items-center gap-x-1 text-xs capitalize">
        <RunStatusDot status={s} title={s} />
        {s}
      </span>
    );
  }
  if (field === "state") {
    const type = resolveType({ state: value as string | undefined });
    return (
      <span className="flex shrink-0 items-center gap-x-1 text-xs capitalize">
        {type && <TypeIcon type={type} />}
        {String(value ?? "—")}
      </span>
    );
  }
  if (field === "priority") {
    return <PriorityIcon priority={value as string} />;
  }
  if (field === "labels" || field === "tags" || field === "self_tags") {
    return <LabelsRow labels={field === "labels" ? value : undefined} tags={field === "labels" ? undefined : value} />;
  }
  if (WIDE_COLUMNS.has(field)) {
    return (
      <>
        <PriorityIcon priority={row.priority as string} />
        <span className="truncate font-medium" title={String(value ?? "")}>
          {String(value ?? "—")}
        </span>
      </>
    );
  }
  if (field === "suite_title") {
    return (
      <span className="truncate text-xs text-muted-foreground" title={String(value ?? "")}>
        {String(value ?? "—")}
      </span>
    );
  }
  if (value == null || value === "") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return <span className="truncate text-xs">{String(value)}</span>;
}

function defaultColumns(kind: string | undefined, sample: Record<string, unknown>): string[] {
  if (kind && DEFAULT_COLUMNS[kind]) {
    return DEFAULT_COLUMNS[kind].filter((c) => c === "status" || sample[c] !== undefined);
  }
  const keys = Object.keys(sample).filter(
    (k) => typeof sample[k] !== "object" && !["id", "type", "position", "sync"].includes(k)
  );
  return keys.slice(0, 5);
}

function label(field: string): string {
  return field.replace(/_/g, " ");
}
