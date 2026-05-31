"use client";

import { useCallback, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MessageActionsProps = {
  /** Markdown content to place on the clipboard. */
  content: string;
  className?: string;
};

const RESET_AFTER_MS = 1500;

/**
 * A small action bar for an assistant message. Renders a single "Copy"
 * button for now — copies the message's markdown content to the clipboard.
 */
export function MessageActions({ content, className }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), RESET_AFTER_MS);
    } catch {
      /* ignore */
    }
  }, [content]);

  if (!content) return null;

  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-60 transition-opacity hover:opacity-100",
        className
      )}
    >
      <Button
        onClick={copy}
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-2 text-[11px]"
        aria-label="Copy message as markdown"
        title="Copy as markdown"
      >
        <Icon className="size-3" />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
