/**
 * What `extract` is asked to find. No Node imports: the pipeline parser checks
 * a stage's `format:` with it in a Worker and a browser.
 */
export interface ExtractField {
  name: string;
  /** What the value is, as the user put it. */
  description: string;
}

/**
 * `--output` values into fields: "url: public url of a page" is the field `url`.
 * Text without a name is the one field `value`.
 */
export function parseExtractFields(formats: string[], what = "--output"): ExtractField[] | string {
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
