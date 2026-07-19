# Testeiya internal skills

First-party skills authored in this repo and shipped with every Testeiya build.
This folder is **not** managed by `cli/skills.yaml` — `bunosh skills:update`
never touches it (it only replaces manifest-owned vendor folders).

A skill is a folder with a `SKILL.md` — YAML frontmatter (`name` +
`description`) followed by the instructions:

    cli/skills/testeiya/my-skill/SKILL.md

Scaffold one with `bunosh skills:create <name>`.

Rules:

- The frontmatter `name` must be a slug (`[a-z0-9-]`) — it is the `/mention`
  token in the chat input. A non-slug name falls back to the folder name.
- Skills placed directly in this folder get the **Testeiya** category in the
  skills menu. To use a different category, nest a category subfolder:
  `testeiya/<category>/<skill>/SKILL.md`.
- A skill here **overrides** a vendored skill with the same name only by
  load-order dedupe — avoid reusing external names; `bunosh skills:update`
  warns on collisions.
- Check the result with `bunosh skills:list` (this folder shows as internal).
