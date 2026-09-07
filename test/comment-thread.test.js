import assert from "node:assert/strict";
import { test } from "node:test";
import { commentThread, threadHost } from "../dist/prompt/comment-thread.js";
import { marker } from "../dist/src/output.js";

const MARKER = marker({ thread: "qa-review", commit: "700fbe1d9c" });
const HOSTS = ["github", "gitlab", "bitbucket", "generic"];

const block = (host, extra) =>
  commentThread({ host, thread: "qa-review", marker: MARKER, ...extra });

test("the job says which host, the checkout never does", () => {
  assert.equal(threadHost({ GITHUB_ACTIONS: "true", CI: "true" }), "github");
  assert.equal(threadHost({ GITLAB_CI: "true", CI: "true" }), "gitlab");
  assert.equal(threadHost({ BITBUCKET_BUILD_NUMBER: "42", CI: "true" }), "bitbucket");
  assert.equal(threadHost({ CI: "true" }), "generic");
  assert.equal(threadHost({}), null);
  // A remote is not a job: a local checkout of a GitHub repo has no thread.
  assert.equal(threadHost({ GITHUB_REPOSITORY: "acme/app" }), null);
});

test("the thread is a subject, not a pull request", () => {
  for (const host of HOSTS) {
    const text = block(host);
    assert.match(text, /pull request, a merge request, an issue/);
    assert.ok(text.includes(MARKER), `${host} omits the line to write`);
    assert.match(text, /Never delete a comment/);
    assert.match(text, /complete current answer/);
  }
});

test("github folds and leaves the posting alone", () => {
  const text = block("github", { posts: true });
  assert.match(text, /Append and collapse/);
  assert.match(text, /minimizeComment/);
  assert.match(text, /OUTDATED/);
  assert.match(text, /Issues and pull requests share the same comment API/);
  assert.match(text, /--edit-last/);
  assert.match(text, /posted for you/);
});

test("github posts its own comment when nothing else will", () => {
  const text = block("github");
  assert.match(text, /Post it yourself/);
  assert.doesNotMatch(text, /posted for you/);
});

test("gitlab rewrites one note and stays off discussions", () => {
  const text = block("gitlab");
  assert.match(text, /\*\*Rewrite\.\*\*/);
  assert.match(text, /<details>/);
  assert.match(text, /Fold one generation/);
  assert.match(text, /notes rather than discussions/);
  assert.match(text, /CI_JOB_TOKEN` cannot write/);
  assert.doesNotMatch(text, /minimizeComment/);
});

test("bitbucket resolves and respects the comment cap", () => {
  const text = block("bitbucket");
  assert.match(text, /Append and collapse/);
  assert.match(text, /resolve each one/);
  assert.match(text, /200 comments/);
  assert.match(text, /deleted=false/);
});

test("an unclaimed host is told the choice, never another host's calls", () => {
  const text = block("generic");
  assert.match(text, /which of the two applies/i);
  assert.doesNotMatch(text, /minimizeComment/);
  assert.doesNotMatch(text, /GITLAB_TOKEN/);
  assert.doesNotMatch(text, /bitbucket/i);
});

test("the block states rules, not shell", () => {
  for (const host of HOSTS) {
    const text = block(host);
    assert.doesNotMatch(text, /curl/, `${host} explains curl`);
    assert.doesNotMatch(text, /--header|--data-urlencode|--raw-field|--paginate|--jq/, `${host} spells out flags`);
    assert.doesNotMatch(text, /There is no /, `${host} states what does not exist`);
    for (const line of text.split("\n").slice(1, -1)) {
      if (line.trim()) assert.match(line, /^ {2}\S|^ {5}\S|^ {2} /, `${host} line at column 0: ${line}`);
    }
    const lines = text.split("\n").length;
    assert.ok(lines < 28, `${host} block is ${lines} lines`);
  }
});
