import assert from "node:assert/strict";
import { test } from "node:test";
import { describeUpdate } from "../dist/src/checkpoint.js";

const before = { commit: "1a2b3c4d5e6f", at: "2026-08-01T10:00:00.000Z", branch: "feature", remote: "git@github.com:acme/app.git" };

test("a first round has nothing to catch up on", () => {
  assert.equal(describeUpdate(null, { ...before, commit: "ffff" }), null);
  assert.equal(describeUpdate(before, null), null);
});

test("an unchanged checkout outside a pull request says nothing", () => {
  assert.equal(describeUpdate(before, { ...before, at: "2026-08-02T10:00:00.000Z" }), null);
});

test("new commits come with the range to read", () => {
  const note = describeUpdate(before, { ...before, commit: "9f8e7d6c5b4a" });
  assert.match(note, /moved from 1a2b3c4 to 9f8e7d6 on feature/);
  assert.match(note, /git diff 1a2b3c4\.\.\.HEAD/);
  assert.match(note, /fetch --unshallow/);
});

test("a pull request round reads its comments, commit or not", () => {
  const same = describeUpdate({ ...before, pr: 42 }, { ...before, pr: 42, at: "2026-08-02T10:00:00.000Z" });
  assert.match(same, /gh pr view 42 --comments/);
  assert.match(same, /since 2026-08-01T10:00:00\.000Z/);
  assert.doesNotMatch(same, /moved from/);
});

test("a different repository invalidates the whole round", () => {
  const note = describeUpdate(before, { ...before, commit: "9f8e7d6", remote: "git@github.com:acme/other.git" });
  assert.match(note, /different repository/);
  assert.doesNotMatch(note, /git diff/);
});
