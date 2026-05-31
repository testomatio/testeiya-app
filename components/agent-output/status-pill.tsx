"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  mdiCheckCircle,
  mdiCircle,
  mdiMinusCircle,
  mdiRecordCircle,
  mdiTimerOffOutline,
} from "@mdi/js";
import type { ReactNode } from "react";

export type TestStatus = "passed" | "failed" | "skipped" | "running";

// Collapses Testomat.io's varied status strings (passed, failed, skipped,
// in_progress, manual, draft, active, finished, ready, deprecated, …) to
// the four buckets <TestResults> recognizes. Anything unknown maps to
// "skipped" (neutral-warning) so failed states don't get lost.
export function statusKind(raw?: string): TestStatus {
  if (!raw) return "skipped";
  const s = raw.toLowerCase();
  if (s === "passed" || s === "finished" || s === "active" || s === "ready") {
    return "passed";
  }
  if (s === "failed" || s === "error") return "failed";
  if (s === "running" || s === "in_progress" || s === "started") return "running";
  return "skipped";
}

/** Neutral grey pill for non-status metadata (kind, env, priority). */
export function MetaPill({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  if (children == null || children === "" || children === false) return null;
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "h-5 rounded-md px-1.5 py-0 text-[11px] font-normal leading-none capitalize",
        className
      )}
    >
      {children}
    </Badge>
  );
}

export function LabelsRow({
  labels,
  className,
}: {
  labels?: unknown;
  className?: string;
}) {
  const list = Array.isArray(labels) ? (labels as unknown[]) : [];
  if (list.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {list.map((l, i) => {
        const title =
          typeof l === "string"
            ? l
            : String(
                (l as { title?: string; name?: string })?.title ??
                  (l as { name?: string })?.name ??
                  ""
              );
        if (!title) return null;
        return (
          <Badge
            key={`${title}-${i}`}
            variant="outline"
            className="h-5 rounded-md px-1.5 py-0 text-[11px] font-normal leading-none"
          >
            {title}
          </Badge>
        );
      })}
    </div>
  );
}

export function formatDuration(v?: number | string | null): string | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  // Runs store seconds, step timings store milliseconds — disambiguate by
  // magnitude: anything < 1000 is treated as seconds, anything >= 1000 is ms.
  const totalSeconds = n >= 1000 ? n / 1000 : n;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(totalSeconds < 10 ? 2 : 1)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds - m * 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/* ------------------------------------------------------------------------
 * Run-specific primitives, modelled on the Ember frontend's
 * list-run/statuses.hbs, list-run/progress.hbs, and run-status.js.
 * ------------------------------------------------------------------------ */

type CountTone = "pass" | "fail" | "skip";

const COUNT_PALETTE: Record<CountTone, string> = {
  pass: "bg-status-success text-status-success-foreground",
  fail: "bg-status-error text-status-error-foreground",
  skip: "bg-status-warning text-status-warning-foreground",
};

/**
 * Fixed-width (40px) rounded-full count pill. Matches
 * `list-run/statuses.hbs` — `w-10 px-2 py-0.5 text-xs font-medium leading-none`.
 * Dims to 30% opacity when the value is zero/missing.
 */
export function StatusCount({
  value,
  tone,
  title,
  className,
}: {
  value?: number;
  tone: CountTone;
  title?: string;
  className?: string;
}) {
  const n = value ?? 0;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-10 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium leading-none",
        COUNT_PALETTE[tone],
        n === 0 && "opacity-30",
        className
      )}
    >
      {n}
    </span>
  );
}

/**
 * Pass/fail/skip count triplet — three `<StatusCount>` pills in a row.
 * Replaces the old inline "passed · failed / total" text we had.
 */
export function StatusTriplet({
  passed,
  failed,
  skipped,
  className,
}: {
  passed?: number;
  failed?: number;
  skipped?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <StatusCount value={passed} tone="pass" title="passed" />
      <StatusCount value={failed} tone="fail" title="failed" />
      <StatusCount value={skipped} tone="skip" title="skipped" />
    </div>
  );
}

// 1:1 with frontend/app/components/run-status.js — pick the MDI glyph
// that matches a Testomat.io run status.
function mdiPathFor(status: string): string {
  switch (status) {
    case "passed":
      return mdiCheckCircle;
    case "failed":
      return mdiMinusCircle;
    case "skipped":
      return mdiRecordCircle;
    case "terminated":
      return mdiTimerOffOutline;
    default:
      return mdiCircle;
  }
}

// Maps to the `.run-status.{status}` rules from list-runs.scss. Uses the
// `--run-*` CSS vars so dark-mode picks the *Dark-500 tones automatically.
const RUN_STATUS_COLOR: Record<string, string> = {
  passed: "text-run-passed",
  failed: "text-run-failed",
  skipped: "text-run-skipped",
  terminated: "text-run-terminated",
  pending: "text-run-pending",
  queued: "text-run-pending",
  running: "text-run-running",
};

/**
 * Status icon that leads a row's title. Ports
 * frontend/app/components/run-status.hbs exactly:
 *   - running → a 14px CSS spinner (`.run-status-loader`)
 *   - anything else → 16px MDI glyph tinted via `--run-{status}`
 */
export function RunStatusDot({
  status,
  className,
  title,
}: {
  status?: string;
  className?: string;
  title?: string;
}) {
  const s = (status ?? "").toLowerCase();
  const tooltip = title ?? status ?? "status";

  // 16x16 slot matches `.run-status-slot` from list-runs.scss.
  const slot = cn(
    "inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle",
    className
  );

  if (s === "running" || s === "in_progress" || s === "started") {
    return (
      <span className={slot} aria-label={tooltip} title={tooltip}>
        <span className="run-status-loader" />
      </span>
    );
  }

  const colorClass = RUN_STATUS_COLOR[s] ?? "text-run-pending";
  return (
    <span className={cn(slot, colorClass)} aria-label={tooltip} title={tooltip}>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden
      >
        <path d={mdiPathFor(s)} />
      </svg>
    </span>
  );
}


/**
 * Thin progress bar matching `list-run/progress.hbs`:
 * `w-20 h-1.5 rounded-full bg-muted` + indigo fill.
 */
export function RunProgress({
  percent,
  automated,
  className,
}: {
  percent?: number;
  automated?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  // Hide when an automated run hasn't started — frontend does the same.
  if (pct === 0 && automated) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs leading-none tabular-nums text-muted-foreground">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
