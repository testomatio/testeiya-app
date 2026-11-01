import assert from "node:assert/strict";
import { pbkdf2 } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Launcher } from "../dist/src/pipeline/launcher.js";
import { Variables } from "../dist/src/pipeline/variables.js";

test("the stage log holds all the output once the command is done, on a busy host too", async () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-launcher-test-"));
  const log = join(dir, "out.log");
  for (let i = 0; i < 8; i++) pbkdf2("x", "y", 300_000, 64, "sha512", () => {});
  await new Launcher(dir).start({ command: "printf 'one\\ntwo\\n'", args: null, vars: new Variables(process.env), log });
  assert.equal(readFileSync(log, "utf8"), "one\ntwo\n");
});
