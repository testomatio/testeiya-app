import assert from "node:assert/strict";
import { test } from "node:test";
import { decorate, defaultFooter, markdownPath, parseDestinations } from "../dist/src/output.js";

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

test("a footer goes under the report, a header above it", () => {
  assert.equal(decorate("verdict\n"), "verdict\n");
  assert.equal(
    decorate("verdict\n", { footer: "> Reply with /testeiya" }),
    "verdict\n\n> Reply with /testeiya\n"
  );
  assert.equal(decorate("verdict\n", { header: "## Testeiya" }), "## Testeiya\n\nverdict\n");
  assert.equal(
    decorate("verdict\n", { header: "## Testeiya", footer: "> Reply" }),
    "## Testeiya\n\nverdict\n\n> Reply\n"
  );
  assert.equal(decorate("verdict\n", { footer: "   ", header: "  " }), "verdict\n");
});

test("the report is signed by default", () => {
  const footer = defaultFooter("openrouter/anthropic/claude-sonnet-5");
  assert.equal(
    footer,
    "*🧚🏻‍♀️ Provided by [Testeiya QA Agent](https://testomat.ai/testeiya) & claude-sonnet-5*"
  );
  assert.equal(decorate("verdict\n", { footer }), `verdict\n\n${footer}\n`);
});
