"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, Trash2Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionShell } from "../SectionShell";
import { useDebugLogService } from "@/lib/services/StoreProvider";
import type {
  DebugLogEntry,
  EventLogEntry,
  RequestLogEntry,
} from "@/lib/debug/external-log";
import type { PanelSectionProps } from "@/lib/panel/types";

type Filter = "all" | "request" | "event";

export const DebugSection = observer(function DebugSection({
  active,
}: PanelSectionProps) {
  const debug = useDebugLogService();
  const [filter, setFilter] = useState<Filter>("all");

  const entries = debug.entries
    .filter((e) => filter === "all" || e.kind === filter)
    .sort((a, b) => b.ts - a.ts);

  const actions = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear log"
            disabled={debug.entries.length === 0}
            onClick={() => debug.clear()}
          >
            <Trash2Icon className="size-4" />
          </Button>
        }
      />
      <TooltipContent><p>Clear log</p></TooltipContent>
    </Tooltip>
  );

  return (
    <SectionShell title="Debug — activity" active={active} actions={actions}>
      <FilterBar filter={filter} onChange={setFilter} entries={debug.entries} />
      <p className="border-b px-3 py-1.5 text-[10px] text-muted-foreground">
        Testomat.io requests + responses are saved (re-runnable) to{" "}
        <code className="font-mono">cli/log/testomatio.http</code>
      </p>
      {entries.length === 0 && (
        <p className="p-4 text-muted-foreground text-xs">
          No activity yet. API requests, Testomat.io calls, and agent events
          appear here (and in the browser console).
        </p>
      )}
      <div className="flex flex-col">
        {entries.map((entry) =>
          entry.kind === "event" ? (
            <EventRow key={`${entry.channel}:${entry.id}`} entry={entry} />
          ) : (
            <RequestRow key={`${entry.channel}:${entry.id}`} entry={entry} />
          )
        )}
      </div>
    </SectionShell>
  );
});

function FilterBar({
  filter,
  onChange,
  entries,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  entries: DebugLogEntry[];
}) {
  const requests = entries.filter((e) => e.kind === "request").length;
  const events = entries.length - requests;
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: entries.length },
    { id: "request", label: "Requests", count: requests },
    { id: "event", label: "Events", count: events },
  ];
  return (
    <div className="flex gap-1 border-b px-3 py-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            filter === t.id
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {t.label}
          <span className="tabular-nums opacity-60">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

function RequestRow({ entry }: { entry: RequestLogEntry }) {
  const failed = entry.error !== null || (entry.status !== null && entry.status >= 400);
  return (
    <details className="group border-b text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-muted/50">
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
          {clock(entry.ts)}
        </span>
        <Badge variant="outline" className="shrink-0 px-1 text-[9px] uppercase tracking-wide">
          {entry.channel === "api" ? "api" : "tmt"}
        </Badge>
        <span className="w-9 shrink-0 font-mono font-semibold text-muted-foreground">
          {entry.method}
        </span>
        <Badge variant={failed ? "destructive" : "secondary"} className="shrink-0 tabular-nums">
          {entry.error ? "ERR" : entry.status}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground [direction:rtl] text-left">
          {requestPath(entry.url)}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{entry.durationMs}ms</span>
      </summary>
      <div className="space-y-2 px-3 pb-3 pt-1">
        <Field label="URL" value={entry.url} />
        {entry.requestBody && <Field label="Request" value={entry.requestBody} />}
        {entry.error && <Field label="Error" value={entry.error} tone="error" />}
        {entry.responseBody && <Field label="Response" value={entry.responseBody} tone={failed ? "error" : "default"} />}
      </div>
    </details>
  );
}

function EventRow({ entry }: { entry: EventLogEntry }) {
  const failed = !entry.ok;
  return (
    <details className="group border-b text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-muted/50">
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
          {clock(entry.ts)}
        </span>
        <Badge variant="outline" className="shrink-0 px-1 text-[9px] uppercase tracking-wide">
          evt
        </Badge>
        <span className="shrink-0 font-mono font-semibold text-foreground">
          {entry.name}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {entry.summary}
        </span>
        {failed && <Badge variant="destructive" className="shrink-0">ERR</Badge>}
      </summary>
      {entry.detail && (
        <div className="space-y-2 px-3 pb-3 pt-1">
          <Field label="Payload" value={entry.detail} tone={failed ? "error" : "default"} />
        </div>
      )}
    </details>
  );
}

function Field({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "error";
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre
        className={
          tone === "error"
            ? "max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-destructive/10 p-2 font-mono text-[11px] text-destructive"
            : "max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px] text-foreground"
        }
      >
        {value}
      </pre>
    </div>
  );
}

function requestPath(url: string): string {
  try {
    const u = new URL(url, "http://x");
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function clock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
}
