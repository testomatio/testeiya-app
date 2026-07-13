import { readFileSync } from "node:fs";
import { getBundledModels, type GeneratedProvider } from "@oh-my-pi/pi-ai";
import { resolveModelsCatalogPath } from "./project-dir.js";

/**
 * The vendored models catalog (`cli/models.catalog.json`), produced by
 * `bunosh collect:models` (re-run on every release). The SDK's bundled
 * models.json is frozen at the SDK's publish date and its registry never
 * removes entries, so stale models linger and unauthenticated providers only
 * show the old list. The catalog fixes the *listing*: models the provider no
 * longer serves are pruned, models newer than the SDK snapshot are added.
 * Model *resolution* still goes through the SDK registry (live discovery in
 * session-factory), so picking a catalog-only model works as long as the
 * provider serves it.
 */

let cache: CatalogFile | null | undefined;

export function applyModelsCatalog(provider: string, models: ModelListing[]): ModelListing[] {
  const catalog = catalogFor(provider);
  if (!catalog) return models;
  const bundledIds = new Set(
    getBundledModels(provider as GeneratedProvider).map((m) => m.id)
  );
  return mergeModelsCatalog(models, bundledIds, catalog);
}

/**
 * Pure merge: drop models that exist only in the SDK's stale bundled list and
 * were pruned from the catalog (live-discovered ones are never bundled-only),
 * then append catalog models the registry doesn't know yet.
 */
export function mergeModelsCatalog(
  models: ModelListing[],
  bundledIds: Set<string>,
  catalog: Record<string, CatalogEntry>
): ModelListing[] {
  const seen = new Set(models.map((m) => m.id));
  const merged = models.filter((m) => catalog[m.id] || !bundledIds.has(m.id));
  for (const [id, entry] of Object.entries(catalog)) {
    if (seen.has(id)) continue;
    merged.push({ id, name: entry.name || id });
  }
  return merged;
}

function catalogFor(provider: string): Record<string, CatalogEntry> | null {
  if (cache === undefined) cache = readCatalogFile();
  return cache?.providers?.[provider] ?? null;
}

function readCatalogFile(): CatalogFile | null {
  try {
    return JSON.parse(readFileSync(resolveModelsCatalogPath(), "utf-8")) as CatalogFile;
  } catch {
    return null;
  }
}

export interface ModelListing {
  id: string;
  name: string;
}

interface CatalogEntry {
  name?: string;
}

interface CatalogFile {
  collectedAt?: string;
  providers?: Record<string, Record<string, CatalogEntry>>;
}
