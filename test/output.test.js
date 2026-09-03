import assert from "node:assert/strict";
import { test } from "node:test";
import { decorate, defaultFooter, marker, markdownPath, parseDestinations } from "../dist/src/output.js";

test("no output means markdown on stdout", () => {
  assert.deepEqual(parseDestinations([]), [{ kind: "stdout" }]);
});

test("--json alone is the envelope on stdout", () => {
  assert.deepEqual(parseDestinations([], true), [{ kind: "json" }]);
});

test("the extension picks the format", () => {
  assert.deepEqual(parseDestinations(["report.md"]), [{ kind: "markdown", path: "report.md" }]);
  assert.deepEqual(parseDestinations(["run.json"]), [{ kind: "json", path: "run.json" }]);
});

test("a windows path is not a scheme", () => {
  assert.deepEqual(parseDestinations(["C:\\reports\\out.md"]), [
    { kind: "markdown", path: "C:\\reports\\out.md" },
  ]);
});

test("github targets", () => {
  assert.deepEqual(parseDestinations(["gh:pr-comment"]), [{ kind: "gh" }]);
  assert.deepEqual(parseDestinations(["gh:pr#123"]), [{ kind: "gh", pr: 123 }]);
  assert.match(parseDestinations(["gh:whatever"]), /gh:pr-comment/);
});

test("only one markdown destination", () => {
  assert.match(parseDestinations(["a.md", "b.md"]), /only one markdown/);
});

test("markdownPath finds the file the agent writes", () => {
  const destinations = parseDestinations(["report.md", "run.json"], true);
  assert.equal(markdownPath(destinations), "report.md");
  assert.equal(markdownPath(parseDestinations([])), undefined);
});

const MARK = "<!-- testeiya -->";

test("a footer goes under the report, a header above it", () => {
  assert.equal(decorate("verdict\n"), `${MARK}\nverdict\n`);
  assert.equal(
    decorate("verdict\n", { footer: "> Reply with /testeiya" }),
    `${MARK}\nverdict\n\n> Reply with /testeiya\n`
  );
  assert.equal(decorate("verdict\n", { header: "## Testeiya" }), `${MARK}\n## Testeiya\n\nverdict\n`);
  assert.equal(
    decorate("verdict\n", { header: "## Testeiya", footer: "> Reply" }),
    `${MARK}\n## Testeiya\n\nverdict\n\n> Reply\n`
  );
  assert.equal(decorate("verdict\n", { footer: "   ", header: "  " }), `${MARK}\nverdict\n`);
});

test("the marker names the session and is never doubled", () => {
  assert.equal(marker(), MARK);
  assert.equal(marker("0198f2c1a3b4c"), "<!-- testeiya 0198f2c1a3b4c -->");
  assert.equal(
    decorate("verdict\n", { session: "0198f2c1a3b4c" }),
    "<!-- testeiya 0198f2c1a3b4c -->\nverdict\n"
  );
  assert.equal(decorate(`${MARK}\nverdict\n`, { session: "0198f2c1a3b4c" }), `${MARK}\nverdict\n`);
});

test("the report is signed by default", () => {
  const footer = defaultFooter("openrouter/anthropic/claude-sonnet-5");
  assert.equal(
    footer,
    "*🧚🏻‍♀️ Provided by [Testeiya QA Agent](https://testomat.ai/testeiya) & claude-sonnet-5*"
  );
  assert.equal(decorate("verdict\n", { footer }), `${MARK}\nverdict\n\n${footer}\n`);
});
