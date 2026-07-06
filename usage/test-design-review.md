# Review Test Design for Flaws

The agent audits the project's test cases — vague steps, missing expected results, duplicates, overlapping coverage, skewed priorities, orphaned suites — and applies the fixes the user approves.

## Who and when

A QA lead inheriting a suite, a team preparing an audit, or anyone who suspects the test base has rotted: too many cases, unclear ownership, nobody trusts the priorities.

## Flow

1. **Ask.** "Review my test design" or a scoped variant ("audit the payments suite"). The suggestion chips on the empty chat already point here ("Review test quality...").
2. **Scan.** The agent reads the pulled `*.test.md` workspace (suites, tests, steps, priorities, tags) and cross-checks live metadata via MCP (`tests_list`, `suites_list`, `labels_list`). Skills drive the heuristics:
   - `improve-test-cases` — clarity, structure, format compliance per case.
   - `find-duplicate-cases` — duplicate and near-duplicate detection with keep/merge/remove verdicts.
   - `generate-cases` — gap detection: features or negative paths with no case at all.
3. **Report.** Findings arrive as a structured report: a summary chart (findings by severity, priority distribution pie), then per-finding entries with the affected test, the flaw, and the proposed fix. Lists render as test-list cards so each finding is clickable.
4. **Select.** The agent asks which fixes to apply through `ask_question` with `multiSelect: true` — a checklist of proposed changes with recommended ones pre-checked (this exact pattern is prescribed in `cli/src/prompt/app-ui.ts`).
5. **Apply.** The agent edits the markdown files in the workspace; edits render inline as file cards. Saved suites auto-push to Testomat.io after the debounce, or the user pushes explicitly from the Workspace panel.
6. **Verify.** A re-scan of the touched suites confirms the findings are resolved; the summary chart updates.

## Works today

- All three analysis skills ship in `@testomatio/skills` and load into every session.
- The multi-select checklist, file-edit rendering, markdown editing, and auto-push pipeline all exist (`WorkspaceService`, `FileEditRenderer`, workspace-sync).
- TQL search over tests for metadata heuristics (priority/tag/label skew).

## Missing

- A **findings model**: today the report is free-form chat text. There is no structured finding (severity, category, affected test id, proposed patch) the UI can track across the apply step, so partial application loses state.
- A **review report widget**: findings-by-severity table with apply/dismiss per row would beat re-reading a long chat message.
- **Batch apply with rollback**: applying 30 edits produces 30 file cards; one grouped changeset with a diff view and a single undo would fit better.
- Duplicate detection across **suites the workspace didn't pull** (pull is scoped by `--suite-ids`; a full-project audit needs the whole test base or server-side search).

Plan: [03 — Test design review](../plans/03-test-design-review.md)
