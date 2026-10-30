import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf-8"));

test("a cli release hands latest back to the newest desktop release", () => {
  const publish = workflow.jobs.publish;
  assert.equal(publish.permissions?.contents, "write");
  const step = publish.steps.find((s) => s.run?.includes("gh release edit") && s.run.includes("--latest"));
  assert.ok(step, "no step re-marks latest");
  assert.ok(step.run.includes('startswith("cli-v") | not'), "must pick a desktop tag, not a cli-v one");
});
