import type { WorkspaceType } from "@/lib/services/types";

/**
 * A declarative gate for a workflow or category: a workspace type that must be
 * present, or "connected" — a Testomat.io project is linked to the workspace.
 */
export type WorkflowRequirement = WorkspaceType | "connected";

export type WorkflowPrompt =
  | string
  | {
      text: string;
      /** Hide the workflow until the requirement is met. */
      requires?: WorkflowRequirement;
      /** Show the workflow greyed-out and unclickable until the requirement is met. */
      disabledWithout?: WorkflowRequirement;
      /** Hint shown while the workflow is disabled. */
      disabledTooltip?: string;
    };

export interface WorkflowCategory {
  id: string;
  title: string;
  /** Material Symbols Rounded ligature name (see @/lib/icons). */
  icon: string;
  requires?: WorkflowRequirement;
  /** "emoji short title" → message printed to chat (may reference /skill-name). */
  prompts: Record<string, WorkflowPrompt>;
}

/** State the requirements are checked against, filled by WorkflowsService from the store. */
export interface WorkflowContext {
  workspace: {
    /** Classification types present: manual, automated, mixed, code, files. */
    types: WorkspaceType[];
    /** A workspace/session is open. */
    open: boolean;
  };
  project: {
    /** A Testomat.io project is connected to this workspace. */
    connected: boolean;
  };
}

/** A category with its requirements evaluated — what the UI renders. */
export interface ResolvedWorkflowCategory {
  id: string;
  title: string;
  icon: string;
  prompts: ResolvedWorkflowPrompt[];
}

export interface ResolvedWorkflowPrompt {
  /** Leading emoji split off the title (null when the title has none). */
  emoji: string | null;
  title: string;
  text: string;
  disabled: boolean;
  disabledTooltip: string | null;
}
