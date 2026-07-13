"use client";

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ResolvedWorkflowCategory, ResolvedWorkflowPrompt } from "@/lib/workflows/categories";

export function WorkflowPrompts({
  category,
  onRun,
  layout = "wrap",
  streaming,
  multiline,
}: {
  category: ResolvedWorkflowCategory;
  onRun: (text: string) => void;
  layout?: "wrap" | "stack";
  streaming?: boolean;
  multiline?: boolean;
}) {
  if (layout === "stack") {
    return (
      <div className="flex flex-col gap-1.5">
        {category.prompts.map((prompt) => (
          <PromptRow
            key={prompt.title}
            prompt={prompt}
            onRun={onRun}
            streaming={streaming}
            multiline={multiline}
          />
        ))}
      </div>
    );
  }
  return (
    <Suggestions>
      {category.prompts.map((prompt) => (
        <PromptChip key={prompt.title} prompt={prompt} onRun={onRun} streaming={streaming} />
      ))}
    </Suggestions>
  );
}

function PromptChip({
  prompt,
  onRun,
  streaming,
}: {
  prompt: ResolvedWorkflowPrompt;
  onRun: (text: string) => void;
  streaming?: boolean;
}) {
  const chip = (
    <Suggestion suggestion={prompt.text} onClick={onRun} disabled={prompt.disabled || streaming}>
      {prompt.emoji ? `${prompt.emoji} ${prompt.title}` : prompt.title}
    </Suggestion>
  );
  if (!prompt.disabled || !prompt.disabledTooltip) return chip;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{chip}</span>} />
      <TooltipContent>
        <p>{prompt.disabledTooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function PromptRow({
  prompt,
  onRun,
  streaming,
  multiline,
}: {
  prompt: ResolvedWorkflowPrompt;
  onRun: (text: string) => void;
  streaming?: boolean;
  multiline?: boolean;
}) {
  const row = (
    <button
      type="button"
      disabled={prompt.disabled || streaming}
      onClick={() => onRun(prompt.text)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors",
        "hover:border-primary/30 hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-base leading-none">
        {prompt.emoji}
      </span>
      <span className={cn("min-w-0 flex-1", multiline ? "text-pretty" : "truncate")}>
        {prompt.title}
      </span>
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
