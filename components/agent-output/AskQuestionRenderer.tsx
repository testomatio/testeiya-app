"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  question: string;
  options: string[];
  onPick: (option: string) => void;
  answered?: boolean;
}

/**
 * Render the agent's question as text and each option as a full-width,
 * multi-line button. Clicking one submits its exact text as a user reply.
 *
 * Options can be any length — long ones wrap to multiple lines so the
 * agent is free to include short descriptions inside each option string.
 */
export default function AskQuestionRenderer({
  question,
  options,
  onPick,
  answered,
}: Props) {
  return (
    <div className="not-prose my-4 w-full space-y-3">
      <div className="text-sm text-foreground">{question}</div>
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            type="button"
            variant="outline"
            size="sm"
            disabled={answered}
            onClick={() => onPick(opt)}
            className={cn(
              // Layout: left-aligned, multi-line, wraps
              "h-auto min-h-8 w-full justify-start whitespace-normal break-words",
              "py-2 px-3 text-left text-sm leading-snug",
              // Same hover affordance as Suggestions
              "cursor-pointer"
            )}
          >
            {opt}
          </Button>
        ))}
      </div>
    </div>
  );
}
