---
name: testomatio-docs
description: The official Testomat.io product documentation, vendored as searchable markdown. Use whenever the user asks how Testomat.io works — test management, suites and tests, runs, reports and execution, manual and automated testing, TQL, tags/labels/custom fields, milestones, plans, branches, imports and exports, CI/issue-tracker/SSO integrations, reporter setup, users and permissions, plans and billing — or asks where something is in the Testomat.io interface, or uses a Testomat.io term you cannot define with certainty (rungroup, pipe, detached test, shared step, environment, merge strategy, living doc, bulk edit, artifact). Search the docs before answering; never answer a Testomat.io platform question from memory.
---

# Testomat.io documentation

The full product documentation of Testomat.io, vendored from
[testomatio/docs](https://github.com/testomatio/docs) at build time. It is on disk — no network
needed.

## Layout

- `INDEX.md` — every page as `` `<file>` — **Title** — <public URL> — description ``.
- `docs/<file>` — the page itself, mirroring the paths in the index.
- `docs.lock.json` — the source commit these pages were vendored from.

Reach them through `skill://testomatio-docs/<path>` — it resolves to this skill's directory in
`bash` and `read` alike.

## How to search

1. **Grep `INDEX.md` first** — titles and descriptions carry most feature keywords, and one hit
   gives you the file, the public URL and a summary at once:

   ```bash
   grep -i '<term>' skill://testomatio-docs/INDEX.md
   ```

2. **Then grep the pages** when the index misses:

   ```bash
   grep -ril '<term>' skill://testomatio-docs/docs
   ```

   Try the user's wording *and* the product's (a user's "folder" is a **suite**, "ticket" is an
   **issue**, "test case" may be a **test** or a **shared step**).

3. **Read the matching page** — `read skill://testomatio-docs/docs/<file>` — before answering.
   Follow links between pages when a page defers to another.

Never answer from memory when the question is about the platform — the product changes, these
files do not lie. If the docs genuinely do not cover it, say so plainly instead of guessing.

## Testeiya is a client, not the web app

Testeiya is a standalone client for the same Testomat.io backend the docs describe. Three
consequences, and they matter for every answer you give from these pages:

### 1. Every documented feature exists and works

The docs describe the platform, and the user's project runs on that platform. Do not hedge with
"if your plan supports it" or "this may not be available" — assume any documented capability is
real. Know the full feature set: it is what the user is entitled to and what you can help them
use.

### 2. The interface in the docs is the **web app's**, not Testeiya's

Screenshots, menus, tabs, buttons, "click the ⋮ next to the suite" — none of that describes
Testeiya's own UI. Testeiya has a chat, a file tree and a markdown editor; it does not reproduce
the web app's screens.

So when an answer is about *where to click* or *what a screen looks like*:

- Never instruct the user to find something inside Testeiya because the docs said so — the
  control is not here and they will hunt for it.
- Point them at their Testomat.io host instead, resolved in this order:
  1. `baseUrl` in the workspace's `.testeiya/testeiya.json` (this is the project's real host —
     self-hosted installs are not `app.testomat.io`),
  2. the `TESTOMATIO_URL` environment variable,
  3. `https://app.testomat.io` as the default.
- Say it explicitly — "in the Testomat.io web app at `<host>`, open …" — so the user knows they
  are switching tools.
- Cite the public docs URL from `INDEX.md`, never the local file path or a `skill://` URI.

### 3. Prefer doing the thing over describing where to click

A large share of what the docs present as UI work you can perform on the user's behalf:

- **Testomat.io MCP tools** — read and modify tests, suites, runs, testruns, plans, labels and
  tags directly (`tests_*`, `suites_*`, `runs_*`, `testruns_*`, `plans_*`, `labels_*`, `tags_*`,
  plus CRUD). See the `testomatio-mcp` skill.
- **`check-tests` pull/push** — sync test cases between the project and local `*.test.md` files.
  See the `check-tests` skill.

Check what your tools actually cover before answering. Offer the action first and the manual
web-app route second; fall back to "here is where it is in the web app" only when no tool reaches
it (billing, SSO, project settings, plugin installs, and anything else purely administrative).

## Unfamiliar terms

If the user uses a Testomat.io term whose exact meaning you are not sure of, grep the docs before
you reply. Guessing at product vocabulary produces confidently wrong answers — a *run group* is
not a *plan*, a *label* is not a *tag*, and a *detached* test is not a *deleted* one.

## Answer shape

- Lead with the answer, then the steps or the tool call.
- Link the public docs URL for anything the user may want to read in full.
- When the answer involves the web app, name the host you are sending them to.
- When a documented feature needs setup the workspace does not have yet (a reporter, a CI profile,
  an integration), say what is missing rather than assuming it is configured.
