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

/** Reads pipelines/*.yml and writes `BUNDLED_PIPELINES` as a module and its types. */
export class PipelineBundle {
  constructor({ sourceDir = join(ROOT, "pipelines"), outputDir = join(ROOT, "dist", "src", "pipeline") } = {}) {
    this.sourceDir = sourceDir;
    this.outputDir = outputDir;
  }

  /** File name without `.yml` to the file's text, sorted by name. */
  read() {
    const files = readdirSync(this.sourceDir).filter((file) => file.endsWith(".yml")).sort();
    return Object.fromEntries(files.map((file) => [basename(file, ".yml"), readFileSync(join(this.sourceDir, file), "utf8")]));
  }

  write() {
    const pipelines = this.read();
    const header = "// Written by scripts/bundle-pipelines.js from pipelines/*.yml. Do not edit.\n";
    const body = `export const BUNDLED_PIPELINES = ${JSON.stringify(pipelines, null, 2)};\n`;
    writeFileSync(join(this.outputDir, "bundled.js"), header + body);
    writeFileSync(join(this.outputDir, "bundled.d.ts"), `${header}export declare const BUNDLED_PIPELINES: Record<string, string>;\n`);
    return Object.keys(pipelines);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = new PipelineBundle().write();
  console.log(`Bundled ${names.length} pipelines: ${names.join(", ")}`);
}
