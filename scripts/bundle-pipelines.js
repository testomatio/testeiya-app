/**
 * Writes the bundled pipelines into the build as data, so `testeiya/pipeline`
 * lists them where there is no folder to read: a Worker, a browser.
 *
 *   node scripts/bundle-pipelines.js   (npm run build runs it after tsc)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(import.meta.dirname, "..");

const DSL_FILE = "pipeline.dsl.yml";

/** Reads pipelines/*.yml and writes `BUNDLED_PIPELINES`, and the DSL they are checked against as `BUNDLED_DSL`. */
export class PipelineBundle {
  constructor({ sourceDir = join(ROOT, "pipelines"), outputDir = join(ROOT, "dist", "src", "pipeline") } = {}) {
    this.sourceDir = sourceDir;
    this.outputDir = outputDir;
  }

  /** File name without `.yml` to the file's text, sorted by name. */
  read() {
    const files = readdirSync(this.sourceDir).filter((file) => file.endsWith(".yml") && file !== DSL_FILE).sort();
    return Object.fromEntries(files.map((file) => [basename(file, ".yml"), readFileSync(join(this.sourceDir, file), "utf8")]));
  }

  write() {
    const pipelines = this.read();
    const header = "// Written by scripts/bundle-pipelines.js from pipelines/*.yml. Do not edit.\n";
    const dsl = readFileSync(join(this.sourceDir, DSL_FILE), "utf8");
    const body = `export const BUNDLED_PIPELINES = ${JSON.stringify(pipelines, null, 2)};\nexport const BUNDLED_DSL = ${JSON.stringify(dsl)};\n`;
    writeFileSync(join(this.outputDir, "bundled.js"), header + body);
    const types = "export declare const BUNDLED_PIPELINES: Record<string, string>;\nexport declare const BUNDLED_DSL: string;\n";
    writeFileSync(join(this.outputDir, "bundled.d.ts"), header + types);
    return Object.keys(pipelines);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = new PipelineBundle().write();
  console.log(`Bundled ${names.length} pipelines: ${names.join(", ")}`);
}
