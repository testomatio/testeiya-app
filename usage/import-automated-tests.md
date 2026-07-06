# Import Automated Tests into the TMS

The user opens a code repository and Testeiya imports its automated tests into Testomat.io — suites from the file structure, tests with stable `@T` ids written back into the source — so the whole test base (manual + automated) lives in one TMS.

## Who and when

A team adopting Testomat.io with an existing Playwright/Cypress/Jest/CodeceptJS suite; the first step of onboarding, before coverage mapping and reporting make sense.

## Flow

1. **Open the repo.** The user opens the automation repo as the workspace.
2. **Detect.** The `project-scan` skill (or `check-tests` itself) detects the framework and test file layout; the agent shows what it found: "Playwright, 214 tests in `tests/e2e`, TypeScript".
3. **Preview.** A dry pass (`check-tests <framework> "<glob>" --typescript` without the import key) lists the tests that would be imported; the tree renders for review.
4. **Import.** On confirmation, the agent runs the import with `--create --update-ids` (and `--keep-structure` if the user wants suites to mirror folders): tests are created in Testomat.io and ids are stamped back into the source titles. The diff of touched files is visible in the workspace.
5. **Verify.** The Tests tile count updates; spot-check a few imported tests in the tests widget.
6. **Continue.** Follow-ups chain naturally: `reporter-setup` so runs report results, `automation-coverage` for the coverage map, and the sync flow keeps ids stable.

## Works today

- `check-tests` supports 13+ frameworks (codeceptjs, cypress, playwright, jest, mocha, vitest, testcafe, nightwatch, protractor, jasmine, qunit, gauge, newman) with `--typescript`, `--create`, `--update-ids`, `--keep-structure`, `--sync`, `--exclude` — as a CLI.
- The workspace can be any folder; the agent can run bash; `project-scan` detects frameworks.

## Missing

- **App wiring**: `runCheckTests` (`cli/src/check-tests.ts`) only accepts `"pull" | "push"` and the sync endpoint only serves the manual-tests dir. There is no `import` action, so the agent must shell out with a raw `TESTOMATIO` token in env — which the permission model and prompt discourage.
- **Token plumbing for arbitrary repos**: the folder's `.env` fallback works, but a connected-account project should supply the token without the user pasting it (the resolution chain in `testomatio-target.ts` covers sync; import needs the same).
- **A guided import UI**: framework badge, glob input, dry-run preview tree, and an import button in the Workspace panel would make this a first-run wizard instead of a chat incantation.
- **Import reversibility**: a botched import (wrong glob) creates hundreds of tests; `--purge` is the blunt undo. A "delete tests created by this import" needs the import to record created ids.

Plan: [08 — Import automated tests](../plans/08-import-automated-tests.md)
