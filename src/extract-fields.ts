/**
 * What `extract` is asked to find. No Node imports: the pipeline parser checks
 * the values of `run!extract:` and `$value!extract:` with it in a Worker and a browser.
 */
export interface ExtractField {
  name: string;
  /** What the value is, as the user put it. */
  description: string;
}

/** The values `extract` finds: read from `--output` or a pipeline's `name: description` lines, and the task that asks for them. */
export class ExtractFields {
  /**
   * `--output` values into fields: "url: public url of a page" is the field `url`.
   * Text without a name is the one field `value`.
   */
  static parse(formats: string[], what = "--output"): ExtractField[] | string {
    if (formats.length === 0) return [{ name: "value", description: "the answer" }];
    const fields: ExtractField[] = [];
    for (const format of formats) {
      const named = format.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/s);
      let field: ExtractField = { name: "value", description: format.trim() };
      if (named) field = { name: named[1]!, description: named[2]!.trim() || named[1]! };
      if (!field.description) return `${what} needs a description of the value, e.g. "url: public url of the page"`;
      if (fields.some((other) => other.name === field.name)) {
        if (!named) return `only one ${what} value can go without a name; name each, e.g. "url: public url of the page"`;
        return `two ${what} values are called "${field.name}"`;
      }
      fields.push(field);
    }
    return fields;
  }

  /** The names of `name: description` lines a pipeline's builder already checked. */
  static names(lines: string[]): string[] {
    return ExtractFields.checked(lines).map((field) => field.name);
  }

  /** `name: description` lines a pipeline's builder already checked, as fields. */
  static checked(lines: string[]): ExtractField[] {
    const fields = ExtractFields.parse(lines);
    if (typeof fields === "string") throw new Error(fields);
    return fields;
  }

  /**
   * The task for values a pipeline asks for with `run!extract:` or `$value!extract:`,
   * where there is no text of what to find: the names and descriptions say it.
   */
  static prompt(fields: ExtractField[]): string {
    const lines = fields.map((field) => `- ${field.name}: ${field.description}`);
    return [
      "Find these values. Look where this job runs: the git checkout, the environment variables of the CI job, files in this folder, and the tools you have.",
      ...lines,
      "Submit them all at once. Do not guess a value you cannot find.",
    ].join("\n");
  }
}
