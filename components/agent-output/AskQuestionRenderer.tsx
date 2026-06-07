"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  question: string;
  options: string[];
  onPick: (option: string) => void;
  answered?: boolean;
  selected?: string;
}

/**
 * Render the agent's question as text and each option as a full-width,
 * multi-line button. Clicking one resolves the agent's pending `ask_question`
 * call with that exact text, and the turn continues.
 *
 * Once answered the buttons disable; the picked option stays highlighted and
 * the rest dim, so the choice remains visible in history.
 *
 * Options can be any length — long ones wrap to multiple lines so the
 * agent is free to include short descriptions inside each option string.
 */
export default function AskQuestionRenderer({
  question,
  options,
  onPick,
  answered,
  selected,
}: Props) {
  return (
    <div className="not-prose my-4 w-full space-y-3">
      <div className="text-sm text-foreground">{question}</div>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const isSelected = answered && selected === opt;
          return (
            <Button
              key={opt}
              type="button"
              variant={isSelected ? "default" : "outline"}
              size="sm"
              disabled={answered}
              onClick={() => onPick(opt)}
              className={cn(
                // Layout: left-aligned, multi-line, wraps
                "h-auto min-h-8 w-full justify-start whitespace-normal break-words",
                "py-2 px-3 text-left text-sm leading-snug",
                // Same hover affordance as Suggestions
                "cursor-pointer",
                // Dim the options the user didn't pick once answered
                answered && !isSelected && "opacity-50"
              )}
            >
              {opt}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
