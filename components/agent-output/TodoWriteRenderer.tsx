"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  CircleXIcon,
  ListTodoIcon,
  LoaderCircleIcon,
} from "lucide-react";
import type { ToolCall } from "@/hooks/use-testeiya";

const SYMBOL_STATUS: Record<string, TodoStatus> = {
  "✓": "completed",
  "→": "in_progress",
  "✗": "abandoned",
  "○": "pending",
};

const STATUS_TEXT: Record<TodoStatus, string> = {
  pending: "text-muted-foreground",
  in_progress: "font-medium text-foreground",
  completed: "text-muted-foreground line-through",
  abandoned: "text-muted-foreground line-through opacity-70",
};

/**
 * Persistent todo panel: the agent rewrites its plan via repeated `todo_write`
 * calls, so instead of one collapsible card per call we fold them into a single
 * panel that shows only the rendered checklist and updates in place. The latest
 * successful `todo_write` output carries the full cumulative state as text; we
 * parse that into phases + tasks.
 *
 * The plan also evolves across turns, so only the `current` panel stays
 * expanded — superseded ones collapse to their header (still expandable).
 */
export function TodoWriteRenderer({ tool, running, current }: Props) {
  const [userOverride, setUserOverride] = useState<boolean | undefined>(
    undefined
  );
  const open = userOverride ?? current;

  const phases = parseTodoOutput(tool.output);
  const tasks = phases.flatMap((p) => p.tasks);
  if (tasks.length === 0) return null;

  const done = tasks.filter(
    (t) => t.status === "completed" || t.status === "abandoned"
  ).length;
  const multiPhase = phases.length > 1;
  const title = multiPhase ? "Plan" : phases[0].name;

  return (
    <Collapsible
      className="group not-prose w-full rounded-md border"
      open={open}
      onOpenChange={(v) => setUserOverride(v)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-transparent px-3 py-2 group-data-[state=open]:border-b group-data-[state=open]:border-border">
        <div className="flex min-w-0 items-center gap-2">
          <ListTodoIcon className="size-4 shrink-0 text-primary" />
          <span className="truncate font-medium text-sm">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {running && (
            <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {done}/{tasks.length}
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 p-3">
        {phases.map((phase, i) => (
          <div key={`${phase.name}-${i}`} className="space-y-1.5">
            {multiPhase && (
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {phase.name}
              </div>
            )}
            <ul className="space-y-1">
              {phase.tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-sm">
                  <StatusIcon status={task.status} running={running} />
                  <span className={cn("min-w-0", STATUS_TEXT[task.status])}>
                    {task.content}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusIcon({ status, running }: { status: TodoStatus; running: boolean }) {
  if (status === "completed") {
    return <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />;
  }
  if (status === "abandoned") {
    return <CircleXIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
  }
  if (status === "in_progress") {
    return (
      <CircleDotIcon
        className={cn(
          "mt-0.5 size-4 shrink-0 text-primary",
          running && "animate-pulse"
        )}
      />
    );
  }
  return <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

// Parse the `todo_write` text summary's trailing phase listing — always the
// full state: `  <phase name>:` then `    <symbol> <id> <content>` per task.
function parseTodoOutput(output: string | undefined): TodoPhaseView[] {
  if (!output) return [];
  const phases: TodoPhaseView[] = [];
  let current: TodoPhaseView | null = null;
  for (const line of output.split("\n")) {
    const phase = /^ {2}(\S.*):$/.exec(line);
    if (phase) {
      current = { name: phase[1], tasks: [] };
      phases.push(current);
      continue;
    }
    const task = /^ {4}([✓→✗○]) (\S+) (.*)$/.exec(line);
    if (task && current) {
      current.tasks.push({
        status: SYMBOL_STATUS[task[1]],
        id: task[2],
        content: task[3].trimEnd(),
      });
    }
  }
  return phases;
}

type TodoStatus = "pending" | "in_progress" | "completed" | "abandoned";

interface TodoTask {
  id: string;
  content: string;
  status: TodoStatus;
}

interface TodoPhaseView {
  name: string;
  tasks: TodoTask[];
}

interface Props {
  tool: ToolCall;
  running: boolean;
  current: boolean;
}
