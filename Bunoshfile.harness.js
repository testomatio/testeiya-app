import * as cli from "./cli/Bunoshfile.js";

/** Vendor the prebuilt skills (cli/skills.yaml) into a flat cli/skills/<skill>/ tree. */
export function vendor() {
  return cli.vendorSkills();
}

/** List the vendored skills grouped by category. */
export function skills() {
  return cli.skills();
}

/** Seed ~/.testeiya/.env with a commented Langfuse block (observability off by default). */
export function setup() {
  return cli.setupEnv();
}

/**
 * Fetch a Langfuse trace / session / recent range and dump it under cli/log/.
 * @param {string} target - trace id, session:<id>, or a range (30m|1h|today)
 */
export function trace(target = null) {
  return cli.debugTrace(target);
}

/**
 * Pull a full debug snapshot from the running app-server into cli/log/.
 * @param {string} session - optional agent conversation id to include its meta
 */
export function snapshot(session = null) {
  return cli.debugSnapshot(session);
}

/** Run the CLI/agent test suite (bun test). */
export function test() {
  return cli.test();
}
