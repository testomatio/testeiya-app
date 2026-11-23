import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { DiskFiles, type FileText } from "scripted-yaml";

import { PACKAGE_ROOT } from "../env.js";
import { UsageError } from "../model.js";
import type { Override } from "./override.js";
import type { PipelineDefinition } from "./pipeline-definition.js";
import { PipelineError } from "./pipeline-error.js";
import { DSL_FILE, PipelineSource } from "./pipeline-source.js";
import type { PipelineSpec } from "./spec.js";

const BUNDLED_DIR = join(PACKAGE_ROOT, "pipelines");

/**
 * A pipeline file, found by path or bundled name. It reads the text and hands
 * it to a `PipelineSource`, which validates it. `$extends: name` is a bundled
 * pipeline; `$extends: ./path.yml` a file beside it. Every message names the file.
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
    const files = readdirSync(BUNDLED_DIR).filter((file) => file.endsWith(".yml") && file !== DSL_FILE).sort();
    return files.map((file) => {
      const spec = new PipelineFile(join(BUNDLED_DIR, file)).read();
      return { name: basename(file, ".yml"), description: spec.description, target: spec.target };
    });
  }

  text(): string {
    return readFileSync(this.path, "utf8");
  }

  read(overrides: Override[] = []): PipelineSpec {
    return this.definition(overrides).spec;
  }

  /** The pipeline with `$extends` and every override applied, ready to run. */
  definition(overrides: Override[] = []): PipelineDefinition {
    const source = this.source(this.text());
    return this.located(() => source.definition(overrides));
  }

  /** Parse text as this file, so a copy keeps the file's name and finds what it extends. */
  parse(text: string): PipelineDefinition {
    return this.located(() => this.source(text).definition());
  }

  private source(text: string): PipelineSource {
    const name = basename(this.path).replace(/\.ya?ml$/, "");
    return new PipelineSource(text, { name, file: this.path, read: (path, from) => PipelineFile.parent(path, from), files: new DiskFiles() });
  }

  /** A bundled pipeline by its name. A path is left to the disk, relative to the file that names it. */
  private static parent(name: string, from: string | undefined): FileText | undefined {
    if (PipelineFile.isPath(name)) return undefined;
    const bundled = join(BUNDLED_DIR, `${name}.yml`);
    if (!existsSync(bundled)) throw new PipelineError(`no pipeline "${name}" to extend`);
    const file = new PipelineFile(bundled);
    // The bundled one: a file called regression may extend the bundled regression.
    if (from !== undefined && resolve(file.path) === resolve(from)) return undefined;
    return { file: file.path, text: file.text() };
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
