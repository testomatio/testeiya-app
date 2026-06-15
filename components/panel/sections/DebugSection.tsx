"use client";

import { observer } from "mobx-react-lite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, Trash2Icon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionShell } from "../SectionShell";
import { useDebugLogService } from "@/lib/services/StoreProvider";
import type { ExternalLogEntry } from "@/lib/debug/external-log";
import type { PanelSectionProps } from "@/lib/panel/types";

export const DebugSection = observer(function DebugSection({
  active,
}: PanelSectionProps) {
  const debug = useDebugLogService();

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
    <SectionShell title="Debug — external requests" active={active} actions={actions}>
      {debug.entries.length === 0 && (
        <p className="p-4 text-muted-foreground text-xs">
          No external requests yet. Testomat.io API calls made by the UI appear
          here (and in the browser console).
        </p>
      )}
      <div className="flex flex-col">
        {debug.entries.map((entry) => (
          <LogRow key={entry.id} entry={entry} />
        ))}
      </div>
    </SectionShell>
  );
});

function LogRow({ entry }: { entry: ExternalLogEntry }) {
  const failed = entry.error !== null || (entry.status !== null && entry.status >= 400);
  return (
    <details className="group border-b text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-muted/50">
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
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
