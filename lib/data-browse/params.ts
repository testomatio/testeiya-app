export type FilterKind =
  | "search"
  | "csv"
  | "array"
  | "boolean"
  | "single"
  | "daterange";

export interface FilterSpec {
  param: string;
  kind: FilterKind;
}

export type FilterMap = Record<string, FilterSpec>;

export type QueryParams = Record<string, string | string[]>;

/**
 * Turn filter state into native v2 query params (the shape the deployed backend
 * actually honours — verified: `filter[kind]` filters, the `query`/TQL string
 * does not). The raw TQL search box value (`state.q`) is forwarded verbatim via
 * the `tql` param (no `=` prefix, per the TQL docs).
 */
export function buildParams(
  state: Record<string, unknown>,
  map: FilterMap,
  opts?: { skip?: string[] },
): QueryParams {
  const params: QueryParams = {};

  const raw = typeof state.q === "string" ? state.q.trim() : "";
  if (raw) params.tql = raw.replace(/^=/, "").trim();

  const skip = new Set(opts?.skip ?? []);
  for (const [key, spec] of Object.entries(map)) {
    if (skip.has(key)) continue;
    const value = state[key];
    if (value == null) continue;
    nativeParam(params, spec, value);
  }
  return params;
}

function nativeParam(
  params: QueryParams,
  spec: FilterSpec,
  value: unknown,
): void {
  if (spec.kind === "search") {
    const text = String(value).trim();
    if (text) params[spec.param] = text;
    return;
  }
  if (!Array.isArray(value) || value.length === 0) return;
  if (spec.kind === "csv") {
    params[spec.param] = value.map(String).join(",");
    return;
  }
  if (spec.kind === "array") {
    params[spec.param] = value.map(String);
    return;
  }
  if (spec.kind === "single") {
    params[spec.param] = String(value[0]);
    return;
  }
  if (spec.kind === "boolean") {
    if (value.length === 1) params[spec.param] = String(value[0]);
    return;
  }
  if (spec.kind === "daterange") {
    const [from, to] = value;
    if (from && to) params[spec.param] = `${isoDate(from)},${isoDate(to)}`;
  }
}

function isoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as number);
  return date.toISOString().slice(0, 10);
}
