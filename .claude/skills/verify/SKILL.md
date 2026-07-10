---
name: verify
description: Runtime-verify a UI/backend change in Testeiya by driving the running web app with playwright-cli. Use after making frontend or cli/ changes to observe them working end-to-end.
---

# Verify a Testeiya change at runtime

## Get a handle

1. Check for a running dev server first: `cat ~/.testeiya/server.json` and `ss -ltnp | grep -E ":3050|:3210"`. If present, the UI is at http://localhost:3050 with hot reload — your edits are already live. If not, start `npm run dev` in the background from the repo root.
2. Drive the browser with the CLI in `cli/node_modules`: `cd cli && ./node_modules/.bin/playwright-cli -s=<session> open http://localhost:3050`. Then `snapshot`, `click <ref>`, `eval "<js>"`, `screenshot`. Snapshots/screenshots land in `cli/.playwright-cli/` — **delete that dir when done** (it is not gitignored) and `close` the session.

## Gotchas (each cost real time)

- **Fast Refresh resets widget state between playwright-cli commands.** Every playwright-cli invocation writes files into `cli/.playwright-cli/`, which next dev watches, triggering a Fast Refresh that resets `useState` in chat widgets. Any assertion that spans "click, then check later" must run inside a **single `eval` with a Promise + setTimeout**, not across two CLI invocations.
- The Debug panel is hidden until `localStorage['testeiya.debug-panel.enabled'] = '1'` + reload.
- The chat widgets (runs/tests browsers) are reachable without prompting the LLM: Project section → count tiles (Tests/Runs/…) open the browse data-table; clicking a row opens the item widget.
- "Start manual run" (and other run actions) mutate the connected live Testomat.io project — don't click them; verify around.
- The fish shell aliases `ls` to eza — use `command ls -t` for newest-file lookups; prefix `_ZO_DOCTOR=0` to silence zoxide noise.
- Testruns fetches with `filter[status]` can take ~10s — wait before judging a filter "broken".
- To compare against pre-change behavior, `git stash push -- <files>` (hot reload picks it up), probe, then `git stash pop`.
