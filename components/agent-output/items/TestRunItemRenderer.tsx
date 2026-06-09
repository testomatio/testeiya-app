"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Test,
  TestError,
  TestErrorMessage,
  TestErrorStack,
  TestResults,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
} from "@/components/ai-elements/test-results";
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon, PaperclipIcon } from "@/lib/icons";
import { formatDuration, MetaPill, RunStatusDot, statusKind } from "../status-pill";
import { resolveType, TypeIcon } from "../type-icons";

interface McpTestRunDetail {
  id?: string;
  run_id?: string;
  test_id?: string;
  test_title?: string;
  title?: string;
  test?: { title?: string };
  status?: string;
  message?: string;
  stack?: string;
  run_time?: number;
  duration?: number;
  automated?: boolean;
  environment?: string | null;
  browser?: string | null;
  assigned_to?: string | null;
  steps?: McpStep[];
  assertions?: unknown[];
  artifacts?: string[];
}

interface McpStep {
  id?: string | number;
  number?: number;
  title?: string;
  name?: string;
  status?: string;
  message?: string | null;
  duration?: number;
}

function stepDurationMs(v?: number): number | undefined {
  if (v == null) return undefined;
  // Step durations are typically already ms.
  return v >= 1000 ? v : v * 1000;
}

export default function TestRunItemRenderer({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const tr = data as McpTestRunDetail;
  const title =
    tr.test_title ?? tr.title ?? tr.test?.title ?? tr.id ?? "(untitled)";
  const duration = tr.run_time ?? tr.duration;
  const steps = tr.steps ?? [];
  const stepPassed = steps.filter((s) => statusKind(s.status) === "passed").length;
  const stepFailed = steps.filter((s) => statusKind(s.status) === "failed").length;
  const stepSkipped = steps.filter(
    (s) => statusKind(s.status) === "skipped"
  ).length;
  const assertions = Array.isArray(tr.assertions) ? tr.assertions : [];
  const artifacts = Array.isArray(tr.artifacts) ? tr.artifacts : [];

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          {(() => {
            const kind = resolveType({ automated: tr.automated });
            return kind ? <TypeIcon type={kind} /> : null;
          })()}
          <div className="text-base font-semibold">{title}</div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {tr.status && (
            <span className="inline-flex items-center gap-1">
              <RunStatusDot status={tr.status} />
              <span className="capitalize text-muted-foreground">
                {tr.status}
              </span>
            </span>
          )}
          {tr.environment && <MetaPill>{tr.environment}</MetaPill>}
          {tr.browser && <MetaPill>{tr.browser}</MetaPill>}
          {duration != null && (
            <span className="text-muted-foreground tabular-nums">
              {formatDuration(duration)}
            </span>
          )}
        </div>
      </div>

      {tr.message && statusKind(tr.status) === "failed" && (
        <TestResults>
          <div className="p-3">
            <TestError>
              <TestErrorMessage>{tr.message}</TestErrorMessage>
              {tr.stack && <TestErrorStack>{tr.stack}</TestErrorStack>}
            </TestError>
          </div>
        </TestResults>
      )}

      {steps.length > 0 && (
        <TestSuite
          name={`Steps (${steps.length})`}
          status={stepFailed > 0 ? "failed" : "passed"}
          defaultOpen={stepFailed > 0}
        >
          <div className="flex w-full items-center gap-2 pr-2">
            <TestSuiteName>Steps</TestSuiteName>
            <TestSuiteStats
              passed={stepPassed}
              failed={stepFailed}
              skipped={stepSkipped}
            />
          </div>
          <TestSuiteContent>
            {steps.map((s, i) => {
              const name =
                s.title ?? s.name ?? `Step ${s.number ?? i + 1}`;
              return (
                <div key={s.id ?? i}>
                  <Test
                    name={name}
                    status={statusKind(s.status)}
                    duration={stepDurationMs(s.duration)}
                  />
                  {s.message && statusKind(s.status) === "failed" && (
                    <div className="px-4 pb-3">
                      <TestError>
                        <TestErrorMessage>{s.message}</TestErrorMessage>
                      </TestError>
                    </div>
                  )}
                </div>
              );
            })}
          </TestSuiteContent>
        </TestSuite>
      )}

      {assertions.length > 0 && (
        <Collapsible className="rounded-lg border">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50">
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            Assertions ({assertions.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="divide-y text-sm">
              {assertions.map((a, i) => {
                const aobj = (a ?? {}) as Record<string, unknown>;
                const atext =
                  (aobj.title as string) ??
                  (aobj.message as string) ??
                  JSON.stringify(aobj);
                const astatus = aobj.status as string | undefined;
                return (
                  <li key={i} className="flex items-start gap-2 px-4 py-2">
                    <RunStatusDot status={astatus ?? "passed"} />
                    <span className="flex-1 break-words">{atext}</span>
                  </li>
                );
              })}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      )}

      {artifacts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {artifacts.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex"
            >
              <Badge variant="outline" className="gap-1 text-[11px]">
                <PaperclipIcon className="size-3" />
                artifact {i + 1}
              </Badge>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
