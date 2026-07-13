# Automated testing

Testeiya works with your automation code the same way it works with manual cases: open the repo as a workspace and the agent reads your framework, your tests, and your CI setup.

## Scan the project

Start by letting the agent map what exists:

> Scan this project — what frameworks and tests do we have?

The `scan-automation-project` skill inventories languages, test frameworks, and existing tests (both automated specs and manual `*.test.md` files), giving you a test matrix to plan from.

## Set up result reporting

To get automated results into Testomat.io, ask:

> Set up Testomat.io reporting for this project

The `qa-e2e-tests-reporting` skill detects your framework — Playwright, CodeceptJS, Cypress, Jest, WebdriverIO, JUnit, Pytest, and more — and configures [`@testomatio/reporter`](https://github.com/testomatio/reporter) so every run reports to your project. Migrating from Allure? `testomat-allure-adapter` converts existing Allure setups.

## Automate manual test cases

Turn stable manual cases into automated specs:

> Automate the test cases in Login.test.md with Playwright

The `automate-manual-test-cases` skill converts `*.test.md` steps into working test code, keeping the Testomat.io test IDs so automated results map onto the same test cases the manual suite tracks. For CodeceptJS projects a full skill family is bundled — writing, refactoring, and debugging tests, plus migrations from Cypress, Protractor, Selenium (Java), and TestCafe.

The agent follows framework best practices (bundled Playwright and CodeceptJS guidance) and can drive its managed browser to verify selectors and flows against the real application while it writes.

## Map tests to code

For change-aware test selection, ask the agent to build coverage maps:

- `e2e-test-coverage-mapping` — maps automated end-to-end tests to the source files they exercise (`coverage.e2e.yml`).
- `qa-manual-tests-to-code-coverage` — the same for manual cases (`coverage.manual.yml`).

With a map in place, `@testomatio/reporter --filter "coverage:..."` runs only the tests affected by a diff — useful for PR pipelines and targeted regression.

## Fix failing and flaky tests

When automation breaks, point the agent at the failure:

> The checkout spec fails on CI but passes locally — diagnose it

The `debug-fix-failed-flaky-autotests` skill analyzes failures, inspects the DOM and selectors, identifies root causes (timing, environment, data), and proposes or applies fixes. Combined with run data from the connected project ([Result analysis](result-analysis.md)), it can start from a red run in Testomat.io and end at a green spec.

## What's next

- [Result analysis](result-analysis.md) — investigate runs and cluster failures.
- [Test management](test-management.md) — keep automated and manual cases in one tracked suite.
