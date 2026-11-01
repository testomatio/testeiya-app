import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf-8"));
const publish = workflow.jobs.publish;

test("desktop app releases never publish to npm", () => {
  assert.equal(publish.if, "!startsWith(github.event.release.tag_name || inputs.tag, 'app-')");
});

test("a cli release hands latest back to the newest desktop release", () => {
  assert.equal(publish.permissions?.contents, "write");
  const step = publish.steps.find((s) => s.run?.includes("gh release edit") && s.run.includes("--latest"));
  assert.ok(step, "no step re-marks latest");
  assert.ok(step.run.includes('startswith("Testeiya App")'), "must pick a desktop release by its title");
});

test("the desktop release body has an icon to show", () => {
  assert.ok(existsSync(new URL("../assets/testeiya-app-icon.png", import.meta.url)));
});
