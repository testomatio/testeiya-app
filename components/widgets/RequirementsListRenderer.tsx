"use client";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { ClipboardCheckIcon, ExternalLinkIcon } from "@/lib/icons";
import { openExternalUrl } from "@/lib/testomatio-url";
import { useListWidget } from "./use-list-widget";
import {
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "./list-row";
import { LabelsRow, MetaPill } from "./status-pill";

// Requirements are "linked issues" in Testomat.io (the v2 `issues` resource —
// JIRA / GitHub / manual). Fields vary by source, so everything is optional and
// rendered defensively, mirroring the other list renderers.
interface McpRequirement {
  id?: string | number;
  title?: string;
  name?: string;
  summary?: string;
  description?: string;
  url?: string;
  link?: string;
  jira_id?: string;
  jira_key?: string;
  key?: string;
  identifier?: string;
  source?: string;
  type?: string;
  status?: string;
  state?: string;
  tests_count?: number;
  linked_tests_count?: number;
  tests?: unknown[];
  labels?: unknown;
}

const REQS_GRID = "minmax(0,6fr) 2fr 4fr";

function pick<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v != null && v !== "") return v as T;
  return undefined;
}

export default function RequirementsListRenderer({
  json,
  summary,
  widgetId,
}: {
  json: unknown;
  summary?: string;
  widgetId?: string;
}) {
  const { items, meta, pager } = useListWidget<McpRequirement>({
    widgetId,
    resource: "issues",
    json,
    getId: (r) => (r.id != null ? String(r.id) : undefined),
    onOpen: (r) => {
      const url = pick(r.url, r.link);
      if (url) void openExternalUrl(url);
    },
  });

  if (items.length === 0) {
    return (
      <ConversationEmptyState
        title="No requirements"
        description="No linked issues or requirements were found."
        icon={<ClipboardCheckIcon className="size-6" />}
      />
    );
  }

  return (
    <div className="space-y-2">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <ListRowGroup>
        <ListRowHeader gridCols={REQS_GRID}>
          <div className="min-w-0 truncate">Requirement</div>
          <div className="min-w-0 truncate">Status</div>
          <div className="min-w-0 truncate">Tests</div>
        </ListRowHeader>
        {items.map((r, idx) => {
          const key = pick(r.jira_key, r.key, r.jira_id, r.identifier);
          const title =
            pick(r.title, r.summary, r.name, key, r.url) ??
            (r.id != null ? String(r.id) : "(untitled)");
          const status = pick(r.status, r.state);
          const url = pick(r.url, r.link);
          const count =
            pick(r.tests_count, r.linked_tests_count) ??
            (Array.isArray(r.tests) ? r.tests.length : undefined);
          return (
            <ListRow
              key={r.id ?? idx}
              gridCols={REQS_GRID}
              onOpen={url ? () => void openExternalUrl(url) : undefined}
            >
              <div className="flex min-w-0 items-center gap-x-2">
                <ClipboardCheckIcon className="size-4 shrink-0 text-muted-foreground" />
                {key && (
                  <MetaPill className="font-mono" title={r.source ?? "issue"}>
                    {key}
                  </MetaPill>
                )}
                <span className="truncate font-medium" title={title}>
                  {title}
                </span>
                <LabelsRow labels={r.labels} className="min-w-0" />
              </div>
              <div className="flex min-w-0 items-center text-xs text-muted-foreground">
                {status ? (
                  <MetaPill className="capitalize">{status}</MetaPill>
                ) : (
                  "—"
                )}
              </div>
              <div className="flex items-center gap-x-1.5 text-xs tabular-nums text-muted-foreground">
                <span>{count ?? "—"}</span>
                {url && (
                  <ExternalLinkIcon className="size-3 shrink-0 opacity-60" />
                )}
              </div>
            </ListRow>
          );
        })}
        {!pager && meta?.total != null && meta.total > items.length && (
          <ListRowCaption>
            Showing {items.length} of {meta.total} requirements
          </ListRowCaption>
        )}
      </ListRowGroup>
      {pager}
    </div>
  );
}
