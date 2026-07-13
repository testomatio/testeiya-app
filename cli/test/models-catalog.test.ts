import { describe, expect, test } from "bun:test";
import { mergeModelsCatalog } from "../src/models-catalog.js";

describe("mergeModelsCatalog", () => {
  const catalog = {
    "gpt-5.4": { name: "GPT-5.4" },
    "gpt-6": { name: "GPT-6" },
  };

  test("prunes bundled models missing from the catalog", () => {
    const models = [
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ];
    const merged = mergeModelsCatalog(models, new Set(["gpt-5.4", "gpt-3.5-turbo"]), catalog);
    expect(merged.map((m) => m.id)).toContain("gpt-5.4");
    expect(merged.map((m) => m.id)).not.toContain("gpt-3.5-turbo");
  });

  test("keeps live-discovered models that are not bundled", () => {
    const models = [{ id: "gpt-7-preview", name: "GPT-7 Preview" }];
    const merged = mergeModelsCatalog(models, new Set(["gpt-5.4"]), catalog);
    expect(merged.map((m) => m.id)).toContain("gpt-7-preview");
  });

  test("adds catalog models the registry does not know", () => {
    const models = [{ id: "gpt-5.4", name: "GPT-5.4" }];
    const merged = mergeModelsCatalog(models, new Set(["gpt-5.4"]), catalog);
    expect(merged).toContainEqual({ id: "gpt-6", name: "GPT-6" });
  });

  test("does not duplicate models present in both", () => {
    const models = [{ id: "gpt-5.4", name: "GPT-5.4 (live)" }];
    const merged = mergeModelsCatalog(models, new Set(["gpt-5.4"]), catalog);
    expect(merged.filter((m) => m.id === "gpt-5.4")).toHaveLength(1);
    expect(merged[0].name).toBe("GPT-5.4 (live)");
  });

  test("falls back to the id when a catalog entry has no name", () => {
    const merged = mergeModelsCatalog([], new Set(), { "bare-model": {} });
    expect(merged).toContainEqual({ id: "bare-model", name: "bare-model" });
  });
});
