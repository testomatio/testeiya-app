# Requirements Traceability

The agent maps requirements (Testomat.io requirements, Jira epics, GitHub issues) to test cases, shows the coverage matrix, and generates cases for uncovered requirements.

## Who and when

A team that must demonstrate coverage per requirement (regulated domains, enterprise clients); a lead checking that a feature's acceptance criteria all have tests before sign-off.

## Flow

1. **Ask.** "Which requirements have no tests?" or "show coverage for the Q3 epic".
2. **Pull requirements.** The agent reads requirements via MCP (`requirements_list`) and linked external issues (`issues_list` — GitHub/Jira sources); for a Jira epic it can pull children through the Atlassian MCP.
3. **Map.** Existing links come from `*_issues_list` per test/suite; for unlinked pairs the agent matches by content — requirement text against test titles/steps in the workspace markdown — and proposes links.
4. **Matrix.** The result renders as a coverage matrix: requirements × test status (covered / partial / uncovered), with a summary chart (covered share as a pie, uncovered count by area as bars).
5. **Fill gaps.** For uncovered requirements the agent generates cases (`generate-cases` skill reads the requirement text as the spec), the user approves via multi-select, cases are written and pushed, and links are created (`tests_issues_link`).
6. **Keep current.** Re-running the flow after each sprint shows the delta; the matrix is reproducible because links live in Testomat.io, not in chat.

## Works today

- MCP: `requirements_list/get/create/update/delete/search` (with file uploads), `issues_*`, and issue↔test/suite/plan linking.
- Case generation from a spec, markdown write + push, multi-select approval.
- The "Requirements" tile and list in the UI — but backed by the `issues` resource, not `requirements`.

## Missing

- **UI access to requirements**: the proxy whitelist has `issues` but not `requirements` (`cli/src/api/testomatio-proxy.ts`); the sidebar "Requirements" tab actually lists issues. The two entities need untangling in both proxy and UI.
- **A coverage matrix view**: no widget renders requirement×test coverage; `render_list` kinds don't include requirements.
- **A server-side traceability query**: building the matrix today means N+1 calls (`issues_list` per test). A single endpoint returning requirement→tests mappings would make the matrix cheap (see [platform gaps](../plans/platform-gaps.md)).
- **Link provenance**: agent-proposed content matches should be marked as such until a human confirms them.

Plan: [07 — Requirements traceability](../plans/07-requirements-traceability.md)
