import { Settings } from "@oh-my-pi/pi-coding-agent";
import { userEnvKeys, projectEnvVars } from "./user-env.js";

// Make the agent's shell commands see the CURRENT Testomat.io credentials.
// The SDK's bash executor reads its shell env from `Settings.getShellConfig()`,
// which delegates to pi-utils' procmgr — and procmgr snapshots `{...Bun.env}`
// into a module-global cache on the FIRST bash command and never rebuilds, so
// `process.env.TESTOMATIO` set at session creation (connection.ts) or by the
// TUI's /connect never reaches agent shells. The SDK exposes no per-session
// shell env (CreateAgentSessionOptions has no env field), so — like the
// SOURCE_PATHS patch in session-factory.ts — this is a deliberate in-process
// monkey patch: wrap the prototype method and overlay the live values of the
// Testomat.io keys on every call. Absent keys are DELETED from the copy so a
// token baked into the frozen snapshot at process start (e.g. a dev `.env`)
// can't leak into a workspace that has none. The returned objects are spread
// copies — procmgr hands out its cached object by reference; never mutate it.
// The user's own env vars (Settings → ENV Variables, saved to ~/.testeiya/.env
// via user-env.ts) are overlaid alongside these, so secrets like API keys reach
// every agent bash command too. The workspace's project-scope vars
// (`<cwd>/.testeiya/.env`, resolved per session via Settings.getCwd()) are
// overlaid last and read live from disk on each call, so a project value wins
// over a global one and a Settings save applies to the very next command.
const SHELL_ENV_KEYS = ["TESTOMATIO", "TESTOMATIO_URL", "TESTOMATIO_PROJECT_ID"];

const originalGetShellConfig = Settings.prototype.getShellConfig;
if (originalGetShellConfig) {
  Settings.prototype.getShellConfig = function (this: Settings) {
    const config = originalGetShellConfig.call(this);
    const env = { ...config.env };
    for (const key of [...SHELL_ENV_KEYS, ...userEnvKeys()]) {
      const value = process.env[key];
      if (value) env[key] = value;
      else delete env[key];
    }
    for (const [key, value] of Object.entries(projectEnvVars(this.getCwd()))) {
      if (value) env[key] = value;
    }
    return { ...config, env };
  };
} else {
  console.warn(
    "[shell-env] Settings.prototype.getShellConfig is missing (SDK change?) — " +
    "TESTOMATIO env vars may not reach agent shell commands"
  );
}
