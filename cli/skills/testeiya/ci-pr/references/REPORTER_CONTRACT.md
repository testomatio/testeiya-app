# Reporter Contract — prepared runs, launches, info API, pipes

How `@testomatio/reporter` consumes the coverage map, creates runs without executing them, launches a prepared run later, and posts PR comments. CI-independent — the CI config wraps these commands. Angle brackets are placeholders. Full flag and env-var reference: `testomatio-reporter`.

## 1. The coverage filter

```
--filter "coverage:file=<path-to-coverage-map>,diff=<git-ref>"
```

- `file=` — the coverage map (default `coverage.tests.yml`, from `qa-test-code-coverage`). Read with `fs`, so it may be absolute and is independent of the cwd.
- `diff=` — git ref to diff against (default `master`). The reporter runs `git diff <ref> --name-only` in `process.cwd()` — launch it from inside the repo whose changes are being detected.
- Changed files map through the YAML; the matching suite/test IDs and tags become the run's scope.
- One mixed map serves both kinds; `--kind` decides the run type (§3).
- A filter resolving to zero tests creates no run (`No tests found.`) — treat as success.

## 2. Diff base rules

- PR jobs — diff against the PR's target branch (`origin/<default-branch>`). Check out with full history (`fetch-depth: 0` or the CI's equivalent).
- Post-merge jobs — the target branch now equals `HEAD`, so diffing it yields nothing. Use the previous mainline tip: `HEAD~1` for squash merges, `HEAD^1` for merge commits.
- The diff base is computed where the job runs; confirm the history is available there.

## 3. PR opened — create the run

Required env: `TESTOMATIO`, `TESTOMATIO_TITLE` (PR-based, identical across all phases, e.g. `PR <number>: <title>`), `TESTOMATIO_RUNGROUP_TITLE`. `TESTOMATIO_ENV` optional.

One `start` creates one run covering both kinds. Manual cases are immediately pending for testers; the automated part stays scheduled until launched (§5). `--format id` keeps stdout to the run id:

```bash
RUN_ID=$(npx @testomatio/reporter start --kind mixed \
  --filter "coverage:file=<coverage-map>,diff=<target-branch>" --format id)
```

The `--kind` flag follows the project's tests:

| Project tests | `--kind` | Launch phases |
|---|---|---|
| manual + automated | `mixed` | preview/merge launch the automated part |
| manual only | `manual` | none — complete at creation |
| automated only | *(omit)* | preview/merge launch the run |

The stored scope is a snapshot of the diff at creation; a fresh `--filter` at launch (§5) replaces it.

## 4. Carrying `RUN_ID` between pipelines

The launch phases need the run id created at PR open.

- Preferred: the CI's native value-passing (artifact, pipeline variable, workflow output). A direct id has no expiry.
- Fallback: shared-run title matching, set on both create and launch calls:
  - `TESTOMATIO_SHARED_RUN=1` — report/launch into the run matching `TESTOMATIO_TITLE` instead of creating a new one;
  - `TESTOMATIO_TITLE` — the match key, identical on both sides;
  - `TESTOMATIO_SHARED_RUN_TIMEOUT` — minutes the title stays matchable, default 20. A PR lives for days — size this to the PR's lifetime or the launch creates a fresh run.

## 5. Launching a prepared run (`run --remote`)

`--remote <profile>` asks Testomat.io to dispatch a CI profile (Settings → CI) instead of executing locally. With `TESTOMATIO_RUN` set, no new run is created — the profile triggers for the existing one:

```bash
TESTOMATIO_RUN=$RUN_ID npx @testomatio/reporter run --remote <profile-name> \
  --filter "coverage:file=<coverage-map>,diff=<post-merge-base>"
```

- No `--filter` at launch → the server reuses the run's stored scope. A fresh `--filter` overrides it — this is how the final merged diff decides what runs.
- `--remote-param <k=v>` forwards a parameter to the profile (repeatable) — the carrier for a preview URL or target branch.
- In a mixed run, launched automated tests report into the same run the testers work in.
- Guards: requires `TESTOMATIO` (exit 1); cannot combine with `--filter-list`; a positional command is ignored with a warning; a missing profile fails `CI launch failed: <message>` (exit 1).
- Keep the launch non-blocking — it observes the change, it doesn't gate the merge.

## 6. Inline and cross-repo execution

Inline — the suite runs in this pipeline. Wrap the runner; the filter generates the grep it consumes:

```bash
TESTOMATIO_RUN=$RUN_ID npx @testomatio/reporter run "<runner command>" \
  --filter "coverage:file=<coverage-map>,diff=<git-ref>"
```

For a preview launch, point the project's own base-URL env var at the preview before the runner starts.

Cross-repo — the suite lives in another repo. Trigger that repo's pipeline with the CI's native cross-pipeline mechanism, passing `TESTOMATIO_RUN` (plus `TESTOMATIO` and the title env), so its reporter lands results in the prepared run.

## 7. Project info API

Read-only; the one network call permitted while authoring the pipeline:

```bash
curl -s -H "Authorization: Bearer $TESTOMATIO" \
  "https://app.testomat.io/api/v2/<project-id>/info"
```

Self-hosted instances replace the host. Relevant `data` fields:

| Field | Use |
|---|---|
| `project_id` | the project slug — names the CI secret `TESTOMATIO_<project_slug>` |
| `ci_profiles[].profile_name` | the value `--remote` takes |
| `ci_profiles[].service` | which CI the profile dispatches — match against the e2e suite's home |
| `ci_profiles[].pass_run_id` | confirms the dispatched workflow reports into the prepared run |
| `environments` | candidates for `TESTOMATIO_ENV` |

Empty `ci_profiles` → remote launch needs a profile created in Testomat.io first (Settings → CI).

## 8. PR comments — reporter pipes only

The reporter posts and updates the PR/MR comment itself. Enable the pipe by provisioning its token — never script a comment API call:

| Platform | Env var | Note |
|---|---|---|
| GitHub | `GH_PAT` | the workflow's built-in token works in PR runs |
| GitLab | `GITLAB_PAT` | access token with `api` scope |
| Bitbucket | `BITBUCKET_ACCESS_TOKEN` | repository access token as a repo variable |

No pipe for the platform (e.g. Azure DevOps) → no PR comment; results stay visible in Testomat.io.

## 9. Secrets naming

- Store each project's key as `TESTOMATIO_<project_slug>` — collision-free across projects and org stores.
- Map it to the plain `TESTOMATIO` env var at job level; the reporter only reads `TESTOMATIO`.
- The pipe token (§8) is a second, separate secret.
