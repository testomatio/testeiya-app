"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { toPlain } from "@/lib/debug/store-snapshot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, CopyIcon, Icon, Trash2Icon } from "@/lib/icons";
import { openExternalUrl } from "@/lib/testomatio-url";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionShell } from "../SectionShell";
import { useDebugLogService, useStores } from "@/lib/services/StoreProvider";
import type {
  AiLogEntry,
  EventLogEntry,
  RequestLogEntry,
} from "@/lib/debug/external-log";
import type { PanelSectionProps } from "@/lib/panel/types";

type View = "store" | "requests" | "cli";

const STORYBOOK_URL =
  process.env.NEXT_PUBLIC_STORYBOOK_URL ?? "http://localhost:6006";
const SHOW_STORYBOOK =
  process.env.NODE_ENV === "development" ||
  !!process.env.NEXT_PUBLIC_STORYBOOK_URL;

export const DebugSection = observer(function DebugSection({
  active,
}: PanelSectionProps) {
  const debug = useDebugLogService();
  const [view, setView] = useState<View>("requests");

  const requests = debug.entries.filter((e) => e.kind === "request");
  const cli = debug.entries.filter((e) => e.kind !== "request");
  const entries = (view === "cli" ? cli : requests).sort((a, b) => b.ts - a.ts);

  const storybookAction = SHOW_STORYBOOK && (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open Storybook"
            onClick={() => void openExternalUrl(STORYBOOK_URL)}
          >
            <Icon name="web_stories" className="size-4" />
          </Button>
        }
      />
      <TooltipContent><p>Open Storybook</p></TooltipContent>
    </Tooltip>
  );

  const copyAction = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy logs"
            disabled={debug.entries.length === 0}
            onClick={() => void debug.copyLogs()}
          >
            <CopyIcon className="size-4" />
          </Button>
        }
      />
      <TooltipContent><p>Copy logs</p></TooltipContent>
    </Tooltip>
  );

  const clearAction = (
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
    <SectionShell
      title="Debug"
      active={active}
      titleAccessory={
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList className="h-7">
            <TabsTrigger value="store" className="px-2">
              Store
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1 px-2">
              Requests
              <span className="text-xs tabular-nums opacity-60">{requests.length}</span>
            </TabsTrigger>
            <TabsTrigger value="cli" className="gap-1 px-2">
              CLI
              <span className="text-xs tabular-nums opacity-60">{cli.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
      actions={
        <>
          {storybookAction}
          {copyAction}
          {view !== "store" && clearAction}
        </>
      }
    >
      {view === "store" ? (
        <StoreInspector />
      ) : (
        <>
          {view === "requests" && (
            <p className="border-b px-3 py-1.5 text-[10px] text-muted-foreground">
              Testomat.io requests + responses are saved (re-runnable) to{" "}
              <code className="font-mono">cli/log/testomatio.http</code>
            </p>
          )}
          {entries.length === 0 && (
            <p className="p-4 text-muted-foreground text-xs">
              {view === "requests"
                ? "No requests yet. Same-origin /api calls and outbound Testomat.io calls appear here."
                : "No activity yet. Agent events, LLM calls, and check-tests runs appear here."}
            </p>
          )}
          <div className="flex flex-col">
            {entries.map((entry) =>
              entry.kind === "request" ? (
                <RequestRow key={`${entry.channel}:${entry.id}`} entry={entry} />
              ) : (
                <EventRow key={`${entry.channel}:${entry.id}`} entry={entry} />
              )
            )}
          </div>
        </>
      )}
    </SectionShell>
  );
});

const StoreInspector = observer(function StoreInspector() {
  const store = useStores();
  const services = Object.entries(store).filter(
    ([, v]) => v && typeof v === "object" && "root" in v
  );

  return (
    <>
      <p className="border-b px-3 py-1.5 text-[10px] text-muted-foreground">
        Live MobX store state — expand a service to inspect (updates in real
        time).
      </p>
      <div className="flex flex-col">
        {services.map(([name, service]) => (
          <StoreRow key={name} name={name} service={service} />
        ))}
      </div>
    </>
  );
});

const StoreRow = observer(function StoreRow({
  name,
  service,
}: {
  name: string;
  service: object;
}) {
  const [open, setOpen] = useState(false);
  const fieldCount = Object.keys(service).length - 1;
  const data = open ? toPlain(service) : null;
  return (
    <div className="border-b text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        <span className="font-mono font-semibold text-foreground">{name}</span>
        <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
          {fieldCount} fields
        </span>
      </button>
      {open && data && (
        <div className="px-3 pb-3 pt-1 font-mono text-[11px] leading-[1.7]">
          {Object.keys(data).map((key) => (
            <JsonNode key={key} name={key} value={data[key]} />
          ))}
        </div>
      )}
    </div>
  );
});

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

function EventRow({ entry }: { entry: EventLogEntry | AiLogEntry }) {
  const failed = !entry.ok;
  return (
    <details className="group border-b text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-muted/50">
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
          {clock(entry.ts)}
        </span>
        <Badge variant="outline" className="shrink-0 px-1 text-[9px] uppercase tracking-wide">
          {channelTag(entry.channel)}
        </Badge>
        <span className="shrink-0 font-mono font-semibold text-foreground">
          {entry.name}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {entry.summary}
        </span>
        {entry.kind === "ai" && entry.durationMs !== null && (
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {entry.durationMs}ms
          </span>
        )}
        {failed && <Badge variant="destructive" className="shrink-0">ERR</Badge>}
      </summary>
      {entry.detail && (
        <div className="space-y-2 px-3 pb-3 pt-1">
          {entry.kind === "ai" && entry.tokens && (
            <div className="text-[10px] tabular-nums text-muted-foreground">
              tokens: {entry.tokens.input} in · {entry.tokens.output} out ·{" "}
              {entry.tokens.total} total
            </div>
          )}
          <Field label="Payload" value={entry.detail} tone={failed ? "error" : "default"} />
        </div>
      )}
    </details>
  );
}

function channelTag(channel: EventLogEntry["channel"] | AiLogEntry["channel"]): string {
  if (channel === "check-tests") return "ct";
  if (channel === "ai") return "ai";
  if (channel === "console") return "js";
  return "evt";
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

function JsonNode({ name, value }: { name: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const expandable =
    value !== null && typeof value === "object" && Object.keys(value).length > 0;

  if (!expandable) {
    return (
      <div className="flex items-start gap-1.5 px-1 py-px">
        <span className="w-3 shrink-0" aria-hidden />
        <span className="shrink-0 text-primary">{name}:</span>
        <JsonLeaf value={value} />
      </div>
    );
  }

  const entries = Object.entries(value as object);
  const meta = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-px text-left hover:bg-muted/50"
      >
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/60 transition-transform",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        <span className="text-primary">{name}</span>
        <span className="text-muted-foreground/50">{meta}</span>
      </button>
      {open && (
        <div className="ml-[6.5px] border-l border-border/60 pl-2.5">
          {entries.map(([key, child]) => (
            <JsonNode key={key} name={key} value={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function JsonLeaf({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted-foreground/70">null</span>;
  if (Array.isArray(value)) return <span className="text-muted-foreground/70">[]</span>;
  if (typeof value === "object") return <span className="text-muted-foreground/70">{"{}"}</span>;
  if (typeof value === "string")
    return <span className="break-all text-foreground">&quot;{value}&quot;</span>;
  return <span className="break-all text-foreground">{String(value)}</span>;
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
