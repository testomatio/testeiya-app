"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckIcon, EditIcon, Icon } from "@/lib/icons";
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
 * multi-line split button: the main area answers with that option, the
 * trailing segment toggles a note textarea so the user can qualify their
 * pick — the answer is then sent as the option text followed by a
 * `Note: <comment>` line. Below the options there is always a free-form
 * "Write your own answer" row, so the user is never locked into the fixed
 * list.
 *
 * Once answered the buttons collapse to a compact, read-only chip that prints
 * the picked option, so the choice stays visible in history without lingering
 * as a live, clickable form while the agent keeps working.
 *
 * When `multiSelect` is set the options render as checkboxes with a Submit
 * button (see `AskChecklist`): the user ticks several items and submits them
 * joined by newlines as a single answer. `recommended` indices start checked.
 * Checklist rows take per-option notes too, and a trailing input row lets the
 * user add their own item to the submission.
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
  const [noteFor, setNoteFor] = useState(-1);
  const [note, setNote] = useState("");

  if (answered) {
    return (
      <div className="not-prose my-4 w-full space-y-2">
        <div className="text-sm text-foreground">{question}</div>
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
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

  const pick = (opt: string, i: number) => {
    const text = noteFor === i ? note.trim() : "";
    onPick(text ? `${opt}\nNote: ${text}` : opt);
  };

  const toggleNote = (i: number) => {
    setNote("");
    setNoteFor(noteFor === i ? -1 : i);
  };

  return (
    <div className="not-prose my-4 w-full space-y-3">
      <div className="text-sm text-foreground">{question}</div>
      <div className="flex flex-col gap-2">
        {options.map((opt, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div
              className={cn(
                "flex w-full items-stretch overflow-hidden rounded-lg border bg-background",
                "transition-colors dark:border-input dark:bg-input/30",
                noteFor === i && "border-primary/40"
              )}
            >
              <button
                type="button"
                onClick={() => pick(opt, i)}
                className={cn(
                  "min-h-10 flex-1 cursor-pointer px-3.5 py-2.5 text-left text-sm leading-snug",
                  "whitespace-normal break-words text-foreground outline-none transition-colors",
                  "hover:bg-muted focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50 dark:hover:bg-input/50"
                )}
              >
                {opt}
              </button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={
                        noteFor === i ? "Remove note" : "Answer with a note"
                      }
                      onClick={() => toggleNote(i)}
                      className={cn(
                        "flex cursor-pointer items-center border-l px-3 outline-none transition-colors",
                        "hover:bg-muted focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50 dark:hover:bg-input/50",
                        noteFor === i
                          ? "border-primary/40 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon name="add_comment" className="size-4" />
                    </button>
                  }
                />
                <TooltipContent>
                  <p>{noteFor === i ? "Remove note" : "Answer with a note"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {noteFor === i && (
              <AnswerInput
                value={note}
                onChange={setNote}
                onSubmit={() => pick(opt, i)}
                placeholder="Add a note to this answer…"
              />
            )}
          </div>
        ))}
        <OwnAnswer onPick={onPick} />
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
  const [notes, setNotes] = useState<string[]>(() => options.map(() => ""));
  const [noteOpen, setNoteOpen] = useState<boolean[]>(() =>
    options.map(() => false)
  );
  const [own, setOwn] = useState("");

  const ownText = own.trim();
  const selectedCount = checked.filter(Boolean).length + (ownText ? 1 : 0);
  const allChecked = checked.every(Boolean);

  const toggle = (i: number) =>
    setChecked((prev) => prev.map((c, idx) => (idx === i ? !c : c)));

  const toggleAll = () => setChecked(options.map(() => !allChecked));

  const toggleNote = (i: number) => {
    if (!noteOpen[i] && !checked[i]) toggle(i);
    setNoteOpen((prev) => prev.map((o, idx) => (idx === i ? !o : o)));
  };

  const setNote = (i: number, value: string) =>
    setNotes((prev) => prev.map((n, idx) => (idx === i ? value : n)));

  const submit = () => {
    const parts: string[] = [];
    options.forEach((opt, i) => {
      if (!checked[i]) return;
      const text = noteOpen[i] ? notes[i].trim() : "";
      parts.push(text ? `${opt}\nNote: ${text}` : opt);
    });
    if (ownText) parts.push(ownText);
    onPick(parts.join("\n"));
  };

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
      <div className="flex flex-col gap-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div
              className={cn(
                "flex w-full items-stretch overflow-hidden rounded-lg border transition-colors",
                checked[i]
                  ? "border-primary/40 bg-primary/5"
                  : "border-transparent bg-muted/30"
              )}
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                className={cn(
                  "flex min-h-10 flex-1 cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left",
                  "text-sm leading-snug outline-none transition-colors hover:bg-muted/50",
                  "focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50"
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
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={noteOpen[i] ? "Remove note" : "Add a note"}
                      onClick={() => toggleNote(i)}
                      className={cn(
                        "flex cursor-pointer items-center px-3 outline-none transition-colors",
                        "hover:bg-muted/50 focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50",
                        noteOpen[i]
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon name="add_comment" className="size-4" />
                    </button>
                  }
                />
                <TooltipContent>
                  <p>{noteOpen[i] ? "Remove note" : "Add a note"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {noteOpen[i] && (
              <Textarea
                autoFocus
                value={notes[i]}
                onChange={(e) => setNote(i, e.target.value)}
                placeholder="Add a note to this option…"
                className="min-h-9 text-sm"
              />
            )}
          </div>
        ))}
        <div
          className={cn(
            "flex min-h-10 w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5",
            "text-sm leading-snug transition-colors",
            ownText
              ? "border-primary/40 bg-primary/5"
              : "border-dashed bg-muted/30"
          )}
        >
          <Icon
            name={ownText ? "check_box" : "check_box_outline_blank"}
            className={cn(
              "size-4 shrink-0",
              ownText ? "text-primary" : "text-muted-foreground"
            )}
          />
          <input
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (selectedCount === 0) return;
              submit();
            }}
            placeholder="Add your own option…"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
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

function OwnAnswer({ onPick }: { onPick: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-dashed px-3.5 py-2.5",
          "cursor-pointer text-left text-sm leading-snug text-muted-foreground outline-none",
          "transition-colors hover:bg-muted/50 hover:text-foreground",
          "focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50"
        )}
      >
        <EditIcon className="size-4 shrink-0" />
        Write your own answer…
      </button>
    );
  }

  return (
    <AnswerInput
      requireText
      value={text}
      onChange={setText}
      onSubmit={() => onPick(text.trim())}
      placeholder="Type your answer…"
    />
  );
}

function AnswerInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  requireText,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  requireText?: boolean;
}) {
  const canSend = !requireText || value.trim().length > 0;
  return (
    <div className="flex items-end gap-2">
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          e.preventDefault();
          if (canSend) onSubmit();
        }}
        placeholder={placeholder}
        className="min-h-9 flex-1 text-sm"
      />
      <Button
        type="button"
        size="sm"
        disabled={!canSend}
        onClick={onSubmit}
        className="cursor-pointer"
      >
        Answer
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
