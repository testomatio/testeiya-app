"use client";

import { Fragment } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon, ArrowRightIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ResolvedWorkflowCategory, ResolvedWorkflowPrompt } from "@/lib/workflows/types";

export function WorkflowsDiagram({
  categories,
  onRun,
  className,
}: {
  categories: ResolvedWorkflowCategory[];
  onRun?: (text: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-8 p-8 sm:p-10", className)}>
      <div className="space-y-2 pr-8">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          From requirement to release
        </h2>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
          Testeiya walks a feature through five stages — clarify the requirement,
          shape the tests, automate them, run them in CI, then learn from the
          release. Each stage bundles ready-made workflows; pick one to start it
          in the chat.
        </p>
      </div>
      <div className="flex items-start gap-2 overflow-x-auto pb-1">
        {categories.map((category, index) => (
          <Fragment key={category.id}>
            <Stage category={category} onRun={onRun} />
            {index < categories.length - 1 && (
              <ArrowRightIcon className="mt-5 size-6 shrink-0 text-muted-foreground/40" />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Stage({
  category,
  onRun,
}: {
  category: ResolvedWorkflowCategory;
  onRun?: (text: string) => void;
}) {
  return (
    <div className="flex min-w-[150px] flex-1 flex-col gap-4">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10">
          <Icon name={category.icon} className="size-7" />
        </span>
        <span className="text-base leading-tight font-semibold text-pretty">
          {category.title}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 border-t pt-3">
        {category.prompts.map((prompt) => (
          <WorkflowRow key={prompt.title} prompt={prompt} onRun={onRun} />
        ))}
      </div>
    </div>
  );
}

function WorkflowRow({
  prompt,
  onRun,
}: {
  prompt: ResolvedWorkflowPrompt;
  onRun?: (text: string) => void;
}) {
  const row = (
    <button
      type="button"
      disabled={prompt.disabled}
      onClick={() => onRun?.(prompt.text)}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[15px] leading-snug text-foreground/75 transition-colors",
        "hover:bg-primary/5 hover:text-foreground focus-visible:bg-primary/5 focus-visible:text-foreground focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center text-base leading-none">
        {prompt.emoji}
      </span>
      <span className="min-w-0 flex-1 text-pretty">{prompt.title}</span>
    </button>
  );
  if (!prompt.disabled || !prompt.disabledTooltip) return row;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block w-full">{row}</span>} />
      <TooltipContent>
        <p>{prompt.disabledTooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
