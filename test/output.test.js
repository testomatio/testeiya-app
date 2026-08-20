import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownPath, parseDestinations } from "../dist/src/output.js";

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
