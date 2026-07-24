import { WORKFLOW_CATEGORIES } from "./config";
import type {
  ResolvedWorkflowCategory,
  ResolvedWorkflowPrompt,
  WorkflowCategory,
  WorkflowContext,
  WorkflowRequirement,
} from "./types";

/**
 * Evaluates the config against the live context. With `includeHidden` the full
 * schema comes back (for the overview diagram); without it, unmet `requires`
 * drop the workflow and empty categories disappear.
 */
export function resolveWorkflows(
  ctx: WorkflowContext,
  includeHidden: boolean
): ResolvedWorkflowCategory[] {
  const resolved: ResolvedWorkflowCategory[] = [];
  for (const category of WORKFLOW_CATEGORIES) {
    if (!includeHidden && category.requires && !meets(category.requires, ctx)) continue;
    const prompts = resolvePrompts(category, ctx, includeHidden);
    if (!includeHidden && prompts.length === 0) continue;
    resolved.push({
      id: category.id,
      title: category.title,
      icon: category.icon,
      prompts,
    });
  }
  return resolved;
}

function resolvePrompts(
  category: WorkflowCategory,
  ctx: WorkflowContext,
  includeHidden: boolean
): ResolvedWorkflowPrompt[] {
  const out: ResolvedWorkflowPrompt[] = [];
  for (const [rawTitle, value] of Object.entries(category.prompts)) {
    const prompt = typeof value === "string" ? { text: value } : value;
    if (!includeHidden && prompt.requires && !meets(prompt.requires, ctx)) continue;
    const disabled = prompt.disabledWithout ? !meets(prompt.disabledWithout, ctx) : false;
    let disabledTooltip: string | null = null;
    if (disabled && prompt.disabledTooltip) disabledTooltip = prompt.disabledTooltip;
    const { emoji, title } = splitEmoji(rawTitle);
    out.push({ emoji, title, text: prompt.text, disabled, disabledTooltip });
  }
  return out;
}

function meets(requirement: WorkflowRequirement, ctx: WorkflowContext): boolean {
  if (requirement === "connected") return ctx.project.connected;
  return ctx.workspace.types.includes(requirement);
}

function splitEmoji(raw: string): { emoji: string | null; title: string } {
  const match = raw.match(
    /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}\u{FE0F}\u{200D}]*)\s+([\s\S]+)$/u
  );
  if (match) return { emoji: match[1], title: match[2] };
  return { emoji: null, title: raw };
}
