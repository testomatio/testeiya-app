import assert from "node:assert/strict";
import { test } from "node:test";
import { commentThread, thread, threadHost, threadMarker } from "../dist/prompt/thread.js";
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
    assert.match(text, /a pull request, a merge request, an issue/, host);
    assert.ok(text.includes(MARKER), `${host} omits the line to write`);
    assert.match(text, /Never delete/, host);
    assert.match(text, /complete current answer/, host);
  }
});

// The round reads the same on every host; only the mechanism under it changes.
// Posting comes before collapsing on purpose. While the CLI posted, the agent
// worked a thread its own answer was not in yet, so the newest comment it could
// see read as the current one and survived every wording. Posting first makes
// "leave the newest" true.
test("every host gets the same round: post, then collapse the rest", () => {
  for (const host of HOSTS) {
    const text = block(host);
    assert.match(text, /Fetch the thread from the host\. Fresh/, host);
    assert.match(text, /an id or a count from earlier in this conversation is stale/, host);
    assert.match(text, /Collect every id/, host);
    const post = text.indexOf("Post ");
    const collapse = text.indexOf("Collapse every id from step 2");
    assert.ok(post > 0 && collapse > post, `${host} collapses before it posts`);
    assert.match(text, /all of them, the newest included/, host);
    assert.match(text, /Only what you just posted stays open/, host);
    assert.match(text, /Nothing of yours but the new comment is open/, host);
  }
});

test("each host supplies its mechanism and nobody else's", () => {
  assert.match(block("github"), /minimizeComment.*OUTDATED.*isMinimized/s);
  assert.match(block("gitlab"), /Notes cannot collapse.*<details>/s);
  assert.match(block("bitbucket"), /resolving the comment thread.*`resolved` reports it/s);
  assert.match(block("generic"), /whatever hides a whole comment here/);

  for (const [host, foreign] of [
    ["gitlab", /minimizeComment/],
    ["bitbucket", /minimizeComment|GITLAB_TOKEN/],
    ["generic", /minimizeComment|GITLAB_TOKEN|BITBUCKET_ACCESS_TOKEN/],
  ]) {
    assert.doesNotMatch(block(host), foreign, `${host} carries another host's calls`);
  }
});

// The comment body is the report file, so a reader gets the review rather than
// whatever the agent happened to say last.
test("the answer is the report file, marker first and footer last", () => {
  const text = block("github", { reportFile: "/tmp/report.md", footer: "> Reply with /testeiya" });
  assert.match(text, /Write the complete current answer to `\/tmp\/report\.md`/);
  assert.match(text, /Its first line is the marker above/);
  assert.match(text, /Its last line is exactly `> Reply with \/testeiya`/);
  assert.match(text, /Post that file as a new comment — the comment is the file/);

  // With no report file it still posts, it just has no file to point at.
  const bare = block("github");
  assert.match(bare, /Post it as a new comment/);
  assert.doesNotMatch(bare, /report\.md/);
  assert.doesNotMatch(bare, /Its last line is exactly/);
});

test("the block states intent, not shell", () => {
  for (const host of HOSTS) {
    const text = block(host);
    assert.doesNotMatch(text, /curl/, `${host} explains curl`);
    assert.doesNotMatch(text, /--header|--data-urlencode|--raw-field|--paginate|--jq/, `${host} spells out flags`);
    for (const line of text.split("\n").slice(1, -1)) {
      if (line.trim()) assert.match(line, /^ {2}\S|^ {5}\S|^ {2} /, `${host} line at column 0: ${line}`);
    }
    const lines = text.split("\n").length;
    assert.ok(lines < 20, `${host} block is ${lines} lines`);
    assert.ok(text.length < 1500, `${host} block is ${text.length} chars`);
  }
});

// Whoever posts collapses, because only the poster knows which comment is new.
// Asked to do both while the command posted, the agent had to guess which
// comment was this round's answer — it is not there yet — and kept sparing the
// newest one it could see. Delivered rounds hand it neither job.
test("a delivered round leaves the thread alone", () => {
  const text = block("github", { delivered: true, reportFile: "/tmp/report.md" });
  assert.match(text, /Posting it and collapsing the older ones are done for you/);
  assert.match(text, /Never post, edit, collapse or delete a comment yourself/);
  assert.match(text, /git diff <that sha>\.\.\.HEAD/);
  assert.doesNotMatch(text, /minimizeComment/);
  assert.doesNotMatch(text, /Collapse every id/);
  assert.ok(text.length < 900, `delivered block is ${text.length} chars`);
});

test("a round the agent delivers still carries the whole job", () => {
  const text = block("github");
  assert.match(text, /Collapse every id from step 2/);
  assert.match(text, /minimizeComment/);
  assert.doesNotMatch(text, /done for you/);
});

test("thread lifecycle describes separate configured triggers, not a live conversation", () => {
  for (const threadMode of ["first", "continuing"]) {
    const text = thread({ threadMode });
    assert.match(text, /`--thread` names the conversation, not a live session/);
    assert.match(text, /When configured, new PR commits or replies trigger separate one-shot messages/);
    assert.match(text, /Finish this run and exit; never poll or wait/);
    assert.match(text, /<user_reply>.*keeping the task in scope/);
  }
  assert.doesNotMatch(thread({}), /new PR commits|Later rounds will continue/);
});

test("first, continuing and unknown comment rounds use the right opening on every host", () => {
  for (const host of HOSTS) {
    for (const delivered of [false, true]) {
      const first = block(host, { delivered, threadMode: "first" });
      assert.doesNotMatch(first, /Since the last round/);
      assert.match(first, /The thread starts with this answer/);
      const continuing = block(host, { delivered, threadMode: "continuing" });
      assert.match(continuing, /Open with "Since the last round"/);
      assert.doesNotMatch(continuing, /The thread starts with this answer/);
      const unknown = block(host, { delivered });
      assert.match(unknown, /If earlier rounds of yours exist, open with "Since the last round"/);
      for (const text of [first, continuing, unknown]) {
        assert.match(text, /complete current answer, never a delta/);
        assert.match(text, /Its first line is the marker above/);
      }
    }
  }
});

test("a delivered round only compares against an earlier answer when one exists", () => {
  assert.match(block("github", { delivered: true, threadMode: "first" }), /if any exist, the newest/);
});

test("the consolidated marker matches the CLI stamp", () => {
  assert.ok(MARKER.startsWith(threadMarker("qa-review")));
  assert.equal(threadMarker("qa-review"), "<!-- testeiya thread=qa-review");
});
