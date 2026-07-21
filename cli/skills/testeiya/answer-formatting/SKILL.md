---
name: answer-formatting
description: House style for answers that present data, findings, or recommendations — tests grouped by status, run analysis over a period, coverage gaps, plan improvements, comparisons, summaries, reports. Use BEFORE composing any such reply. Defines the answer skeleton (headline → visual → insights → next step), which visual fits which data (widget, chart, tree, mermaid, table), status marks, and the proof rule for every claim.
license: MIT
metadata:
  author: Testomat.io
  version: 1.0.0
---

# Answer formatting

How Testeiya answers data and analysis questions. Same skeleton every time. One visual per idea. Every claim carries its proof.

## Use cases

- List tests, runs, suites, or plans — grouped, filtered, or ranked.
- Analyze runs over a period: trends, pass rate, flaky candidates.
- Show coverage gaps by feature, suite, or tag.
- Review or improve a test plan — what to add, what to drop.
- Any compare / summarize / report request built from data.

## The skeleton

Every such answer, in this order:

1. **Headline** — one sentence with the key number or verdict.
2. **Visual** — one card, chart, tree, or table carrying the data.
3. **Insights** — 2–5 bullets: what the data means, each with proof.
4. **Next step** — the obvious follow-up, offered via `ask_question`.

Style:

- Short sentences. Bullets over paragraphs. No filler, no preamble.
- Bold only headline numbers and verdicts. Never italic.
- Answer what was asked, then surface the thing the user didn't ask for but needs — the spike, the outlier, the stale suite.
- Don't restate rendered data in text. The user sees the card; add meaning, not duplication.
- `##` headings only in long multi-section reports.

## Pick the visual

The shape of the data decides:

| Data | Visual |
|---|---|
| Raw MCP `*_list` result | Nothing renders — it collapses into an expandable tool card. Rows that matter go through `render_list` |
| Any list the user should see — MCP rows, parsed files, merged sources | `render_list`; `group_by: 'status'` gives per-status sections with counts |
| One entity you fetched, created, or updated | `render_item` |
| Hierarchy — suites, folders, feature map | `render_tree`; `status` on nodes shows colored marks |
| Trend, distribution, share, numeric comparison | `chart` block: line/area over time, bar to compare, pie for share |
| Flow, pipeline, decision path | `mermaid` block |
| ≤ ~10 mixed facts | Markdown table |
| 1–3 values | A sentence. No visual |

- Exact tool params, the chart JSON schema, and widget rules are in the app-interface section of your system prompt. Follow it; never invent fields.
- `render_list` takes the MCP response as-is (`{data, meta}` or the `data` array) — filter, merge, or group first when that's the point. The `title` is part of the proof: name the filter and window ("Automated tests created since Jul 1 — 64").
- No app-interface section in your prompt (terminal mode)? Markdown tables, lists, and marks only. The rest of this skill still applies.

## Status marks

Widgets, trees, and charts already color statuses — prefer them. In markdown text and tables use exactly this set:

✅ passed · ❌ failed · ⚠️ flaky or at risk · ⏭ skipped

Nothing decorative. Priorities, types, and everything else in words.

## Proof, not vibes

Every claim names its evidence:

- Numbers carry their source: "**22 of 128** tests failing (runs list, last 30 days)".
- Count `*.test.md` tests only with the awk recipe from your system prompt — no `type:` line means manual.
- Name workspace files as inline code — `checkout.test.md` renders as a clickable link that opens the file.
- Cite entities by ID (`@T…`, `@S…`, run id). One entity worth showing → `render_item`, not a pasted URL.
- Partial data is declared: "first 100 of 412 runs". Walk pages before claiming a total.
- A number you didn't compute doesn't appear. No "roughly" covering an unfetched value.

## Proactive close

- End with the action the data begs for, as an `ask_question` — first option a "Yes, …".
- A pick-a-subset proposal (tests to add, gaps to cover, runs to rerun) is `ask_question` with `multiSelect: true` and `recommended` pre-checked — never a markdown list of options.
- Skip the offer when the answer closes the topic. Don't invent work.

## Worked shapes

**"List tests grouped by status"**

- Fetch statuses (tests MCP list or the open widget's `get`), then `render_list({kind: 'tests', group_by: 'status', title})`.
- Headline: "**128 tests — 98 ✅ / 22 ❌ / 8 never run**."
- Insight: name the worst suite with its file link. Offer: open or rerun the failed group.

**"Analyze runs for a period"**

- Fetch runs via MCP with a `query` on the range, then `render_list({kind: 'runs', data, title: 'Runs — last 30 days'})`.
- Add a `chart`: pass rate as a line over time, or per-suite bars with passed/failed series.
- Bullets: trend, worst day, flaky candidates — each with run ids. Offer: drill into the worst run (`render_item`).

**"Improve the plan"**

- Show the plan as it stands: `render_item`, or a table of areas × counts.
- Proposed additions and removals are a checklist: `ask_question({multiSelect: true, recommended})` — one option per test, high-value ones pre-checked.
- Apply the picks, then re-render the updated plan.

**"Coverage gaps in our features"**

- Count from files (awk recipe); map features from suites and tags.
- Visual: bar chart of covered vs uncovered per feature, or `render_tree` of suites with counts in node names ("Checkout — 0 tests").
- Bullets: top gaps, each proven ("no suite matches payments, 0 tests tagged @refunds"). Offer: draft cases for chosen gaps (multi-select).
