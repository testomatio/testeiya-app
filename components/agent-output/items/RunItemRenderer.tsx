"use client";

import { useState } from "react";
import { mdiOpenInNew, mdiPlay } from "@mdi/js";
import { MdiIcon } from "@/components/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { useTestomatio } from "@/lib/agent-output/use-testomatio";
import { useProjectService } from "@/lib/services/StoreProvider";
import { openExternalUrl } from "@/lib/testomatio-url";
import { cn } from "@/lib/utils";
import { ListPager } from "../list-row";
import { formatDuration, LabelsRow, MetaPill, RunStatusDot } from "../status-pill";
import { resolveType, TypeIcon } from "../type-icons";
import ManualRunRenderer from "./ManualRunRenderer";

const GRID =
  "grid grid-cols-[1.5rem_minmax(90px,1fr)_minmax(140px,2fr)_minmax(0,2fr)_auto] items-center gap-x-3";

const TESTRUNS_PER_PAGE = 50;

export default function RunItemRenderer({
  data,
  onStartManualRun,
}: {
  data: Record<string, unknown>;
  onStartManualRun?: () => void;
}) {
  const run = data as McpRunDetail;
  const project = useProjectService();
  const [executing, setExecuting] = useState(false);
  const title = run.title ?? run.clean_title ?? run.id ?? "(untitled run)";
  const passed = run.passed_count ?? 0;
  const failed = run.failed_count ?? 0;
  const skipped = run.skipped_count ?? 0;
  const total =
    run.tests_count ?? passed + failed + skipped + (run.pending_count ?? 0);
  const pending =
    run.pending_count ?? Math.max(0, total - passed - failed - skipped);
  const completed = Math.max(0, total - pending);
  const percentCompleted = total > 0 ? Math.round((completed / total) * 100) : 0;
  const env = run.environment ?? run.env ?? undefined;
  const branch =
    typeof run.branch === "string" ? run.branch : run.branch?.title ?? undefined;
  const startedAt = run.started_at ?? run.created_at ?? undefined;
  const createdBy = personName(run.author ?? run.created_by ?? run.user);
  const runsUrl = project.currentLinks?.runs;
  const externalUrl = runsUrl && run.id ? `${runsUrl}/${run.id}` : undefined;
  const isManual = resolveType({ kind: run.kind }) === "manual";
  const isFinished = ["finished", "passed", "failed", "terminated"].includes(
    (run.status ?? "").toLowerCase()
  );
  const showManualRun = isManual && !isFinished && Boolean(run.id);

  // Enrichment: the v2 Run schema doesn't nest testruns, so when the caller
  // didn't hand us any we fetch them via the proxy. If a WorkspaceProvider
  // isn't wrapping us (e.g. /preview without ?session) the hook is a no-op.
  const preloaded = run.testruns ?? run.tests ?? [];
  const [testrunsPage, setTestrunsPage] = useState(1);
  const {
    data: fetched,
    loading: testrunsLoading,
    error: testrunsError,
    meta: testrunsMeta,
  } = useTestomatio<McpNestedTestRun[]>(
    "testruns",
    { run_id: run.id, page: testrunsPage, per_page: TESTRUNS_PER_PAGE },
    { skip: !run.id || preloaded.length > 0 }
  );
  const nested: McpNestedTestRun[] =
    preloaded.length > 0 ? preloaded : fetched ?? [];

  // Only the fetched path is pageable; preloaded testruns came whole with the run.
  const paginated = preloaded.length === 0;
  const testrunsTotal = testrunsMeta?.total;
  const hasPrevTestruns = testrunsPage > 1;
  let hasNextTestruns = (fetched?.length ?? 0) === TESTRUNS_PER_PAGE;
  if (testrunsTotal != null) {
    hasNextTestruns = testrunsPage * TESTRUNS_PER_PAGE < testrunsTotal;
  }
  let testrunsTotalPages: number | undefined;
  if (testrunsTotal != null) {
    testrunsTotalPages = Math.max(1, Math.ceil(testrunsTotal / TESTRUNS_PER_PAGE));
  }
  const showTestrunsPager =
    paginated && !testrunsLoading && (hasPrevTestruns || hasNextTestruns);
  let testrunsPagerLabel = `Page ${testrunsPage}`;
  if (testrunsTotal != null) {
    const trStart = (testrunsPage - 1) * TESTRUNS_PER_PAGE + 1;
    const trEnd = (testrunsPage - 1) * TESTRUNS_PER_PAGE + nested.length;
    testrunsPagerLabel = `${trStart}–${trEnd} of ${testrunsTotal} test runs`;
  }

  if (executing) {
    return (
      <ManualRunRenderer data={data} onExit={() => setExecuting(false)} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {(() => {
            const kind = resolveType({ kind: run.kind });
            return kind ? <TypeIcon type={kind} /> : null;
          })()}
          <div className="text-base font-semibold">{title}</div>
          <div className="ml-auto flex items-center gap-1">
            {showManualRun && (
              <Button
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={onStartManualRun ?? (() => setExecuting(true))}
              >
                <MdiIcon path={mdiPlay} className="size-3.5" />
                Start manual run
              </Button>
            )}
            {externalUrl && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => openExternalUrl(externalUrl)}
                title="Open in Testomat.io"
              >
                <MdiIcon path={mdiOpenInNew} className="size-3.5" />
                <span className="hidden sm:inline">Open in Testomat.io</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 text-xs">
          {env && <MetaPill title="environment">{env}</MetaPill>}
          {branch && <MetaPill title="branch">{branch}</MetaPill>}
          <LabelsRow labels={run.labels} />
        </div>

        {run.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {run.description}
          </p>
        )}

        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 pt-1 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-1.5">
            <RunStatusDot status={run.status} title={run.status} />
            <span className="capitalize">{run.status ?? "unknown"}</span>
          </dd>

          <dt className="text-muted-foreground">Tests</dt>
          <dd>
            {total} ({percentCompleted}% completed)
          </dd>

          {startedAt && (
            <>
              <dt className="text-muted-foreground">Started</dt>
              <dd>{formatDateTime(startedAt)}</dd>
            </>
          )}

          {run.assigned_to && (
            <>
              <dt className="text-muted-foreground">Assigned to</dt>
              <dd>{run.assigned_to}</dd>
            </>
          )}

          {createdBy && (
            <>
              <dt className="text-muted-foreground">Created by</dt>
              <dd>{createdBy}</dd>
            </>
          )}
        </dl>

        {testrunsLoading && (
          <div className="text-xs">
            <Shimmer as="span">Loading test runs…</Shimmer>
          </div>
        )}
        {testrunsError && !testrunsLoading && (
          <p className="text-xs text-muted-foreground">
            Couldn&apos;t load test runs — {testrunsError}
          </p>
        )}
      </div>

      {nested.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <div
            className={cn(
              GRID,
              "border-b bg-muted/30 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground"
            )}
          >
            <span />
            <span className="min-w-0 truncate">Suite</span>
            <span className="min-w-0 truncate">Test</span>
            <span className="min-w-0 truncate">Message</span>
            <span className="text-right">Time</span>
          </div>
          <div className="divide-y">
            {nested.map((t, i) => {
              const testTitle =
                t.test_title ?? t.title ?? String(t.id ?? "(untitled)");
              const suite = t.suite_title ?? "—";
              const rt = t.run_time ?? t.duration;
              const time = rt && rt > 0 ? formatDuration(rt) : null;
              const isFailed = (t.status ?? "").toLowerCase() === "failed";
              return (
                <div
                  key={t.id ?? `${suite}-${i}`}
                  className={cn(GRID, "px-3 py-2 text-sm")}
                >
                  <RunStatusDot status={t.status} title={t.status} />
                  <span
                    className="min-w-0 truncate text-muted-foreground"
                    title={suite}
                  >
                    {suite}
                  </span>
                  <span className="min-w-0 truncate font-medium" title={testTitle}>
                    {testTitle}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-xs",
                      isFailed ? "text-run-failed" : "text-muted-foreground"
                    )}
                    title={t.message ?? undefined}
                  >
                    {t.message ?? ""}
                  </span>
                  <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                    {time ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showTestrunsPager && (
        <ListPager
          label={testrunsPagerLabel}
          page={testrunsPage}
          totalPages={testrunsTotalPages}
          hasPrev={hasPrevTestruns}
          hasNext={hasNextTestruns}
          onPage={setTestrunsPage}
          className="rounded-md border"
        />
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

function personName(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  const o = v as { name?: string; title?: string; email?: string };
  return o.name ?? o.title ?? o.email ?? undefined;
}

interface McpRunDetail {
  id?: string;
  title?: string;
  clean_title?: string;
  status?: string;
  kind?: string;
  environment?: string | null;
  env?: string | null;
  assigned_to?: string | null;
  author?: unknown;
  created_by?: unknown;
  user?: unknown;
  tests_count?: number;
  passed_count?: number;
  failed_count?: number;
  skipped_count?: number;
  pending_count?: number;
  duration?: number;
  started_at?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
  description?: string;
  labels?: unknown;
  branch?: { title?: string } | string | null;
  // Nested testruns (when /runs/:id returns them inlined).
  testruns?: McpNestedTestRun[];
  tests?: McpNestedTestRun[];
}

interface McpNestedTestRun {
  id?: string;
  test_id?: string;
  test_title?: string;
  title?: string;
  status?: string;
  message?: string | null;
  run_time?: number;
  duration?: number;
  suite_title?: string;
  suite_id?: string;
}
