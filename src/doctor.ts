import { existsSync } from "node:fs";
import { SettingsManager, type Skill } from "@earendil-works/pi-coding-agent";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PI_STATE_DIR, TESTEIYA_HOME } from "./env.js";
import { hasMcp, hasTestomatio, metadataCachePath, vendorBundle } from "./mcp.js";
import { PROVIDER_KEYS, resolveModel, UsageError } from "./model.js";
import { BUNDLED_SKILLS_DIR, createLoader, createRuntime } from "./session.js";

const MIN_NODE = [22, 19];

/**
 * Everything a run resolves silently: which key file won, whether skills loaded,
 * whether MCP is on. Reads config only — `--probe` is the one check that spends.
 */
export async function runDoctor(options: DoctorOptions): Promise<number> {
  const checks: Check[] = [nodeCheck(), homeCheck()];

  const runtime = await createRuntime();
  checks.push(keyCheck(runtime, options.envSources));

  const model = modelCheck(runtime, options.model);
  checks.push(model.check);

  const skills = await skillsChecks();
  checks.push(...skills.checks);
  checks.push(testomatioCheck(), mcpCacheCheck());

  if (options.probe) checks.push(await probeCheck(runtime, model.resolved));

  if (options.json) {
    const report = {
      checks: checks.filter((check) => check.status !== "list"),
      skills: skills.groups,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return worst(checks) === "fail" ? 1 : 0;
  }

  process.stdout.write("\n");
  for (const check of checks) {
    process.stdout.write(`  ${MARK[check.status]} ${check.name.padEnd(12)} ${check.detail}\n`);
  }
  process.stdout.write("\n");
  return worst(checks) === "fail" ? 1 : 0;
}

function nodeCheck(): Check {
  const version = process.versions.node;
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major > MIN_NODE[0]! || (major === MIN_NODE[0] && minor >= MIN_NODE[1]!)) {
    return { name: "node", status: "ok", detail: `v${version}` };
  }
  return { name: "node", status: "fail", detail: `v${version}, needs v22.19 or newer` };
}

function homeCheck(): Check {
  if (!existsSync(TESTEIYA_HOME)) {
    return { name: "home", status: "warn", detail: `${TESTEIYA_HOME} (not created yet)` };
  }
  return { name: "home", status: "ok", detail: TESTEIYA_HOME };
}

// The key can come from four places and nothing else ever says which one won.
function keyCheck(runtime: Runtime, sources: Map<string, string>): Check {
  const found: string[] = [];
  for (const { provider, env } of PROVIDER_KEYS) {
    if (process.env[env]) {
      found.push(`${provider} from ${sources.get(env) ?? "environment"}`);
      continue;
    }
    if (runtime.hasConfiguredAuth(provider)) found.push(`${provider} from auth.json`);
  }
  if (found.length === 0) {
    return { name: "key", status: "fail", detail: "none — set OPENROUTER_API_KEY or similar" };
  }
  return { name: "key", status: "ok", detail: found.join(", ") };
}

function modelCheck(runtime: Runtime, explicit?: string): { check: Check; resolved?: Model } {
  try {
    const model = resolveModel(runtime, explicit);
    return {
      check: { name: "model", status: "ok", detail: `${model.provider}/${model.id}` },
      resolved: model,
    };
  } catch (err) {
    const detail = err instanceof UsageError ? err.message : String(err);
    return { check: { name: "model", status: "warn", detail } };
  }
}

async function skillsChecks(): Promise<SkillsResult> {
  const loader = createLoader({
    cwd: process.cwd(),
    settingsManager: SettingsManager.inMemory(),
    extensionPaths: [],
    systemPrompt: () => "",
  });
  await loader.reload();
  const { skills, diagnostics } = loader.getSkills();

  const groups = byGroup(skills);
  const checks: Check[] = [];
  if (skills.length === 0) {
    checks.push({ name: "skills", status: "warn", detail: "none loaded" });
  }
  if (skills.length > 0) {
    checks.push({ name: "skills", status: "ok", detail: `${skills.length} loaded` });
    for (const [group, names] of groups) {
      checks.push({ name: "", status: "list", detail: `${group.padEnd(28)} ${summarize(names)}` });
    }
  }
  // Collisions and parse errors were dropped on the floor before this command.
  for (const diagnostic of diagnostics) {
    const status = diagnostic.type === "error" ? "fail" : "warn";
    let detail = diagnostic.message;
    if (diagnostic.path) detail = `${detail} — ${shorten(diagnostic.path)}`;
    checks.push({ name: "skills", status, detail });
  }
  return { checks, groups: [...groups].map(([group, names]) => ({ group, skills: names })) };
}

function shorten(path: string): string {
  const inBundle = relative(BUNDLED_SKILLS_DIR, path);
  if (inBundle.startsWith("..")) return path;
  return inBundle;
}

// The full list is in --json; this line only has to prove the right set loaded.
function summarize(names: string[]): string {
  if (names.length <= 6) return names.join(", ");
  return `${names.slice(0, 6).join(", ")}, +${names.length - 6}`;
}

function byGroup(skills: Skill[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const skill of skills) {
    let group = dirname(relative(BUNDLED_SKILLS_DIR, skill.baseDir));
    if (group === "." || group.startsWith("..")) group = "bundled";
    const names = groups.get(group) ?? [];
    names.push(skill.name);
    groups.set(group, names);
  }
  return groups;
}

function testomatioCheck(): Check {
  if (!hasTestomatio()) {
    return { name: "testomatio", status: "warn", detail: "no TESTOMATIO token, not connected" };
  }
  if (!hasMcp()) {
    return {
      name: "testomatio",
      status: "warn",
      detail: "token set, no project id — check-tests and REST only",
    };
  }
  return { name: "testomatio", status: "ok", detail: "token and project id, MCP tools on" };
}

function mcpCacheCheck(): Check {
  if (!hasMcp()) return { name: "mcp", status: "ok", detail: "off" };
  const bundle = fileURLToPath(vendorBundle());
  if (!existsSync(bundle)) {
    return { name: "mcp", status: "fail", detail: "vendor bundle missing — run npm run build" };
  }
  if (!existsSync(metadataCachePath())) {
    return { name: "mcp", status: "warn", detail: "tool cache empty, first run is proxy-only" };
  }
  return { name: "mcp", status: "ok", detail: "direct tools and proxy" };
}

async function probeCheck(runtime: Runtime, model?: Model): Promise<Check> {
  if (!model) return { name: "probe", status: "warn", detail: "skipped, no model to probe" };
  const message = await runtime
    .completeSimple(model, { messages: [{ role: "user", content: "ping", timestamp: Date.now() }] })
    .catch((err: unknown) => ({ stopReason: "error", errorMessage: String(err) }) as const);
  if (message.stopReason === "error") {
    return { name: "probe", status: "fail", detail: message.errorMessage ?? "request failed" };
  }
  return { name: "probe", status: "ok", detail: "the key works" };
}

function worst(checks: Check[]): Status {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "ok";
}

const MARK: Record<Status, string> = {
  ok: "✓",
  warn: "!",
  fail: "✗",
  list: " ",
};

export interface DoctorOptions {
  envSources: Map<string, string>;
  json?: boolean;
  probe?: boolean;
  model?: string;
}

type Status = "ok" | "warn" | "fail" | "list";

interface Check {
  name: string;
  status: Status;
  detail: string;
}

interface SkillsResult {
  checks: Check[];
  groups: Array<{ group: string; skills: string[] }>;
}

type Runtime = Awaited<ReturnType<typeof createRuntime>>;
type Model = NonNullable<ReturnType<Runtime["getModel"]>>;
