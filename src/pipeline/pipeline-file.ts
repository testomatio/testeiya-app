import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { PACKAGE_ROOT } from "../env.js";
import { UsageError } from "../model.js";
import type { Overlay } from "./overlay.js";
import { PipelineError } from "./pipeline-error.js";
import { PipelineSource } from "./pipeline-source.js";
import type { PipelineSpec } from "./spec.js";

const BUNDLED_DIR = join(PACKAGE_ROOT, "pipelines");

/**
 * A pipeline file, found by path or bundled name. It reads the text and hands
 * it to a `PipelineSource`, which validates it. Every message names the file.
 */
export class PipelineFile {
  constructor(readonly path: string) {}

  /** A path when it looks like one, otherwise a bundled pipeline's name. */
  static find(name: string): PipelineFile {
    if (PipelineFile.isPath(name)) {
      if (!existsSync(name)) throw new UsageError(`no pipeline file ${name}`);
      return new PipelineFile(name);
    }
    const bundled = join(BUNDLED_DIR, `${name}.yml`);
    if (existsSync(bundled)) return new PipelineFile(bundled);
    throw new UsageError(`no pipeline "${name}" — run "testeiya pipeline" to list them, or pass a .yml path`);
  }

  static bundled(): Array<{ name: string; description: string; target?: string }> {
    if (!existsSync(BUNDLED_DIR)) return [];
    const files = readdirSync(BUNDLED_DIR).filter((file) => file.endsWith(".yml")).sort();
    return files.map((file) => {
      const spec = new PipelineFile(join(BUNDLED_DIR, file)).read();
      return { name: basename(file, ".yml"), description: spec.description, target: spec.target };
    });
  }

  text(): string {
    return readFileSync(this.path, "utf8");
  }

  read(overlays: Overlay[] = []): PipelineSpec {
    return this.resolve(overlays).spec;
  }

  /** The spec with `extends` and every overlay applied, and the same as YAML, which needs neither. */
  resolve(overlays: Overlay[] = []): { spec: PipelineSpec; text: string } {
    const source = this.source(this.text());
    return this.located(() => ({ spec: source.spec(overlays), text: source.text(overlays) }));
  }

  /** Parse text as this file, so a copy keeps the file's name. */
  parse(text: string): PipelineSpec {
    return this.located(() => this.source(text).spec());
  }

  /** `chain` is every file on the way here, absolute, so a loop is caught across folders. */
  private source(text: string, chain = [resolve(this.path)], named = true): PipelineSource {
    const name = named ? basename(this.path).replace(/\.ya?ml$/, "") : undefined;
    return new PipelineSource(text, { name, resolve: (parent) => this.parent(parent, chain) });
  }

  // A path is relative to this file. The parent comes back with its own `extends` applied.
  private parent(name: string, chain: string[]): string {
    const base = PipelineFile.find(PipelineFile.isPath(name) ? resolve(dirname(this.path), name) : name);
    const at = resolve(base.path);
    if (chain.includes(at)) throw new PipelineError(`extends ${name} loops back to itself`, { key: "extends" });
    return base.located(() => base.source(base.text(), [...chain, at], false).text());
  }

  private located<T>(read: () => T): T {
    try {
      return read();
    } catch (err) {
      if (err instanceof PipelineError) throw err.in(this.path);
      throw err;
    }
  }

  private static isPath(name: string): boolean {
    return name.endsWith(".yml") || name.endsWith(".yaml") || name.includes("/") || name.includes("\\");
  }
}
