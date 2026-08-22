# Building your own agent on Testeiya

The `testeiya` command is one composition of [pi](https://pi.dev) — a single run, a report, an exit code. It is deliberately small: `src/` is under 850 lines, and almost all of it is wiring pi's SDK to the prompt and skills in this repository.

That means the interesting parts are reusable. If you want a QA agent that behaves like Testeiya but has an interactive terminal UI, its own tools, or lives inside your own service, you are not extending a framework — you are writing a different composition over the same parts.

This page is about doing that. It assumes pi **0.84.x**; the SDK is pre-1.0 and these APIs move. Pi's own reference ships with it, in `node_modules/@earendil-works/pi-coding-agent/docs/` — `sdk.md`, `extensions.md` and `tui.md` are the three that matter here, and `examples/` beside them is runnable.

## What the CLI actually is

| File | What it wires |
|---|---|
| `src/cli.ts` | Argument parsing, stdin, exit codes |
| `src/session.ts` | `createAgentSession` — the model runtime, the resource loader, the extensions |
| `src/run.ts` | A hand-rolled run loop: `session.prompt()`, event subscription, the report contract |
| `src/model.ts` | Provider keys and model resolution; no default model |
| `src/mcp.ts` · `src/mcp-extension.ts` | The Testomat.io MCP server, delivered as a pi extension |
| `src/result.ts` | The `set_result` custom tool, which becomes the process exit code |
| `prompt/` | `buildSystemPrompt()` — role, rules, Testomat.io operating rules, report contract |
| `skills/` | Where the vendored skill folders land — the manifest is committed, the folders are fetched by `scripts/vendor-skills.js` |

Only the first three are specific to a one-shot CLI. `prompt/`, `skills/`, the MCP extension and the model resolution are harness-agnostic, and a different front end keeps them unchanged.

## Getting the parts

The npm package ships a binary, not a library: `package.json` declares `bin` but no `main` or `exports`, so `import … from "testeiya"` does not resolve. Fork or clone this repository and edit `src/` — that is the supported route, and at this size it is also the pleasant one. `src/session.ts` is the 110 lines to start from.

```bash
git clone https://github.com/testomatio/testeiya-app
cd testeiya-app && npm install && npm run build
```

## Adding a pi extension

An extension is a function that receives an `ExtensionAPI` and registers tools, commands, event handlers, or UI. Testeiya already ships one — `src/mcp-extension.ts`, twelve lines that hand pi the Testomat.io MCP adapter. Read that first; it is the working reference.

There are three ways to load one, and they differ in who decides.

**You decide, in code.** An inline factory needs no file on disk:

```typescript
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const jiraExtension: InlineExtension = {
  name: "jira",
  factory: (pi: ExtensionAPI) => {
    pi.registerTool({
      name: "jira_issue",
      label: "Read a Jira issue",
      description: "Fetch a Jira issue by key, for acceptance criteria.",
      parameters: Type.Object({
        key: Type.String({ description: "Issue key, e.g. QA-142" }),
      }),
      async execute(_toolCallId, params) {
        const { key } = params as { key: string };
        const issue = await fetchIssue(key);
        return { content: [{ type: "text", text: issue }], details: {} };
      },
    });

    pi.on("tool_call", async (event, ctx) => {
      if (event.toolName !== "bash") return;
      const input = event.input as { command?: string };
      if (!input.command?.includes("git push")) return;
      ctx.ui.notify("blocked: this agent does not push", "warning");
      return { block: true, reason: "pushing is not allowed in this harness" };
    });
  },
};
```

Both halves are worth noticing: `registerTool` gives the model a capability, and the `tool_call` handler is a gate in front of every tool it already has — returning `{ block: true }` stops the call and tells the model why.

**You decide, from a file.** `additionalExtensionPaths` takes absolute paths, which is how the MCP adapter is loaded and how you would load an extension that ships with your fork.

Both go into the resource loader:

```typescript
const loader = new DefaultResourceLoader({
  cwd,
  agentDir: PI_STATE_DIR,
  additionalSkillPaths: [BUNDLED_SKILLS_DIR],
  additionalExtensionPaths: extensionPaths,
  extensionFactories: [jiraExtension],
  skillsOverride: (current) => ({
    skills: current.skills.filter((s) => s.baseDir.startsWith(BUNDLED_SKILLS_DIR)),
    diagnostics: current.diagnostics,
  }),
});
```

**The user decides.** pi discovers extensions from `<agentDir>/extensions/` and from `<cwd>/.pi/extensions/` on its own. Testeiya sets `agentDir` to `~/.testeiya/pi`, so a user's own extensions belong in **`~/.testeiya/pi/extensions/`** — not the `~/.pi/agent/extensions/` that pi's documentation names. That is deliberate: `npx testeiya` must not load whatever is installed in someone's own pi.

### Two things this repository guards on purpose

`skillsOverride` above is a filter, not a loader. pi discovers skills from the checkout it is pointed at and from the user's own directories, and the filter drops everything outside the bundled tree. Two reasons to keep it: an arbitrary CI clone must not be able to hand the model its own skills, and unrelated skills are not free — they cost system prompt and dilute the choice the model makes. Relax it deliberately, if at all.

The same reasoning applies to MCP: `src/mcp.ts` builds the server definition from the environment rather than reading one out of the working directory.

## Adding a TUI

Testeiya has no interactive mode, but pi ships the whole thing — `InteractiveMode` is the editor, transcript, autocomplete, model picker and slash commands that `pi` itself uses. Adding it is composition, not implementation. `@earendil-works/pi-tui` is already a dependency of this package.

One structural difference: `InteractiveMode` takes an `AgentSessionRuntime`, not the `AgentSession` that `createTesteiyaSession` returns. The runtime is the layer that can *replace* the session — `/new`, `/resume`, `/fork` — so it takes a factory it can call again rather than a finished session. Everything `src/session.ts` passes to `DefaultResourceLoader` moves into `resourceLoaderOptions`, and everything it passes to `createAgentSession` moves into `createAgentSessionFromServices`.

```typescript
import { join } from "node:path";
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  InteractiveMode,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt } from "../prompt/index.js";
import { loadEnvFiles, PI_STATE_DIR, TESTEIYA_HOME } from "./env.js";
import { hasMcp, tmsAccess } from "./mcp.js";
import { applyEnvKeys, resolveModel } from "./model.js";

const BUNDLED_SKILLS_DIR = join(import.meta.dirname, "..", "..", "skills");
const MCP_EXTENSION = join(import.meta.dirname, "mcp-extension.js");

loadEnvFiles();
process.env.PI_CODING_AGENT_DIR = PI_STATE_DIR;

const cwd = process.cwd();

const modelRuntime = await ModelRuntime.create({
  authPath: join(TESTEIYA_HOME, "auth.json"),
  modelsPath: null,
});
await applyEnvKeys(modelRuntime);
const model = resolveModel(modelRuntime, process.env.TESTEIYA_MODEL);

const settingsManager = SettingsManager.inMemory();
const extensionPaths: string[] = [];
if (hasMcp()) extensionPaths.push(MCP_EXTENSION);

// Called again on every /new, /resume and /fork, so it must rebuild services
// for the cwd it is handed rather than closing over the one above.
const createRuntime: CreateAgentSessionRuntimeFactory = async (options) => {
  const services = await createAgentSessionServices({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager,
    modelRuntime,
    resourceLoaderOptions: {
      additionalSkillPaths: [BUNDLED_SKILLS_DIR],
      additionalExtensionPaths: extensionPaths,
      systemPromptOverride: () =>
        buildSystemPrompt({
          cwd: options.cwd,
          mode: "tui",
          tms: tmsAccess(),
        }),
      skillsOverride: (current) => ({
        skills: current.skills.filter((s) => s.baseDir.startsWith(BUNDLED_SKILLS_DIR)),
        diagnostics: current.diagnostics,
      }),
    },
  });
  const created = await createAgentSessionFromServices({
    services,
    sessionManager: options.sessionManager,
    sessionStartEvent: options.sessionStartEvent,
    model,
  });
  return { ...created, services, diagnostics: services.diagnostics };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd,
  agentDir: PI_STATE_DIR,
  sessionManager: SessionManager.create(cwd),
});

await new InteractiveMode(runtime).run();
```

Five details in there are the ones that bite:

- **Keep `skillsOverride`.** It is easy to read as boilerplate and drop. Dropping it on the machine this was written on took the agent from 47 skills to 86 — pi had found another 39 in the user's own directories, adding some 20,000 characters to the system prompt, most of it about frameworks this agent has nothing to do with.

- **`mode: "tui"`.** `buildSystemPrompt` already knows this mode — it is the default. It drops the `<non-interactive>` block, which tells the agent that nobody is watching, that it must never wait for input, that it must not drive a browser, and that it should call `set_result`; and it drops the report contract. Drop the matching machinery with it — `set_result` and the report nudge in `run.ts` exist to produce an exit code, and an interactive session has nobody to return one to.
- **No `bindExtensions()`.** pi's own modes call it themselves; `src/session.ts` has to because its run loop is hand-rolled. The call is not idempotent — it re-emits `session_start` to every extension — so calling it in a TUI as well fires every startup handler twice.
- **`SessionManager.create(cwd)`**, not `inMemory()` — that is what gives you `/resume` and a transcript on disk.
- **`agentDir: PI_STATE_DIR`** stays, so extension and skill discovery keeps pointing at `~/.testeiya/pi` and not the user's pi install.

There is no `--model` flag in the snippet, so the run needs `TESTEIYA_MODEL`. `resolveModel` throws a `UsageError` when nothing names a model; keep that. A default model here would be a pin that goes stale and spends someone else's money.

Save it as `src/tui.ts` and it builds with everything else:

```bash
npm run build
TESTEIYA_MODEL=openrouter/anthropic/claude-sonnet-5 node dist/src/tui.js
```

Add it to `bin` in `package.json` to ship it as a command of its own.

## Other shapes

`InteractiveMode` is one of three run modes pi exports. The other two are worth knowing before you build something by hand:

- **`runPrintMode(runtime, …)`** — pi's own one-shot mode. Testeiya does not use it, because the report contract, the retry nudge and the exit-code mapping in `run.ts` are ours. If you want plain one-shot output, pi's is less code.
- **`runRpcMode(runtime)`** — JSON-RPC over stdio. This is the answer for embedding the agent in a service, a web UI, or a program in another language: run it as a subprocess and speak the protocol, instead of importing the SDK. See pi's `rpc.md`.

And for a UI that owns its own event loop, skip the modes entirely: subscribe with `session.subscribe()` and drive `session.prompt()`, which is all `src/run.ts` does — the same shape scales to a WebSocket, which is how the desktop app works.

## Keeping the QA behaviour

Whatever the front end, four things make the agent a *testing* agent rather than a generic one:

1. `buildSystemPrompt()` from `prompt/` — pass your harness's own capabilities through `sections`, `toolBullets` and `rules` instead of forking a fragment. If your harness can ask the user a question or open a browser, that belongs in your options, not in `prompt/`.
2. `additionalSkillPaths: [BUNDLED_SKILLS_DIR]` — the skills are most of the domain knowledge, so point this at whatever tree you vendor. A fresh clone has none until `node scripts/vendor-skills.js` fills it.
3. `tms` — `"mcp-direct"`, `"mcp-proxy"` or `"cli-only"`, matching how your harness actually reaches Testomat.io. Saying tools exist that do not wastes the model's turns discovering that.
4. The MCP extension, if you have both a token and a project id. A token alone identifies no project to the server; `tmsAccess()` in `src/mcp.ts` encodes that rule.

Contributions to the prompt are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Harness code stays yours.
