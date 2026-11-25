import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { ExtractFields, type ExtractField } from "../extract-fields.js";
import type { TaskOutcome, TaskRequest } from "../run.js";
import type { Item, StageContext } from "./stage.js";
import { TaskStage } from "./task-stage.js";
import type { Variables } from "./variables.js";

/**
 * `run!extract:` an agent stage whose answer is values, as `testeiya extract`.
 * The names and descriptions are its task, with its inputs. It writes them
 * to `<id>.values.json` for a later stage to read, and as `name: value` lines
 * to `<id>.md` for the summary. No values found: the stage fails.
 */
export class ExtractStage extends TaskStage {
  // The values come back in the outcome: a child process would only leave its stdout.
  protected readonly spawns = false;

  files(): string[] {
    return [...super.files(), `${this.id}.values.json`];
  }

  /** The envelope only: there is no report for the model to write. */
  protected request(context: StageContext, item: Item, outputs: string[], task: string): TaskRequest {
    const request = super.request(context, item, outputs.filter((output) => !output.endsWith(".md")), task);
    request.extract = this.fields();
    return request;
  }

  /** No text is written: the values say what to find. */
  protected text(_context: StageContext, _vars: Variables): string {
    return ExtractFields.prompt(this.fields());
  }

  protected finished(dir: string, item: Item, outcome: TaskOutcome): void {
    const values = outcome.envelope.values;
    if (!values) return;
    const base = join(dir, this.folder, `${this.id}${item.suffix}`);
    writeFileSync(`${base}.values.json`, `${JSON.stringify(values, null, 2)}\n`);
    writeFileSync(`${base}.md`, this.fields().map((field) => `${field.name}: ${values[field.name]}\n`).join(""));
  }

  private fields(): ExtractField[] {
    return ExtractFields.checked(this.spec.extract ?? []);
  }
}
