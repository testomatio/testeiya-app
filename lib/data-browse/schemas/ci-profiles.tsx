"use client";

import { col, createTableSchema } from "@/lib/table-schema";
import { Icon } from "@/lib/icons";
import { MetaPill } from "@/components/widgets/status-pill";
import type { CiProfile, ProjectInfo } from "@/lib/services/types";
import type { FilterMap } from "../params";

/**
 * The "CI profiles" browse table over the project's `/info` `ci_profiles`:
 * profile name, CI service, the profile's config key-values, and which
 * TESTOMATIO env vars the profile passes into the CI run.
 */

export function buildCiProfilesSchema() {
  const tableSchema = createTableSchema({
    name: col
      .string()
      .label("Profile")
      .icon("rocket_launch")
      .size(240)
      .display("custom", { cell: (_v, row) => <ProfileCell row={row as CiProfileRow} /> }),
    service: col
      .string()
      .label("Service")
      .notFilterable()
      .size(120)
      .display("custom", { cell: (_v, row) => <ServiceCell row={row as CiProfileRow} /> }),
    config: col
      .string()
      .label("Config")
      .notFilterable()
      .size(320)
      .display("custom", { cell: (_v, row) => <ConfigCell row={row as CiProfileRow} /> }),
    passes: col
      .string()
      .label("Passes to CI")
      .notFilterable()
      .size(240)
      .display("custom", { cell: (_v, row) => <PassesCell row={row as CiProfileRow} /> }),
  });

  // Rows come from the already-loaded `/info` object, so `param` is never sent
  // anywhere — `filterCiProfileRows` reads the same `name` key locally.
  const filterMap: FilterMap = {
    name: { param: "name", kind: "search" },
  };

  return { tableSchema, filterMap, baseParams: {} };
}

export function buildCiProfileRows(info: ProjectInfo): CiProfileRow[] {
  return (info.ci_profiles ?? []).map((profile, i) => ({
    id: `ci:${i}:${profile.profile_name}`,
    name: profile.profile_name,
    profile,
  }));
}

/** Apply the table's filter state (profile-name input) locally. */
export function filterCiProfileRows(
  rows: CiProfileRow[],
  state: Record<string, unknown>
): CiProfileRow[] {
  const name = typeof state.name === "string" ? state.name.trim().toLowerCase() : "";
  if (!name) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(name));
}

/** `key=value` pairs of a profile's config, for the cell and the detail pane. */
export function configEntries(profile: CiProfile): [string, string][] {
  const config = profile.config ?? {};
  return Object.entries(config).map(([k, v]) => [k, String(v)]);
}

export function passedEnvVars(profile: CiProfile): string[] {
  const vars: string[] = [];
  if (profile.pass_testomatio_key) vars.push("TESTOMATIO");
  if (profile.pass_testomatio_url) vars.push("TESTOMATIO_URL");
  if (profile.pass_run_id) vars.push("RUN_ID");
  return vars;
}

function ProfileCell({ row }: { row: CiProfileRow }) {
  return (
    <div className="flex min-w-0 items-center gap-x-2">
      <Icon name="rocket_launch" className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium" title={row.name}>
        {row.name}
      </span>
    </div>
  );
}

function ServiceCell({ row }: { row: CiProfileRow }) {
  const service = row.profile.service;
  if (!service) return <span className="text-xs text-muted-foreground">—</span>;
  return <MetaPill className="capitalize">{service}</MetaPill>;
}

function ConfigCell({ row }: { row: CiProfileRow }) {
  const entries = configEntries(row.profile);
  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const summary = entries.map(([k, v]) => `${k}=${v}`).join(" · ");
  return (
    <span className="truncate font-mono text-xs text-muted-foreground" title={summary}>
      {summary}
    </span>
  );
}

function PassesCell({ row }: { row: CiProfileRow }) {
  const vars = passedEnvVars(row.profile);
  if (vars.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-x-1">
      {vars.map((v) => (
        <MetaPill key={v} className="font-mono">
          {v}
        </MetaPill>
      ))}
    </div>
  );
}

export interface CiProfileRow extends Record<string, unknown> {
  id: string;
  name: string;
  profile: CiProfile;
}
