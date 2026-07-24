---
name: answer-formatting
description: How to compose Testeiya's answer to any data question — counts, lists, statuses, trends, coverage, plan reviews, comparisons, reports. Use BEFORE composing such a reply. Defines the answer blocks (headline, chart, list, insights, offer) and the proof rules.
license: MIT
metadata:
  author: Testomat.io
  version: 2.0.0
---

# Answer formatting

A data question gets a visual answer. Build the reply from these blocks, in this order. Include a block when its data exists in the answer; skip it when it doesn't.

1. **Headline** — one sentence: the verdict and its key number.
2. **Chart** — `render_chart` or diagram if data can be explained with visuals.
3. **List** — `render_result({call_id})` if data can be presented as a table. One entity → `render_item`. A hierarchy → `render_tree`.
4. **Insights** — up to 3 bullets: what stands out, each citing its source.
5. **Offer** — the obvious next action as an `ask_question`; a pick-a-subset proposal is its multi-select checklist. Skip when the answer closes the topic.

Example: "how many of X passed?" → headline with the ratio, chart of the status split, one list of all X with status marks.

## Rules

- Every visual has a `title`: what it shows and how it was filtered.
- No prose that repeats what a visual shows. Short sentences. No filler. Bold key numbers only. Never italic.
- Workspace files as inline code (renders as a clickable link). Entities by their id.
- Only numbers you computed from fetched data — derive counts/ratios with `query_result` on the fetched result, never by eyeballing a digest's sample; partial coverage is declared.
- A flow or sequence → a `mermaid` block in the text.
- Tool params live in the app-interface section of your system prompt — follow it, never invent fields.
- No render tools in this host (terminal)? Same blocks as markdown: table with ✅ ❌ ⚠️ ⏭ marks instead of list/chart.
