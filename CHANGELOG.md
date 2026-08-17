# Changelog

Releases of Testeiya — the desktop app, the web app, and the `testeiya` CLI, which
share one version line.

The section for each version is published as that release's notes, so entries are
written for the people reading them on the releases page.

## 0.3.2 — 2026-08-16

### Added

- Dispatch panel in the sidebar: launch the exploratory, API and doc bots, run the
  workspace's own test scripts, and start a live Playwright browser, each streaming
  into a card in the chat.
- Onboarding questionnaire that asks about the product first and writes the answers
  to a single `answers.md`.

## 0.3.1 — 2026-08-14

### Added

- Issue management: report and track issues found during a testing session.

### Fixed

- Onboarding now collects, delivers and probes reliably.

## 0.3.0 — 2026-08-07

### Added

- `testeiya` CLI gained a non-interactive mode: one task, a written report, an exit
  code — the shape CI needs.
- End-to-end test suite for the web app, running in CI.

### Changed

- Upgraded the underlying agent SDK from 13.19.0 to 17.2.8.

### Fixed

- The command palette re-indexes when the workspace tree finishes loading, so files
  are findable on first open.

## 0.2.2 — 2026-07-24

Maintenance release.

## 0.2.1 — 2026-07-22

Maintenance release.

## 0.2.0 — 2026-07-22

### Added

- New logo.
- New data grids across the app.
