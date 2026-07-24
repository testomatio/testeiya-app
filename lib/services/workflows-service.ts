import { makeAutoObservable } from "mobx";
import { resolveWorkflows } from "@/lib/workflows/resolve";
import type { ResolvedWorkflowCategory, WorkflowContext } from "@/lib/workflows/types";
import type { WorkspaceType } from "./types";
import type { RootStore } from "./root-store";

/**
 * Resolves the workflow config against the live workspace + project services:
 * `requires` hides, `disabledWithout` greys-out, `disabledTooltip` explains.
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

  /** The state the workflow requirements are checked against. */
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

  /** Visible categories with their workflows' requirements already evaluated. */
  get categories(): ResolvedWorkflowCategory[] {
    return resolveWorkflows(this.context, false);
  }

  /** Every category and workflow (unfiltered) — the full schema for the diagram. */
  get schema(): ResolvedWorkflowCategory[] {
    return resolveWorkflows(this.context, true);
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
