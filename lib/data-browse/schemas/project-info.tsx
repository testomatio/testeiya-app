"use client";

import { col, createTableSchema } from "@/lib/table-schema";
import { Icon } from "@/lib/icons";
import { LabelChip } from "@/components/widgets/label-chip";
import { MetaPill } from "@/components/widgets/status-pill";
import type { ProjectInfo } from "@/lib/services/types";
import type { FilterMap } from "../params";

/**
 * Browse tables over the already-loaded `/info` object (plus the `labels` list
 * for label colours) — Labels, Tags and Environments. Like CI profiles these
 * never page: rows are built from the store and filtered locally, so `param`
 * is only the key `filterInfoRows` reads.
 */

export function buildLabelsSchema() {
  const tableSchema = createTableSchema({
    title: col
      .string()
      .label("Label")
      .icon("label")
      .size(260)
      .display("custom", { cell: (_v, row) => <LabelCell row={row as LabelRow} /> }),
    id: col
      .string()
      .label("Slug")
      .icon("tag")
      .notFilterable()
      .size(220)
      .display("code"),
    color: col
      .string()
      .label("Color")
      .icon("palette")
      .notFilterable()
      .size(140)
      .display("custom", { cell: (_v, row) => <ColorCell row={row as LabelRow} /> }),
    scope: col
      .string()
      .label("Shown in")
      .icon("visibility")
      .notFilterable()
      .size(180)
      .display("custom", { cell: (_v, row) => <ScopeCell row={row as LabelRow} /> }),
  });

  const filterMap: FilterMap = { title: { param: "title", kind: "search" } };
  return { tableSchema, filterMap, baseParams: {} };
}

export function buildTagsSchema() {
  const tableSchema = createTableSchema({
    tag: col
      .string()
      .label("Tag")
      .icon("sell")
      .size(320)
      .display("custom", { cell: (_v, row) => <TagCell row={row as TagRow} /> }),
  });

  const filterMap: FilterMap = { tag: { param: "tag", kind: "search" } };
  return { tableSchema, filterMap, baseParams: {} };
}

export function buildEnvironmentsSchema() {
  const tableSchema = createTableSchema({
    name: col
      .string()
      .label("Environment")
      .icon("cloud")
      .size(320)
      .display("custom", { cell: (_v, row) => <EnvCell row={row as EnvRow} /> }),
  });

  const filterMap: FilterMap = { name: { param: "name", kind: "search" } };
  return { tableSchema, filterMap, baseParams: {} };
}

export function buildFeaturesSchema() {
  const tableSchema = createTableSchema({
    name: col
      .string()
      .label("Feature")
      .icon("check_circle")
      .size(320)
      .display("custom", { cell: (_v, row) => <FeatureCell row={row as FeatureRow} /> }),
    key: col
      .string()
      .label("Key")
      .icon("code")
      .notFilterable()
      .size(280)
      .display("code"),
  });

  const filterMap: FilterMap = { name: { param: "name", kind: "search" } };
  return { tableSchema, filterMap, baseParams: {} };
}

export function buildFeatureRows(features: string[]): FeatureRow[] {
  return features.map((key) => ({
    id: `feature:${key}`,
    key,
    name: humanize(key),
  }));
}

export function buildLabelRows(labels: ProjectLabel[]): LabelRow[] {
  return labels.map((label) => ({
    id: label.id,
    title: label.title,
    color: label.color,
    scope: label.visibility ?? [],
  }));
}

export function buildTagRows(info: ProjectInfo): TagRow[] {
  return (info.tags ?? []).map((tag, i) => ({ id: `tag:${i}:${tag}`, tag }));
}

export function buildEnvironmentRows(info: ProjectInfo): EnvRow[] {
  return (info.environments ?? []).map((name, i) => ({
    id: `env:${i}:${name}`,
    name,
  }));
}

/** Apply the table's search input locally against one string key of the row. */
export function filterInfoRows<T extends Record<string, unknown>>(
  rows: T[],
  needle: unknown,
  key: keyof T,
): T[] {
  if (typeof needle !== "string") return rows;
  const text = needle.trim().toLowerCase();
  if (!text) return rows;
  return rows.filter((row) => String(row[key] ?? "").toLowerCase().includes(text));
}

function LabelCell({ row }: { row: LabelRow }) {
  return <LabelChip title={row.title} color={row.color} />;
}

function ColorCell({ row }: { row: LabelRow }) {
  if (!row.color) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-x-1.5">
      <span
        className="size-3 shrink-0 rounded-full border"
        style={{ background: row.color }}
      />
      <span className="truncate font-mono text-muted-foreground">
        {row.color}
      </span>
    </span>
  );
}

function ScopeCell({ row }: { row: LabelRow }) {
  if (!row.scope.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-x-1">
      {row.scope.map((place) => (
        <MetaPill key={place} className="capitalize">
          {place}
        </MetaPill>
      ))}
    </span>
  );
}

function TagCell({ row }: { row: TagRow }) {
  return (
    <span className="flex min-w-0 items-center gap-x-1.5">
      <Icon name="sell" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono">@{row.tag}</span>
    </span>
  );
}

function EnvCell({ row }: { row: EnvRow }) {
  return (
    <span className="flex min-w-0 items-center gap-x-1.5">
      <Icon name="cloud" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{row.name || "(empty)"}</span>
    </span>
  );
}

function FeatureCell({ row }: { row: FeatureRow }) {
  return (
    <span className="flex min-w-0 items-center gap-x-1.5">
      <Icon name="check" className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">{row.name}</span>
    </span>
  );
}

function humanize(slug: string): string {
  const words = slug.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ProjectLabel {
  id: string;
  title: string;
  color?: string;
  /** Where the label is displayed in Testomat.io (`filter`, `list`). */
  visibility?: string[];
  list?: boolean;
}

export interface LabelRow extends Record<string, unknown> {
  id: string;
  title: string;
  color?: string;
  scope: string[];
}

export interface TagRow extends Record<string, unknown> {
  id: string;
  tag: string;
}

export interface EnvRow extends Record<string, unknown> {
  id: string;
  name: string;
}

export interface FeatureRow extends Record<string, unknown> {
  id: string;
  key: string;
  name: string;
}
