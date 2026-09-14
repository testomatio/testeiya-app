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

// The round is the same wherever the thread lives; only the mechanism differs.
// Every host gets the guard against the failure that broke a live thread: one
// shell line, replayed from the restored session every round, re-folding the
// comment it folded the first time while the rest of the thread stayed open.
test("every host is told to rebuild the list, fold all of it, and check", () => {
  for (const host of HOSTS) {
    const text = block(host);
    assert.match(text, /Ask the host for the thread, now, in this round/, host);
    assert.match(text, /from that answer alone/, host);
    assert.match(text, /every id in it and how many there are/, host);
    assert.match(text, /reusing one acts on that thread, not this one/, host);
    assert.match(text, /Make \*\*every\*\* one of them recede/, host);
    assert.match(text, /Not the first, not the one you folded last time/, host);
    assert.match(text, /Read the thread back before you finish/, host);
    assert.match(text, /Fold whatever is, then check again/, host);
    assert.match(text, /say so in your output/, host);
  }
});

// Each host names the field that answers "did it actually recede?" — a mutation
// returning no error is not the same as a hidden comment.
test("every host names the state it must read back", () => {
  assert.match(block("github"), /`isMinimized` per comment is both the list you fold from and the check/);
  assert.match(block("gitlab"), /Read the note body back to check the rewrite landed/);
  assert.match(block("bitbucket"), /`resolved` per thread is both the list you resolve from and the check/);
  assert.match(block("generic"), /read it back afterwards/);
});

// Who posts changes only what step 5 should find, never who folds.
test("the poster changes what step 5 expects, not the host rules", () => {
  const posted = block("github", { posts: true });
  assert.match(posted, /posted for you, once this turn ends/);
  assert.match(posted, /no comment of yours is showing yet/);
  assert.match(posted, /Append and collapse/);
  assert.match(posted, /minimizeComment/);
});

test("github posts its own comment when nothing else will", () => {
  const text = block("github");
  assert.match(text, /Post it yourself/);
  assert.match(text, /Append and collapse/);
  assert.match(text, /minimizeComment/);
  assert.match(text, /OUTDATED/);
  assert.match(text, /Issues and pull requests share the same comment API/);
  assert.match(text, /--edit-last/);
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
