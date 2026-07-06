import { toJS } from "mobx";

/*
 * Plain-JSON snapshot of the MobX service layer. Used by the Debug panel's Store
 * inspector to render live state, and by `DebugLogService.report()` to ship that
 * same state to the server so the agent can see the UI's view of the world
 * (current project, workspace classification, connection status, …). `root` and
 * function members are dropped; Maps/Sets are made JSON-safe.
 */

export function serviceSnapshot(store: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(store)) {
    if (value && typeof value === "object" && "root" in value) out[name] = toPlain(value);
  }
  return out;
}

export function toPlain(service: object): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(snapshot(service), jsonReplacer));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function snapshot(service: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(service)) {
    if (key === "root") continue;
    const value = (service as Record<string, unknown>)[key];
    if (typeof value === "function") continue;
    out[key] = toJS(value);
  }
  return out;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);
  return value;
}
