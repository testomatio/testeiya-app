# Testeiya Context Directory

All persistent QA metadata lives here.

## Purpose

Single source of truth for project context:
- Requirements & acceptance criteria
- Code architecture & snippets
- Documentation & decisions
- Test scenarios (manual + automated)

## Structure

| Directory | Content |
|-----------|---------|
| `code/` | Architecture notes, API structures, logic snippets |
| `requirements/` | User stories, product requirements, acceptance criteria |
| `docs/` | Feature documentation, technical specs, decisions |
| `manual-tests/` | Markdown-based test scenarios |
| `auto-tests/` | Test mappings, suite configurations |

## Key Rules

- **Initialization:** Verify `.testeiya-context/` on startup. If missing, prompt for Git URL or local path.
- **Write Scope:** Modify codebase for test implementation; store all analysis/metadata here.
- **Discovery First:** Use `ls`, `find`, `grep` before asking for context.
- **Organization:** Always categorize incoming data into appropriate subdirectories.

## Git Ignore

**IMPORTANT:** Ensure `.testeiya-context/` is in `.gitignore` and uncommented to prevent accidental commits.