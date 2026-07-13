// Workflow categories — the QA lifecycle stages Testeiya guides you through.
//
// Edit freely. Each workflow is `"emoji short title": "message printed to chat"`
// (reference skills with /skill-name). A workflow may instead be an object to
// gate it on the workspace/project via `WorkflowContext`:
//   requires(ctx)        -> show the workflow/category only when true
//   disabled(ctx)        -> show it greyed-out and unclickable when true
//   disabledTooltip(ctx) -> the hint shown while it is disabled
// The context is filled by WorkflowsService from the live store services.

import type { WorkspaceType } from "@/lib/services/types";

export const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
  {
    id: "requirements",
    title: "Requirements",
    icon: "assignment",
    prompts: {
      "🔍 Review requirements": "Review my requirements /qa-requirement-reviewer",
      "⚠️ Risk-based focus": "Find the highest-risk areas to test /qa-thinking",
      "🔀 Analyze PR requirements": {
        text: "Analyze requirements from this pull request /qa-pr-requirements-analyzer",
        requires: (ctx) => ctx.workspace.types.includes("code"),
      },
    },
  },
  {
    id: "test-cases",
    title: "Test Cases",
    icon: "checklist",
    prompts: {
      "✍️ Write test cases": "Write new test cases for this project /qa-write-test-cases",
      "✨ Improve test cases": "Improve my existing test cases /improve-test-cases",
      "🔁 Find duplicates": "Find duplicate test cases /detect-duplicate-test-cases",
      "🔄 Sync to Testomat.io": {
        text: "Sync my test cases with Testomat.io /sync-test-cases-with-tms",
        disabled: (ctx) => !ctx.project.connected,
        disabledTooltip: () => "Connect a Testomat.io project to sync",
      },
    },
  },
  {
    id: "automation",
    title: "Automation",
    icon: "automation",
    prompts: {
      "🤖 Automate test cases": {
        text: "Automate my manual test cases /automate-manual-test-cases",
        requires: (ctx) => ctx.workspace.types.includes("manual"),
      },
      "🗺️ Map coverage": {
        text: "Map my e2e test coverage /e2e-test-coverage-mapping",
        requires: (ctx) => ctx.workspace.types.includes("code"),
      },
      "🔧 Fix flaky tests": {
        text: "Debug and fix failing or flaky tests /debug-fix-failed-flaky-autotests",
        requires: (ctx) => ctx.workspace.types.includes("code"),
      },
      "🔎 Scan project": {
        text: "Scan my automation project /scan-automation-project",
        requires: (ctx) => ctx.workspace.types.includes("code"),
      },
    },
  },
  {
    id: "run-ci",
    title: "Run / CI",
    icon: "rocket_launch",
    prompts: {
      "📈 Set up reporting": "Set up Testomat.io reporting for my tests /qa-e2e-tests-reporting",
      "🛠️ Fix CI tests": {
        text: "Fix failing tests in CI /ci-fix-tests",
        requires: (ctx) => ctx.workspace.types.includes("code"),
      },
    },
  },
  {
    id: "releases-analysis",
    title: "Releases / Analysis",
    icon: "insights",
    prompts: {
      "📊 Analyze runs": {
        text: "Analyze my latest test runs /codeceptjs-run-analysis",
        requires: (ctx) => ctx.project.connected,
      },
      "🚑 Triage failures": {
        text: "Triage failures from the latest run /testomatio-mcp",
        requires: (ctx) => ctx.project.connected,
      },
      "🔬 Analyze PR diff": {
        text: "Analyze changes in this pull request /pull-request-diff-analyzer",
        requires: (ctx) => ctx.workspace.types.includes("code"),
      },
    },
  },
];

export type WorkflowPredicate = (ctx: WorkflowContext) => boolean;
export type WorkflowHint = (ctx: WorkflowContext) => string;

export type WorkflowPrompt =
  | string
  | {
      text: string;
      requires?: WorkflowPredicate;
      disabled?: WorkflowPredicate;
      disabledTooltip?: WorkflowHint;
    };

export interface WorkflowCategory {
  id: string;
  title: string;
  /** Material Symbols Rounded ligature name (see @/lib/icons). */
  icon: string;
  requires?: WorkflowPredicate;
  /** "emoji short title" → message printed to chat (may reference /skill-name). */
  prompts: Record<string, WorkflowPrompt>;
}

/** State the predicates read, filled by WorkflowsService from the store. */
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

/** A category with its predicates evaluated — what the UI renders. */
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
