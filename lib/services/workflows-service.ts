import { makeAutoObservable } from "mobx";
import { WORKFLOW_CATEGORIES } from "@/lib/workflows/categories";
import type {
  ResolvedWorkflowCategory,
  ResolvedWorkflowPrompt,
  WorkflowCategory,
  WorkflowContext,
} from "@/lib/workflows/categories";
import type { WorkspaceType } from "./types";
import type { RootStore } from "./root-store";

/**
 * Resolves the workflow categories/prompts against the live workspace + project
 * services: `requires` hides, `disabled` greys-out, `disabledTooltip` explains.
 * The chat page injects `run` (via `setRunner`) so a picked prompt reaches the
 * agent socket, which this store doesn't own. Views stay thin observers.
 */
export class WorkflowsService {
  // Injected by the chat page; excluded from observability like SessionsService.
  runner: (text: string) => void = () => {};
  /** Whether the workflow overview diagram modal is open. */
  dialogOpen = false;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false, runner: false }, { autoBind: true });
  }

  /** The state the category predicates read. */
  get context(): WorkflowContext {
    const workspace = this.root.workspace;
    const project = this.root.project;
    const types = new Set<WorkspaceType>();
    if (workspace.workspaceType) types.add(workspace.workspaceType);
    for (const entry of workspace.types) types.add(entry.type);
    return {
      workspace: {
        types: [...types],
        open: !!workspace.sessionId,
      },
      project: {
        connected: project.currentProject != null || workspace.project != null,
      },
    };
  }

  /** Visible categories with their prompts' predicates already evaluated. */
  get categories(): ResolvedWorkflowCategory[] {
    const ctx = this.context;
    const resolved: ResolvedWorkflowCategory[] = [];
    for (const category of WORKFLOW_CATEGORIES) {
      if (category.requires && !category.requires(ctx)) continue;
      const prompts = resolvePrompts(category, ctx, false);
      if (prompts.length === 0) continue;
      resolved.push({
        id: category.id,
        title: category.title,
        icon: category.icon,
        prompts,
      });
    }
    return resolved;
  }

  /** Every category and workflow (unfiltered) — the full schema for the diagram. */
  get schema(): ResolvedWorkflowCategory[] {
    const ctx = this.context;
    return WORKFLOW_CATEGORIES.map((category) => ({
      id: category.id,
      title: category.title,
      icon: category.icon,
      prompts: resolvePrompts(category, ctx, true),
    }));
  }

  run(text: string): void {
    this.runner(text);
  }

  setRunner(runner: (text: string) => void): void {
    this.runner = runner;
  }

  setDialogOpen(open: boolean): void {
    this.dialogOpen = open;
  }
}

function resolvePrompts(
  category: WorkflowCategory,
  ctx: WorkflowContext,
  includeHidden: boolean
): ResolvedWorkflowPrompt[] {
  const out: ResolvedWorkflowPrompt[] = [];
  for (const [rawTitle, value] of Object.entries(category.prompts)) {
    const prompt = typeof value === "string" ? { text: value } : value;
    if (!includeHidden && prompt.requires && !prompt.requires(ctx)) continue;
    const disabled = prompt.disabled ? prompt.disabled(ctx) : false;
    let disabledTooltip: string | null = null;
    if (disabled && prompt.disabledTooltip) disabledTooltip = prompt.disabledTooltip(ctx);
    const { emoji, title } = splitEmoji(rawTitle);
    out.push({ emoji, title, text: prompt.text, disabled, disabledTooltip });
  }
  return out;
}

function splitEmoji(raw: string): { emoji: string | null; title: string } {
  const match = raw.match(
    /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}\u{FE0F}\u{200D}]*)\s+([\s\S]+)$/u
  );
  if (match) return { emoji: match[1], title: match[2] };
  return { emoji: null, title: raw };
}
