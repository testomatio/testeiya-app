"use client";

import { useState } from "react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Icon } from "@/lib/icons";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { resizableTableComponents } from "@/components/ai-elements/resizable-table";
import { Button } from "@/components/ui/button";
import {
  fetchTestomatioList,
  useTestomatio,
} from "@/lib/agent-output/use-testomatio";
import { useProjectService, useStores } from "@/lib/services/StoreProvider";
import { useRegisterWidget } from "@/lib/widgets/command-bus";
import { useWidgetSnapshot } from "../use-widget-snapshot";
import { openExternalUrl } from "@/lib/testomatio-url";
import { cn } from "@/lib/utils";
import { ListPager } from "../list-row";
import {
  formatDuration,
  LabelsRow,
  MetaPill,
  RunStatusDot,
  StatusFilterChip,
} from "../status-pill";
import { formatDate } from "@/lib/format";
import { resolveType, TypeIcon } from "../type-icons";
import ManualRunRenderer from "./ManualRunRenderer";

const streamdownPlugins = { cjk, code, math, mermaid };

const GRID =
  "grid grid-cols-[1.5rem_minmax(90px,1fr)_minmax(140px,2fr)_minmax(0,2fr)_auto] items-center gap-x-3";

const TESTRUNS_PER_PAGE = 50;

export default function RunItemRenderer({
  data,
  onStartManualRun,
  widgetId,
}: {
  data: Record<string, unknown>;
  onStartManualRun?: () => void;
  widgetId?: string;
}) {
  const run = data as McpRunDetail;
  const project = useProjectService();
  const store = useStores();
  const [executing, setExecuting] = useState(false);
  const title = run.title ?? run.clean_title ?? run.id ?? "(untitled run)";
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

  // The v2 Run carries only `rungroup_id` — resolve the group's title via the
  // rungroups detail endpoint (skipped when the run isn't grouped).
  const rungroupId =
    run.rungroup_id ?? (typeof run.rungroup === "object" ? run.rungroup?.id : undefined);
  const { data: rungroup } = useTestomatio<{ title?: string; name?: string }>(
    "rungroups",
    { id: rungroupId },
    { skip: !rungroupId }
  );
  const rungroupLabel =
    rungroup?.title ??
    rungroup?.name ??
    (typeof run.rungroup === "object" ? run.rungroup?.title : undefined) ??
    rungroupId;

  // Enrichment: the v2 Run schema doesn't nest testruns, so when the caller
  // didn't hand us any we fetch them via the proxy. If a WorkspaceProvider
  // isn't wrapping us (e.g. /preview without ?session) the hook is a no-op.
  const preloaded = run.testruns ?? run.tests ?? [];
  const [testrunsPage, setTestrunsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TestrunStatus | null>(null);
  const {
    data: fetched,
    loading: testrunsLoading,
    error: testrunsError,
    meta: testrunsMeta,
  } = useTestomatio<McpNestedTestRun[]>(
    "testruns",
    {
      run_id: run.id,
      page: testrunsPage,
      per_page: TESTRUNS_PER_PAGE,
      "filter[status]": statusFilter ?? undefined,
    },
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

  // The v2 Run carries no counts, but the app API exposes them in a single
  // request (the run-stats endpoint). Fall back to tallying the loaded page only
  // when those aren't available (e.g. not signed in) and a small run is whole.
  const { data: runStats } = useTestomatio<RunStats>(
    "run-stats",
    { run_id: run.id },
    { skip: !run.id }
  );
  const fullyLoaded = testrunsTotal == null || nested.length >= testrunsTotal;
  const tally = { passed: 0, failed: 0, skipped: 0 };
  for (const t of nested) {
    const s = (t.status ?? "").toLowerCase();
    if (s === "passed") tally.passed++;
    else if (s === "failed") tally.failed++;
    else if (s === "skipped") tally.skipped++;
  }
  let passedCount = run.passed_count ?? runStats?.passed;
  let failedCount = run.failed_count ?? runStats?.failed;
  let skippedCount = run.skipped_count ?? runStats?.skipped;
  // Only trust the page tally when nothing is filtering it and it's the whole run.
  if (
    passedCount == null &&
    failedCount == null &&
    skippedCount == null &&
    !statusFilter &&
    fullyLoaded &&
    nested.length > 0
  ) {
    passedCount = tally.passed;
    failedCount = tally.failed;
    skippedCount = tally.skipped;
  }
  const testsTotal =
    run.tests_count ??
    runStats?.tests_count ??
    (statusFilter ? undefined : testrunsTotal) ??
    (nested.length || undefined);
  const showStatusTriplet =
    passedCount != null || failedCount != null || skippedCount != null;

  const toggleStatusFilter = (status: TestrunStatus) => {
    setStatusFilter((cur) => (cur === status ? null : status));
    setTestrunsPage(1);
  };

  // Agent control (when this run detail is the active widget). Drives the same
  // actions the buttons/pager do; `start_manual_run` is destructive. Not memoized
  // — useRegisterWidget reads it through a ref, so a fresh closure each render is
  // fine and lets React Compiler own the memoization.
  const runCommand = async (action: string, params: Record<string, unknown>) => {
      if (action === "open_external") {
        if (!externalUrl) throw new Error("This run has no external link.");
        openExternalUrl(externalUrl);
        return { opened: externalUrl };
      }
      if (action === "start_manual_run") {
        if (!showManualRun) {
          throw new Error(
            "This run can't be started manually (not a manual run, or already finished)."
          );
        }
        if (onStartManualRun) onStartManualRun();
        else setExecuting(true);
        return { started: true };
      }
      if (action === "testruns") {
        if (!paginated) {
          throw new Error("This run's test results came inline and aren't paginated.");
        }
        if (!run.id) throw new Error("Run id is missing.");
        const sessionId = store.sessionId;
        if (!sessionId) throw new Error("No active session.");
        const nextPage =
          params.page != null ? Math.max(1, Number(params.page)) : testrunsPage;
        setTestrunsPage(nextPage);
        const { items, meta } = await fetchTestomatioList<McpNestedTestRun>(
          "testruns",
          { run_id: run.id, page: nextPage, per_page: TESTRUNS_PER_PAGE },
          sessionId
        );
        return {
          page: nextPage,
          per_page: TESTRUNS_PER_PAGE,
          total: meta?.total ?? null,
          count: items.length,
          testruns: items,
        };
      }
      throw new Error(`Unknown action "${action}" for this run.`);
  };
  // While the manual run is showing it registers its own handler under this id,
  // so the run-item yields to avoid clobbering it.
  useRegisterWidget(executing ? undefined : widgetId, runCommand);

  // Publish what's on screen so the agent can read it in one `get` call (the run
  // plus its currently-loaded per-test results) instead of re-querying the API.
  useWidgetSnapshot(
    { kind: "run-item", run, testruns: nested, total: testrunsMeta?.total ?? nested.length },
    !executing
  );

  if (executing) {
    return (
      <ManualRunRenderer
        data={data}
        onExit={() => setExecuting(false)}
        widgetId={widgetId}
      />
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
                <Icon name="play_arrow" className="size-3.5" />
                Start manual run
              </Button>
            )}
            {externalUrl && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                title="Open in Testomat.io"
                render={
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      openExternalUrl(externalUrl);
                    }}
                  />
                }
              >
                <Icon name="open_in_new" className="size-3.5" />
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

        <div
          className={cn(
            "pt-1",
            showStatusTriplet && "grid grid-cols-2 items-center gap-6"
          )}
        >
          {showStatusTriplet && (
            <div className="min-w-0">
              <RunStatsPie
                passed={passedCount ?? 0}
                failed={failedCount ?? 0}
                skipped={skippedCount ?? 0}
                pending={Math.max(
                  0,
                  (testsTotal ?? 0) -
                    (passedCount ?? 0) -
                    (failedCount ?? 0) -
                    (skippedCount ?? 0)
                )}
              />
            </div>
          )}

          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y [&_td]:w-full [&_td]:px-3 [&_td]:py-1.5 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top [&_th]:font-normal [&_th]:text-muted-foreground [&_tr:nth-child(even)]:bg-muted/30">
                {run.id && (
                  <tr>
                    <th scope="row">Run ID</th>
                    <td className="font-mono text-xs">{run.id}</td>
                  </tr>
                )}

                {rungroupLabel && (
                  <tr>
                    <th scope="row">Run group</th>
                    <td>{rungroupLabel}</td>
                  </tr>
                )}

                <tr>
                  <th scope="row">Status</th>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <RunStatusDot status={run.status} title={run.status} />
                      <span className="capitalize">{run.status ?? "unknown"}</span>
                    </span>
                  </td>
                </tr>

                <tr>
                  <th scope="row">Tests</th>
                  <td>
                    {testsTotal == null && testrunsLoading ? (
                      <Shimmer as="span">Loading…</Shimmer>
                    ) : (
                      testsTotal ?? 0
                    )}
                  </td>
                </tr>

                {startedAt && (
                  <tr>
                    <th scope="row">Started</th>
                    <td>{formatDate(startedAt)}</td>
                  </tr>
                )}

                {run.assigned_to && (
                  <tr>
                    <th scope="row">Assigned to</th>
                    <td>{run.assigned_to}</td>
                  </tr>
                )}

                {createdBy && (
                  <tr>
                    <th scope="row">Created by</th>
                    <td>{createdBy}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {run.description && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            style={{ fontSize: "75%" }}
          >
            <Streamdown
              plugins={streamdownPlugins}
              components={resizableTableComponents}
            >
              {run.description}
            </Streamdown>
          </div>
        )}

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

      {paginated && showStatusTriplet && (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusFilterChip
            label="Passed"
            status="passed"
            count={passedCount}
            active={statusFilter === "passed"}
            onClick={() => toggleStatusFilter("passed")}
          />
          <StatusFilterChip
            label="Failed"
            status="failed"
            count={failedCount}
            active={statusFilter === "failed"}
            onClick={() => toggleStatusFilter("failed")}
          />
          <StatusFilterChip
            label="Skipped"
            status="skipped"
            count={skippedCount}
            active={statusFilter === "skipped"}
            onClick={() => toggleStatusFilter("skipped")}
          />
        </div>
      )}

      {statusFilter && nested.length === 0 && !testrunsLoading && (
        <p className="text-xs text-muted-foreground">
          No {statusFilter} tests in this run.
        </p>
      )}

      {nested.length > 0 && (
        <div className="overflow-hidden">
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

function RunStatsPie({
  passed,
  failed,
  skipped,
  pending,
}: {
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
}) {
  const total = passed + failed + skipped + pending;
  if (total <= 0) return null;
  const data = [
    { name: "Passed", value: passed, fill: "var(--run-passed)" },
    { name: "Failed", value: failed, fill: "var(--run-failed)" },
    { name: "Skipped", value: skipped, fill: "var(--run-skipped)" },
    { name: "Not run", value: pending, fill: "var(--run-pending)" },
  ];
  return (
    <ResponsiveContainer width="100%" height={190}>
      <PieChart>
        <Tooltip
          cursor={false}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--popover-foreground)",
            fontSize: 12,
            padding: "4px 8px",
          }}
          itemStyle={{ color: "var(--popover-foreground)" }}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={52}
          outerRadius={76}
          paddingAngle={2}
          stroke="var(--background)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          height={28}
          iconType="circle"
          iconSize={9}
          formatter={(value, entry) => (
            <span className="text-xs text-muted-foreground">
              {String(value)}{" "}
              <span className="font-medium tabular-nums text-foreground">
                {(entry as { payload?: { value?: number } })?.payload?.value ?? 0}
              </span>
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function personName(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  const o = v as { name?: string; title?: string; email?: string };
  return o.name ?? o.title ?? o.email ?? undefined;
}

type TestrunStatus = "passed" | "failed" | "skipped";

interface RunStats {
  tests_count?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  status?: string;
}

interface McpRunDetail {
  id?: string;
  title?: string;
  clean_title?: string;
  status?: string;
  kind?: string;
  rungroup_id?: string;
  rungroup?: { id?: string; title?: string } | null;
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
