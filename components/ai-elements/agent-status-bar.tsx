"use client";

import { Shimmer } from "./shimmer";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Square } from "lucide-react";

export type AgentStatusBarProps = {
  /** One of "ready" | "connecting" | "submitted" | "streaming" */
  status: "ready" | "connecting" | "submitted" | "streaming";
  /** Name of the currently-running tool, if any. */
  activeTool?: string | null;
  /** Optional stop button handler. */
  onStop?: () => void;
  className?: string;
};

function prettyToolLabel(name: string): string {
  // mcp_testomatio_<slug>_<section>_<action> → "section.action"
  if (name.startsWith("mcp_testomatio_")) {
    const parts = name.split("_");
    // ['mcp','testomatio','<slug words...>','<section>','<action>']
    const action = parts[parts.length - 1];
    const section = parts[parts.length - 2];
    return `${section}.${action}`;
  }
  return name;
}

function describe(
  status: AgentStatusBarProps["status"],
  tool?: string | null
): string {
  if (status === "connecting") return "Connecting to Testeiya…";
  if (tool) return `Running: ${prettyToolLabel(tool)}`;
  if (status === "submitted") return "Thinking…";
  if (status === "streaming") return "Responding…";
  return "";
}

/**
 * Thin status strip pinned above the prompt input. Shows what the agent is
 * doing right now (tool name / thinking / streaming) so the user sees
 * progress even when the chat is long and the reasoning block is closed.
 * Hidden when `status === "ready"`.
 */
export function AgentStatusBar({
  status,
  activeTool,
  onStop,
  className,
}: AgentStatusBarProps) {
  if (status === "ready") return null;
  const label = describe(status, activeTool);
  if (!label) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Spinner className="size-3 shrink-0" />
        <Shimmer as="span" className="truncate">
          {label}
        </Shimmer>
      </div>
      {onStop && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={onStop}
          title="Stop the agent"
        >
          <Square className="size-3" />
          Stop
        </Button>
      )}
    </div>
  );
}
