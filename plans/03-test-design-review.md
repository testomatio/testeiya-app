# Plan 03 — Test Design Review

Structure the existing review skills into an audit with a findings model, a report widget, and a select-and-apply loop — so "review my test design" produces tracked, batch-applied improvements instead of a long chat essay.

Usage flow: [../usage/test-design-review.md](../usage/test-design-review.md)

## Current state

- Skills exist and load: `improve-test-cases`, `find-duplicate-cases`, `generate-cases` (gap detection).
- Apply pipeline exists: agent edits `*.test.md` → `FileEditRenderer` cards → debounced auto-push (`WorkspaceService`).
- Selection UX exists: `ask_question` `multiSelect` with `recommended` pre-checks.
- Missing: any structured finding representation; the report is prose.

## Implementation

### 1. Findings file format

The agent writes findings to `.testeiya/reviews/<date>-design-review.md` — one markdown file, one finding per section with a small frontmatter-ish header the UI can parse:

```markdown
## [DR-012] Vague expected result — @T3fa9c210 "User can export report"
severity: medium · category: clarity · file: suites/reports.test.md
The final step has no *Expected*: line; pass/fail is undefined.
**Proposed fix:** add explicit expected result after step 4.
```

Plain markdown keeps it agent-writable, human-readable, and diffable; no new API needed. Categories: `clarity`, `duplicate`, `coverage-gap`, `priority`, `structure`, `orphan`.

### 2. `design-review` skill

A skill that orchestrates the pass:

1. Inventory the workspace (`*.test.md` parse) + live metadata (`tests_list`, `suites_list`) for priority/tag distribution.
2. Run heuristics per category, reusing the existing skills' criteria (reference them rather than duplicating: the skill instructs running `improve-test-cases` and `find-duplicate-cases` scoped to the workspace).
3. Emit the findings file + a chat summary: severity bar chart, category pie, top findings.
4. Ask which to apply (`multiSelect`, grouped by category, high severity pre-checked).
5. Apply selected fixes file-by-file; mark applied findings in the findings file (`status: applied`).
6. Re-scan touched files; report resolved/remaining.

Scope guard: if the workspace was pulled with `--suite-ids`, say so — the audit covers pulled suites only.

### 3. Review report widget (optional, second pass)

A `review` widget kind that renders the findings file as a table (severity, category, test, status) with per-row Apply/Dismiss that round-trips through the agent (`ui_widget` actions `apply_finding`, `dismiss_finding`). Ship the skill first; the widget only after the format proves stable.

### 4. Push discipline

Batch the applies: suppress the per-save auto-push during an apply session and push once at the end (`WorkspaceService.sync("push")` with the touched files), so Testomat.io sees one changeset. Needs a small flag on the auto-push debounce path.

## Platform dependencies

- C3 (`push --dry-run`) would let the report preview upstream effects of fixes; not blocking.
- Full-project audits beyond pulled suites need either a full pull or server-side search — acceptable to defer.

## Risks

- Finding drift: files edited between scan and apply invalidate line-based findings — anchor findings to `@T` ids and headings, never line numbers (the `test-md.ts` block model already works this way).
- Over-eager rewrites — the skill must propose minimal edits per case, mirroring the "smallest change possible" rule.

## Effort

M for format + skill; S for push batching; M for the widget (deferred).
