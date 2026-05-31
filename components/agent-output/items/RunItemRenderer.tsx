"use client";

import {
  Test,
  TestError,
  TestErrorMessage,
  TestResults,
  TestResultsContent,
  TestResultsDuration,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
} from "@/components/ai-elements/test-results";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useTestomatio } from "@/lib/agent-output/use-testomatio";
import { formatDuration, LabelsRow, MetaPill, statusKind } from "../status-pill";
import { resolveType, TypeIcon } from "../type-icons";

interface McpRunDetail {
  id?: string;
  title?: string;
  clean_title?: string;
  status?: string;
  kind?: string;
  environment?: string | null;
  env?: string | null;
  assigned_to?: string | null;
  tests_count?: number;
  passed_count?: number;
  failed_count?: number;
  skipped_count?: number;
  pending_count?: number;
  duration?: number;
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

function durationMs(v?: number): number | undefined {
  if (v == null) return undefined;
  // TestResults expects milliseconds; Testomat.io run_time is seconds.
  return v >= 1000 ? v : v * 1000;
}

export default function RunItemRenderer({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const run = data as McpRunDetail;
  const title = run.title ?? run.clean_title ?? run.id ?? "(untitled run)";
  const passed = run.passed_count ?? 0;
  const failed = run.failed_count ?? 0;
  const skipped = (run.skipped_count ?? 0) + (run.pending_count ?? 0);
  const total = run.tests_count ?? passed + failed + skipped;
  const durMs = durationMs(run.duration);
  const env = run.environment ?? run.env ?? undefined;
  const branch =
    typeof run.branch === "string" ? run.branch : run.branch?.title ?? undefined;

  // Enrichment: the v2 Run schema doesn't nest testruns, so when the caller
  // didn't hand us any we fetch them via the proxy. If a WorkspaceProvider
  // isn't wrapping us (e.g. /preview without ?session) the hook is a no-op.
  const preloaded = run.testruns ?? run.tests ?? [];
  const {
    data: fetched,
    loading: testrunsLoading,
    error: testrunsError,
  } = useTestomatio<McpNestedTestRun[]>(
    "testruns",
    { run_id: run.id, per_page: 100 },
    { skip: !run.id || preloaded.length > 0 }
  );
  const nested: McpNestedTestRun[] =
    preloaded.length > 0 ? preloaded : fetched ?? [];
  // Group testruns by suite_title for the drill-down view.
  const bySuite = new Map<string, McpNestedTestRun[]>();
  for (const t of nested) {
    const key = t.suite_title ?? t.suite_id ?? "Tests";
    const arr = bySuite.get(key) ?? [];
    arr.push(t);
    bySuite.set(key, arr);
  }

  const hasSummary = total > 0 || durMs != null;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          {(() => {
            const kind = resolveType({ kind: run.kind });
            return kind ? <TypeIcon type={kind} /> : null;
          })()}
          <div className="text-base font-semibold">{title}</div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          {env && <MetaPill title="environment">{env}</MetaPill>}
          {branch && <MetaPill title="branch">{branch}</MetaPill>}
          {run.assigned_to && <MetaPill>{run.assigned_to}</MetaPill>}
          <LabelsRow labels={run.labels} />
        </div>
        {run.description && (
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
            {run.description}
          </p>
        )}
        {testrunsLoading && (
          <div className="mt-2 text-xs">
            <Shimmer as="span">Loading test runs…</Shimmer>
          </div>
        )}
        {testrunsError && !testrunsLoading && (
          <p className="mt-2 text-xs text-muted-foreground">
            Couldn&apos;t load test runs — {testrunsError}
          </p>
        )}
      </div>

      {hasSummary && (
        <TestResults
          summary={{
            passed,
            failed,
            skipped,
            total: total || 1, // avoid divide-by-zero in the progress bar
            duration: durMs,
          }}
        >
          <TestResultsHeader>
            <TestResultsSummary />
            <TestResultsDuration>
              {formatDuration(run.duration) ?? undefined}
            </TestResultsDuration>
          </TestResultsHeader>
          {total > 0 && (
            <TestResultsContent>
              <TestResultsProgress />
            </TestResultsContent>
          )}
        </TestResults>
      )}

      {nested.length > 0 && (
        <div className="space-y-2">
          {Array.from(bySuite.entries()).map(([suiteName, list]) => {
            const suitePassed = list.filter(
              (t) => statusKind(t.status) === "passed"
            ).length;
            const suiteFailed = list.filter(
              (t) => statusKind(t.status) === "failed"
            ).length;
            const suiteSkipped = list.filter(
              (t) => statusKind(t.status) === "skipped"
            ).length;
            const suiteStatus =
              suiteFailed > 0 ? "failed" : suitePassed > 0 ? "passed" : "skipped";
            return (
              <TestSuite
                key={suiteName}
                name={suiteName}
                status={suiteStatus}
                defaultOpen={suiteFailed > 0}
              >
                <div className="flex w-full items-center gap-2 pr-2">
                  <TestSuiteName>{suiteName}</TestSuiteName>
                  <TestSuiteStats
                    passed={suitePassed}
                    failed={suiteFailed}
                    skipped={suiteSkipped}
                  />
                </div>
                <TestSuiteContent>
                  {list.map((t, i) => {
                    const testTitle =
                      t.test_title ?? t.title ?? t.id ?? "(untitled)";
                    const dms = durationMs(t.run_time ?? t.duration);
                    return (
                      <div key={t.id ?? `${suiteName}-${i}`}>
                        <Test
                          name={testTitle}
                          status={statusKind(t.status)}
                          duration={dms}
                        />
                        {t.message && statusKind(t.status) === "failed" && (
                          <div className="px-4 pb-3">
                            <TestError>
                              <TestErrorMessage>{t.message}</TestErrorMessage>
                            </TestError>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </TestSuiteContent>
              </TestSuite>
            );
          })}
        </div>
      )}
    </div>
  );
}
