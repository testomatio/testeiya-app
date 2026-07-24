// Workflow config — the ready-made prompts the Workflows panel and diagram offer.
//
// Edit freely. Categories are QA lifecycle stages (shown in order); each
// workflow is `"emoji short title": "message printed to chat"` (reference
// skills with /skill-name). To gate a workflow on the workspace or project,
// use an object with a declarative requirement instead of a plain string:
//   requires: "code" | "manual" | "automated" | "mixed" | "files" | "connected"
//     -> hidden until the workspace has that type ("connected" = a Testomat.io
//        project is linked)
//   disabledWithout: <same values> (+ disabledTooltip: "hint")
//     -> shown greyed-out and unclickable until met
// Types live in ./types, resolution logic in ./resolve.

import type { WorkflowCategory } from "./types";

export const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
  {
    id: "analysis-planning",
    title: "Analysis & Planning",
    icon: "assignment",
    prompts: {
      "🔍 Review requirements": "Review my requirements /qa-requirement-reviewer",
      "⚠️ Risk-based focus": "Find the highest-risk areas to test /qa-thinking",
      "🔀 Analyze PR requirements": {
        text: "Analyze requirements from this pull request /qa-pr-requirements-analyzer",
        requires: "code",
      },
      "🔬 Analyze PR diff": {
        text: "Analyze changes in this pull request /pull-request-diff-analyzer",
        requires: "code",
      },
    },
  },
  {
    id: "test-design-management",
    title: "Test Design & Management",
    icon: "checklist",
    prompts: {
      "✍️ Write test cases": "Write new test cases for this project /qa-write-test-cases",
      "✨ Improve test cases": "Improve my existing test cases /improve-test-cases",
      "🔁 Find duplicates": "Find duplicate test cases /detect-duplicate-test-cases",
      "🔄 Sync to Testomat.io": {
        text: "Sync my test cases with Testomat.io /sync-test-cases-with-tms",
        disabledWithout: "connected",
        disabledTooltip: "Connect a Testomat.io project to sync",
      },
    },
  },
  {
    id: "test-execution-automation",
    title: "Test Execution & Automation",
    icon: "automation",
    prompts: {
      "🤖 Automate test cases": {
        text: "Automate my manual test cases /automate-manual-test-cases",
        requires: "manual",
      },
      "🔧 Fix flaky tests": {
        text: "Debug and fix failing or flaky tests /debug-fix-failed-flaky-autotests",
        requires: "code",
      },
      "🔎 Scan project": {
        text: "Scan my automation project /scan-automation-project",
        requires: "code",
      },
    },
  },
  {
    id: "reporting-ci-quality-gates",
    title: "Reporting, CI/CD & Quality Gates",
    icon: "rocket_launch",
    prompts: {
      "📈 Set up reporting": "Set up Testomat.io reporting for my tests /qa-e2e-tests-reporting",
      "🛠️ Fix CI tests": {
        text: "Fix failing tests in CI /ci-fix-tests",
        requires: "code",
      },
      "🗺️ Map coverage": {
        text: "Map my e2e test coverage /e2e-test-coverage-mapping",
        requires: "code",
      },
    },
  },
  {
    id: "metrics-release-analytics",
    title: "Metrics, Release & Analytics",
    icon: "insights",
    prompts: {
      "📊 Analyze runs": {
        text: "Analyze my latest test runs /codeceptjs-run-analysis",
        requires: "connected",
      },
      "🚑 Triage failures": {
        text: "Triage failures from the latest run /testomatio-mcp",
        requires: "connected",
      },
    },
  },
];
