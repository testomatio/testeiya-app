import dedent from "dedent";

export const verdict = dedent`
  The verdict:
  * Call \`set_result\` with \`fail\` and a one-line reason when the verdict is negative: regressions found, a quality gate unmet, tests broken, or the task could not be completed. Otherwise do not call it: silence means success.
  * An advisory review that found nothing the author must act on passes.
`;

export function report(options: ReportOptions): string[] {
  const parts: string[] = [];
  if (options.extract) parts.push(extraction(options.extract));
  else if (options.brief) parts.push(briefAnswer);
  if (options.outputFile) parts.push(finalReport(options.outputFile));
  return parts;
}

export function finalReport(path: string): string {
  return dedent`
    <final-report>
    * Write your complete final report to \`${path}\` with the \`write\` tool. Writing it is required before you finish.
    * That file is your answer. It is the run's deliverable; nothing else you say is kept.
    * A skill's or the task's output format overrides every rule in this block, including the title. Follow it strictly.
    * Decide the **severity of your report**. Low severity: a few short bullets, nothing more.
    * Do not make the reader go through a long report for a minor issue with no effect.
    * Severity decides how many items you report, not how long each one is. Even a critical finding is: what breaks, for whom, when.
    * Before writing, delete from every item:
      * How the code works: "because…", "unlike…", "only checks…".
      * Examples in parentheses and "e.g.".
      * "Either… or…" alternatives. Pick the expected result.
      * Anything already said in another section.
    * If the report is still long, drop the lowest-severity items.
    * Format as markdown. Open with an \`##\` title, then the findings. Overwrite the file; never append.
    * In a thread round (see <comment-thread>) the file is the whole current answer, never a delta.
    * Prefer short sentences and bullet points. Avoid long paragraphs.
    * Prefer readability over detail: the report is for QA engineers and managers, not developers.
    </final-report>
  `;
}

export const briefAnswer = dedent`
  <answer>
  * You were asked a question, not given a task. Answer it.
  * Lead with the answer in one line, then the evidence you checked.
  * A few sentences. No report file, no headings, no plan.
  * Say plainly when what you found does not settle the question.
  </answer>
`;

/** `testeiya extract`: the answer is values, submitted through a tool. */
export function extraction(fields: Array<{ name: string; description: string }>): string {
  // Lines joined, not a dedent template: dedent re-indents an interpolated list.
  return [
    "<extraction>",
    "* You were asked to find values, not to write a report. Find each one:",
    ...fields.map((field) => `  * \`${field.name}\`: ${field.description}`),
    "* Look them up with your tools: files, git, the CLIs and MCP servers you have. Do not guess and do not invent a value.",
    "* Submit them with `submit_values`, once, each as a single line with only the value.",
    "* If a value cannot be found, call `set_result` with `fail` and a one-line reason, and do not call `submit_values`.",
    "* No report, no summary, no headings. After submitting, stop.",
    "</extraction>",
  ].join("\n");
}

export interface ReportOptions {
  /** The values `testeiya extract` asks for. Replaces the answer and report rules. */
  extract?: Array<{ name: string; description: string }>;
  /** Absolute path the agent must write its final report to (`--output`). */
  outputFile?: string;
  /** Answer a question instead of doing a task and reporting (`testeiya ask`). */
  brief?: boolean;
}
