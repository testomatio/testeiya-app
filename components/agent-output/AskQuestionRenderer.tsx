"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface Props {
  question: string;
  options: string[];
  onPick: (option: string) => void;
  answered?: boolean;
  selected?: string;
  multiSelect?: boolean;
  recommended?: number[];
}

/**
 * Render the agent's question as text and each option as a full-width,
 * multi-line button. Clicking one resolves the agent's pending `ask_question`
 * call with that exact text, and the turn continues.
 *
 * Once answered the buttons collapse to a compact, read-only chip that prints
 * the picked option, so the choice stays visible in history without lingering
 * as a live, clickable form while the agent keeps working.
 *
 * When `multiSelect` is set the options render as checkboxes with a Submit
 * button (see `AskChecklist`): the user ticks several items and submits them
 * joined by newlines as a single answer. `recommended` indices start checked.
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
  multiSelect,
  recommended,
}: Props) {
  if (answered) {
    return (
      <div className="not-prose my-4 w-full space-y-2">
        <div className="text-sm text-foreground">{question}</div>
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="whitespace-pre-wrap break-words text-foreground">
            You answered: {answerText(selected)}
          </span>
        </div>
      </div>
    );
  }

  if (multiSelect) {
    return (
      <AskChecklist
        question={question}
        options={options}
        recommended={recommended}
        onPick={onPick}
      />
    );
  }

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
            onClick={() => onPick(opt)}
            className={cn(
              "h-auto min-h-8 w-full justify-start whitespace-normal break-words",
              "py-2 px-3 text-left text-sm leading-snug",
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

function AskChecklist({
  question,
  options,
  recommended,
  onPick,
}: {
  question: string;
  options: string[];
  recommended?: number[];
  onPick: (value: string) => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(() =>
    options.map((_, i) => recommended?.includes(i) ?? false)
  );

  const selectedCount = checked.filter(Boolean).length;
  const allChecked = selectedCount === options.length;

  const toggle = (i: number) =>
    setChecked((prev) => prev.map((c, idx) => (idx === i ? !c : c)));

  const toggleAll = () => setChecked(options.map(() => !allChecked));

  const submit = () => onPick(options.filter((_, i) => checked[i]).join("\n"));

  return (
    <div className="not-prose my-4 w-full space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-foreground">{question}</div>
        <button
          type="button"
          onClick={toggleAll}
          className="shrink-0 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
        >
          {allChecked ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={cn(
              "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left",
              "cursor-pointer text-sm leading-snug transition-colors hover:bg-muted/50",
              checked[i]
                ? "border-primary/40 bg-primary/5"
                : "border-transparent bg-muted/30"
            )}
          >
            <Icon
              name={checked[i] ? "check_box" : "check_box_outline_blank"}
              className={cn(
                "mt-0.5 size-4 shrink-0",
                checked[i] ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span className="whitespace-normal break-words text-foreground">
              {opt}
            </span>
          </button>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={selectedCount === 0}
        className="cursor-pointer"
      >
        {selectedCount === 0
          ? "Select at least one"
          : `Submit ${selectedCount} selected`}
      </Button>
    </div>
  );
}

function answerText(value?: string): string {
  if (!value) return "Answered";
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return value;
  try {
    const obj = JSON.parse(trimmed) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = obj.content
      ?.filter((c) => c?.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");
    return text || value;
  } catch {
    return value;
  }
}
