/**
 * Fixture data for Storybook stories. Sampled from the live Testomat.io MCP
 * (project: codeceptjs) and then enriched with varied statuses/counts so each
 * renderer state is reachable without a backend.
 *
 * Do NOT import this from production runtime code — only stories use it.
 */

export const runsFixture = {
  data: [
    {
      id: "b2c1cf14",
      clean_title: "Manual run - Todo Tests",
      kind: "manual",
      automated: false,
      status: "passed",
      assigned_to: "davert@testomat.io",
      environment: "staging",
      tests_count: 42,
      passed_count: 38,
      failed_count: 2,
      skipped_count: 2,
      duration: 186,
      finished_at: "2026-04-21T10:12:33Z",
      labels: [{ title: "smoke" }, { title: "tier-1" }],
      branch: { title: "main" },
    },
    {
      id: "1e96784e",
      clean_title: "Hybrid release regression",
      kind: "mixed",
      status: "failed",
      assigned_to: "davert@testomat.io",
      environment: "production",
      tests_count: 60,
      passed_count: 51,
      failed_count: 7,
      skipped_count: 2,
      duration: 542,
      finished_at: "2026-04-20T18:03:12Z",
      labels: [{ title: "regression" }],
      branch: { title: "release/v2.3" },
    },
    {
      id: "e29429d0",
      clean_title: "Automated nightly run",
      kind: "automated",
      status: "running",
      tests_count: 128,
      passed_count: 74,
      failed_count: 3,
      skipped_count: 0,
      percent_marked: 60,
      automated: true,
      environment: "ci",
      branch: { title: "develop" },
    },
    {
      id: "ee074745",
      clean_title: "Manual tests at 11 Dec 2025 00:41",
      kind: "manual",
      automated: false,
      status: "skipped",
      assigned_to: "alice@testomat.io",
      environment: "",
      tests_count: 12,
      passed_count: 0,
      failed_count: 0,
      skipped_count: 12,
      duration: 0,
      finished_at: "2026-04-19T12:00:00Z",
      labels: [],
    },
    {
      id: "4497d6a3",
      clean_title: "Automated tests at 09 Dec 2025 18:51",
      kind: "automated",
      status: "queued",
      tests_count: 0,
      automated: true,
      percent_marked: 0,
      labels: [{ title: "nightly" }],
    },
  ],
  meta: { total: 199, page: 1, per_page: 5 },
};

export const testsFixture = {
  data: [
    {
      id: "4ee05b2a",
      title: "Verify new code line coverage meets the 90% minimum threshold",
      priority: "high",
      state: "automated",
      suite_title: "Unit Testing Policy",
      steps_count: 4,
      labels: [{ title: "coverage" }],
      tags: ["basic", "coverage"],
    },
    {
      id: "6fe3345a",
      title:
        "Verify all interactive elements are reachable and operable using keyboard only",
      emoji: "⌨️",
      priority: "medium",
      state: "manual",
      suite_title: "Accessibility compliance for SDG",
      steps_count: 3,
      labels: [{ title: "a11y" }, { title: "wcag" }],
    },
    {
      id: "4deea9e2",
      title: "Verify heartbeat service reports normal status continuously for 24h",
      priority: "low",
      state: "automated",
      suite_title: "High availability and uptime monitoring",
      steps_count: 3,
    },
    {
      id: "8582a07b",
      title:
        "Simulate a primary node failure and confirm automatic failover",
      priority: "high",
      state: "automated",
      suite_title: "High availability and uptime monitoring",
      steps_count: 3,
      labels: [{ title: "failover" }],
    },
    {
      id: "77fef65b",
      title: "Booster Activation Effect on Gameplay",
      emoji: "🎮",
      priority: "medium",
      state: "ready",
      suite_title: "Tic-Tac Toe Game",
    },
    {
      id: "93c8129c",
      title: "Todo Deletion and Persistence",
      priority: "medium",
      state: "automated",
      suite_title: "Persist Todos",
      steps_count: 5,
    },
    {
      id: "229fcc43",
      title: "Todos Persist After Bulk Modification and Page Reload",
      priority: "low",
      state: "automated",
      suite_title: "Persist Todos",
      steps_count: 2,
    },
    {
      id: "1d4e65fd",
      title: "Verify increased braking distance at 10% battery level",
      priority: "high",
      state: "manual",
      suite_title: "Power button tests",
      steps_count: 3,
      labels: [{ title: "hardware" }],
    },
  ],
  meta: { total: 345, page: 1, per_page: 8 },
};

export const suitesFixture = {
  data: [
    {
      id: "7c608c67",
      title: "tests-usage-examples",
      file_type: "folder" as const,
      tests_total_count: 54,
      updated_at: "2026-04-17T09:11:00Z",
    },
    {
      id: "3ad33547",
      title: "Testomat functions",
      file_type: "file" as const,
      tests_total_count: 17,
      updated_at: "2026-04-16T14:22:00Z",
      labels: [{ title: "rbac" }],
    },
    {
      id: "ebd746ef",
      title: "Logger",
      file_type: "file" as const,
      tests_total_count: 5,
      updated_at: "2026-04-15T08:00:00Z",
    },
    {
      id: "29a0d267",
      title: "Checkout",
      file_type: "file" as const,
      tests_total_count: 26,
      updated_at: "2026-04-12T19:30:00Z",
      labels: [{ title: "payments" }],
    },
    {
      id: "8a5bec48",
      title: "todomvc-tests",
      file_type: "folder" as const,
      tests_total_count: 45,
      updated_at: "2026-04-14T10:45:00Z",
    },
    {
      id: "f3ccd0d7",
      title: "Imported from TestRail",
      file_type: "file" as const,
      tests_total_count: 147,
      updated_at: "2026-03-29T16:00:00Z",
      labels: [{ title: "legacy" }],
    },
    {
      id: "fe22b5f5",
      title: "Tic-Tac Toe Game",
      emoji: "🎯",
      file_type: "file" as const,
      tests_total_count: 7,
      updated_at: "2026-04-10T11:11:00Z",
    },
    {
      id: "fb58132a",
      title: "tests",
      file_type: "folder" as const,
      tests_total_count: 76,
      updated_at: "2026-04-18T17:00:00Z",
    },
  ],
  meta: { total: 16, page: 1, per_page: 8 },
};

export const plansFixture = {
  data: [
    {
      id: "2f78e0fb",
      title: "Game Edge Cases",
      description: "Test plan for edge cases in Tic-Tac-Toe Game",
      kind: "manual",
      hidden: false,
      tests_count: 12,
      suites_count: 2,
      runs_count: 5,
      labels: [{ title: "edge-cases" }],
    },
    {
      id: "fabb6f2d",
      title: "Custom Selection",
      kind: "manual",
      hidden: true,
      tests_count: 8,
      suites_count: 0,
      runs_count: 1,
    },
    {
      id: "10a0558e",
      title: "Nightly automation",
      description: "Full automated regression pack run every night.",
      kind: "automated",
      hidden: false,
      tests_count: 312,
      suites_count: 24,
      runs_count: 47,
      labels: [{ title: "regression" }, { title: "nightly" }],
    },
    {
      id: "0f69d78d",
      title: "Release v2.3 smoke",
      description: "Tier-1 smoke tests gate for the v2.3 cut.",
      kind: "manual",
      hidden: false,
      tests_count: 24,
      suites_count: 4,
      runs_count: 3,
      labels: [{ title: "smoke" }],
    },
    {
      id: "2d0c101a",
      title: "Custom Selection",
      kind: "manual",
      hidden: true,
      tests_count: 1,
    },
  ],
  meta: { total: 51, page: 1, per_page: 5 },
};

export const testrunsFixture = {
  data: [
    {
      id: 213,
      test_title: "Text input field should be cleared after each item",
      status: "passed",
      automated: true,
      run_time: 1.24,
      environment: "chrome-headless",
      test_id: "d7e5ae4c",
      run_id: "4961cf6c",
    },
    {
      id: 214,
      test_title: "Todos containing weird characters",
      status: "failed",
      automated: true,
      run_time: 3.61,
      environment: "chrome-headless",
      run_id: "4961cf6c",
    },
    {
      id: 215,
      test_title: "Create multiple todo items",
      status: "passed",
      automated: true,
      run_time: 2.08,
      environment: "firefox",
      run_id: "4961cf6c",
    },
    {
      id: 216,
      test_title: "No todo",
      status: "skipped",
      automated: false,
      run_time: 0,
      environment: "",
      run_id: "4961cf6c",
      assigned_to: "alice@testomat.io",
    },
    {
      id: 217,
      test_title: "Create ouch another new todo item",
      status: "running",
      automated: true,
      run_time: 0,
      environment: "chrome-headless",
      run_id: "4961cf6c",
    },
    {
      id: 218,
      test_title: "Verify increased braking distance at 10% battery level",
      status: "failed",
      automated: false,
      run_time: 42.18,
      environment: "qa-rig-3",
      assigned_to: "bob@testomat.io",
    },
    {
      id: 219,
      test_title: "Booster Activation Effect on Gameplay",
      status: "passed",
      automated: false,
      run_time: 12.4,
      assigned_to: "alice@testomat.io",
    },
    {
      id: 220,
      test_title: "Manual regression: checkout with gift card",
      status: "skipped",
      automated: false,
      run_time: 0,
      assigned_to: "davert@testomat.io",
    },
  ],
  meta: { total: 2128, page: 1, per_page: 8 },
};

export const requirementsFixture = {
  data: [
    {
      id: "9f31a0",
      jira_key: "QA-142",
      title: "Checkout supports Apple Pay",
      source: "jira",
      status: "In Progress",
      url: "https://example.atlassian.net/browse/QA-142",
      tests_count: 8,
      labels: [{ title: "payments" }],
    },
    {
      id: "7b2c4d",
      jira_key: "QA-118",
      title: "Password reset email delivered within 60s",
      source: "jira",
      status: "Done",
      url: "https://example.atlassian.net/browse/QA-118",
      tests_count: 3,
    },
    {
      id: "1a8e9c",
      key: "#312",
      title: "Cart total recalculates after coupon removal",
      source: "github",
      status: "Open",
      url: "https://github.com/acme/shop/issues/312",
      tests_count: 5,
      labels: [{ title: "regression" }],
    },
    {
      id: "55d0f1",
      jira_key: "QA-87",
      title: "Braking distance below threshold at 5km/h",
      source: "jira",
      status: "Review",
      url: "https://example.atlassian.net/browse/QA-87",
      tests_count: 0,
    },
  ],
  meta: { total: 37, page: 1, per_page: 8 },
};

/* ------------------------------------------------------------------------
 * Single-item fixtures (for item renderers)
 * ------------------------------------------------------------------------ */

export const runItemFixture = {
  id: "b2c1cf14",
  clean_title: "Manual run - Todo Tests",
  title: "Manual run - Todo Tests",
  kind: "manual",
  status: "failed",
  environment: "staging",
  assigned_to: "davert@testomat.io",
  author: "Mike B.",
  started_at: "2026-06-02T02:13:00Z",
  created_at: "2026-06-02T02:12:00Z",
  tests_count: 7,
  passed_count: 3,
  failed_count: 2,
  skipped_count: 1,
  pending_count: 1,
  duration: 47.3,
  description:
    "Regression pass run manually before promoting the staging build. Two "
    + "tests failing in the Persist Todos suite need triage.",
  labels: [{ title: "smoke" }, { title: "tier-1" }],
  branch: { title: "main" },
  testruns: [
    {
      id: 301,
      test_title: "Create multiple todo items",
      suite_title: "Create Tasks",
      status: "passed",
      run_time: 2.1,
    },
    {
      id: 302,
      test_title: "Edit existing todo items",
      suite_title: "Create Tasks",
      status: "passed",
      run_time: 1.7,
    },
    {
      id: 303,
      test_title: "Todos containing weird characters",
      suite_title: "Create Tasks",
      status: "passed",
      run_time: 2.8,
    },
    {
      id: 304,
      test_title: "Todos persist after page reload",
      suite_title: "Persist Todos",
      status: "failed",
      run_time: 4.2,
      message:
        "AssertionError: expected element 'ul.todo-list > li' to have length 3, got 0. Storage was not restored on reload.",
    },
    {
      id: 305,
      test_title: "Todos persist after clearing cookies",
      suite_title: "Persist Todos",
      status: "failed",
      run_time: 3.9,
      message:
        "TimeoutError: Navigation timeout of 30000 ms exceeded when returning to /todos.",
    },
    {
      id: 306,
      test_title: "Todos persist across browser sessions",
      suite_title: "Persist Todos",
      status: "skipped",
      run_time: 0,
    },
    {
      id: 307,
      test_title: "Todos sync to the cloud backup",
      suite_title: "Persist Todos",
      status: "pending",
      run_time: 0,
    },
  ],
};

export const testrunItemFixture = {
  id: 218,
  test_id: "1d4e65fd",
  test_title: "Verify increased braking distance at 10% battery level",
  status: "failed",
  automated: false,
  environment: "qa-rig-3",
  browser: null,
  run_time: 42.18,
  assigned_to: "bob@testomat.io",
  message:
    "Braking distance measured 1.93m at 5km/h — below the 2.60m threshold the requirement expects.",
  stack: `Error: assertion failed
  at Test.fn (battery.test.ts:27:5)
  at processTicksAndRejections (node:internal/process/task_queues:96:5)`,
  steps: [
    {
      id: 1,
      number: 1,
      title: "Fully charge unit to 100%",
      status: "passed",
      duration: 12_000,
    },
    {
      id: 2,
      number: 2,
      title: "Measure baseline braking distance at 5 km/h",
      status: "passed",
      duration: 4_800,
      message: null,
    },
    {
      id: 3,
      number: 3,
      title: "Discharge battery to 10%",
      status: "passed",
      duration: 24_000,
    },
    {
      id: 4,
      number: 4,
      title: "Repeat braking test at 5 km/h",
      status: "failed",
      duration: 1_380,
      message: "Distance 1.93m < expected 2.60m (30% increase)",
    },
  ],
  assertions: [
    { status: "passed", title: "Unit reached 100% charge" },
    { status: "passed", title: "Baseline distance ≤ 2m" },
    { status: "failed", title: "Discharged distance ≥ 2.60m (observed 1.93m)" },
  ],
  artifacts: [
    "https://example.testomat.io/artifacts/run-218-brake-chart.png",
    "https://example.testomat.io/artifacts/run-218-log.txt",
  ],
};

export const testItemFixture = {
  id: "4ee05b2a",
  title: "Verify new code line coverage meets the 90% minimum threshold",
  priority: "high",
  state: "ready",
  status: null,
  suite_title: "Unit Testing Policy",
  steps_count: 4,
  runs_count: 12,
  labels: [{ title: "coverage" }, { title: "policy" }],
  description:
    "### Requirements\n"
    + "- Ensure newly added source files attain a **minimum of 90% line coverage**.\n"
    + "- Use Istanbul/nyc to generate HTML + JSON reports.\n"
    + "- Fail the build if any new file reports < 90%.\n\n"
    + "### Steps\n"
    + "1. Identify new/modified files since last release tag.\n"
    + "2. Run unit tests with coverage enabled.\n"
    + "3. Parse JSON coverage for each new file.\n"
    + "4. Assert each file's line-coverage ≥ 90%.",
  code:
    "const fs = require('fs');\n"
    + "const path = require('path');\n\n"
    + "Feature('Coverage gate');\n\n"
    + "Scenario('new files meet 90% line coverage', async ({ I }) => {\n"
    + "  const report = JSON.parse(fs.readFileSync('coverage/coverage-final.json'));\n"
    + "  const newFiles = await I.getNewFilesSinceLastTag();\n"
    + "  for (const file of newFiles) {\n"
    + "    const stat = report[path.resolve(file)];\n"
    + "    I.expect(stat.lines.pct).to.be.at.least(90,\n"
    + "      `coverage for ${file} dropped below threshold: ${stat.lines.pct}%`);\n"
    + "  }\n"
    + "});\n",
};

export const suiteItemFixture = {
  id: "3ad33547",
  title: "Testomat functions",
  file_type: "file" as const,
  parent_id: "7c608c67",
  tests_total_count: 17,
  tests_count: 17,
  description:
    "### Purpose and Objectives\n"
    + "Ensure the functionality of the core Testomat features is robust "
    + "and reliable. Improve overall quality by exercising each function.\n\n"
    + "### Scope and Coverage\n"
    + "- File upload functionality, report editing, various report formats.\n"
    + "- Multiple file types and large files.\n"
    + "- Typical use cases and edge cases.",
  labels: [{ title: "rbac" }],
  tests: testsFixture.data.slice(0, 5),
};

export const planItemFixture = {
  id: "2f78e0fb",
  title: "Game Edge Cases",
  description: "Test plan for edge cases in Tic-Tac-Toe Game.",
  kind: "manual",
  hidden: false,
  tests_count: 6,
  suites_count: 2,
  runs_count: 4,
  labels: [{ title: "edge-cases" }],
  tests: testsFixture.data.slice(4, 8),
  suites: suitesFixture.data.slice(6, 8),
};
