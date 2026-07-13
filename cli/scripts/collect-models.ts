#!/usr/bin/env bun
/**
 * Re-collect the vendored models catalog (cli/models.catalog.json).
 *
 * For every provider in the SDK's bundled models.json, fetch the provider's
 * live model listing through the SDK's own descriptor fetchers
 * (PROVIDER_DESCRIPTORS → createModelManagerOptions().fetchDynamicModels).
 * Models the provider no longer serves are dropped unless models.dev knows a
 * release date within the last year (a fresh model missing from a flaky
 * listing survives; a dead year-old model is removed). Providers without a
 * live listing (no fetcher, no API key, request failed) keep their bundled
 * list unchanged.
 *
 * API keys are read from each descriptor's catalogDiscovery.envVars plus the
 * conventional <PROVIDER>_API_KEY, via the same .env loading the app uses —
 * the more provider keys the environment has, the more providers get pruned.
 *
 * The catalog is merged into GET /api/providers/models responses by
 * cli/src/models-catalog.ts. Run `bunosh collect:models` (from cli/) or
 * `bunosh harness:models` (repo root); the release workflow re-runs it so
 * every release ships current model lists.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getBundledModels,
  getBundledProviders,
  PROVIDER_DESCRIPTORS,
  type Api,
  type Model,
  type ProviderDescriptor,
} from "@oh-my-pi/pi-ai";
import { loadEnvFiles } from "../src/load-env.js";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const LISTING_TIMEOUT_MS = 60_000;
const MODELS_DEV_URL = "https://models.dev/api.json";
const OUTPUT_PATH = join(import.meta.dir, "..", "models.catalog.json");

loadEnvFiles();

const releaseDates = await loadReleaseDates();
const providers: Record<string, Record<string, CatalogEntry>> = {};
let liveProviders = 0;
let totalRemoved = 0;

for (const provider of [...getBundledProviders()].sort()) {
  const bundled = getBundledModels(provider);
  const live = await fetchLiveListing(String(provider));
  if (!live) {
    providers[String(provider)] = toEntries(bundled);
    console.log(`  = ${provider}: kept ${bundled.length} bundled (no live listing)`);
    continue;
  }
  liveProviders += 1;
  const liveIds = new Set(live.map((m) => m.id));
  const removed: string[] = [];
  const kept = bundled.filter((m) => {
    if (liveIds.has(m.id)) return false;
    if (isRecent(String(provider), m.id)) return true;
    removed.push(m.id);
    return false;
  });
  const added = live.filter((m) => !bundled.some((b) => b.id === m.id)).length;
  providers[String(provider)] = toEntries([...kept, ...live]);
  totalRemoved += removed.length;
  console.log(
    `  ✓ ${provider}: ${liveIds.size} live + ${kept.length} kept, +${added} new, -${removed.length} removed`
  );
  for (const id of removed) console.log(`      - ${id}`);
}

writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify({ collectedAt: new Date().toISOString(), providers }, null, "\t")}\n`
);
console.log(
  `\nWrote ${OUTPUT_PATH} (${Object.keys(providers).length} providers, ${liveProviders} from live listings, ${totalRemoved} models removed)`
);

async function fetchLiveListing(provider: string): Promise<Model<Api>[] | null> {
  const descriptor = PROVIDER_DESCRIPTORS.find((d) => String(d.providerId) === provider);
  if (!descriptor) return null;
  const apiKey = resolveApiKey(descriptor);
  const allowUnauthenticated =
    descriptor.catalogDiscovery?.allowUnauthenticated ?? descriptor.allowUnauthenticated;
  if (!apiKey && !allowUnauthenticated) return null;
  const options = descriptor.createModelManagerOptions({ apiKey });
  if (!options.fetchDynamicModels) return null;
  try {
    const models = await withTimeout(options.fetchDynamicModels(), LISTING_TIMEOUT_MS);
    if (!models?.length) return null;
    return [...models];
  } catch (err) {
    console.warn(
      `  ! ${provider}: live listing failed — ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

function resolveApiKey(descriptor: ProviderDescriptor): string | undefined {
  const conventional = `${String(descriptor.providerId)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase()}_API_KEY`;
  for (const name of [...(descriptor.catalogDiscovery?.envVars ?? []), conventional]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function toEntries(models: readonly Model<Api>[]): Record<string, CatalogEntry> {
  const entries: Record<string, CatalogEntry> = {};
  for (const model of [...models].sort((a, b) => a.id.localeCompare(b.id))) {
    entries[model.id] = { name: model.name ?? model.id };
  }
  return entries;
}

function isRecent(provider: string, id: string): boolean {
  const date =
    releaseDates.byProvider.get(provider)?.get(normalizeId(id)) ??
    releaseDates.byId.get(normalizeId(id)) ??
    releaseDates.byId.get(normalizeId(tailOf(id)));
  if (!date) return false;
  return Date.now() - date < YEAR_MS;
}

async function loadReleaseDates(): Promise<ReleaseDateIndex> {
  const index: ReleaseDateIndex = { byProvider: new Map(), byId: new Map() };
  try {
    const response = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as Record<
      string,
      { models?: Record<string, { release_date?: string }> }
    >;
    for (const [providerId, entry] of Object.entries(payload)) {
      const perProvider = new Map<string, number>();
      for (const [modelId, model] of Object.entries(entry?.models ?? {})) {
        const parsed = Date.parse(model?.release_date ?? "");
        if (!Number.isFinite(parsed)) continue;
        perProvider.set(normalizeId(modelId), parsed);
        indexDate(index.byId, normalizeId(modelId), parsed);
        indexDate(index.byId, normalizeId(tailOf(modelId)), parsed);
      }
      index.byProvider.set(providerId, perProvider);
    }
  } catch (err) {
    console.warn(
      `! models.dev unavailable (${err instanceof Error ? err.message : String(err)}) — unlisted models are pruned by live listings alone`
    );
  }
  return index;
}

function indexDate(map: Map<string, number>, key: string, date: number): void {
  const existing = map.get(key);
  if (existing && existing >= date) return;
  map.set(key, date);
}

function tailOf(id: string): string {
  const slash = id.lastIndexOf("/");
  if (slash < 0) return id;
  return id.slice(slash + 1);
}

function normalizeId(id: string): string {
  return id.toLowerCase().replace(/[.\s]/g, "-");
}

interface CatalogEntry {
  name: string;
}

interface ReleaseDateIndex {
  byProvider: Map<string, Map<string, number>>;
  byId: Map<string, number>;
}
