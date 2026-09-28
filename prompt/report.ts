import dedent from "dedent";

export const verdict = dedent`
  The verdict:
  * Call \`set_result\` with \`fail\` and a one-line reason when the verdict is negative: regressions found, a quality gate unmet, tests broken, or the task could not be completed. Otherwise do not call it: silence means success.
  * An advisory review that found nothing the author must act on passes.
`;

export function report(options: ReportOptions): string[] {
  const parts: string[] = [];
  if (options.brief) parts.push(briefAnswer);
  if (options.outputFile) parts.push(finalReport(options.outputFile));
  return parts;
}

export function finalReport(path: string): string {
  return dedent`
    <final-report>
    * Write your complete final report to \`${path}\` with the \`write\` tool. Writing it is required before you finish.
    * That file is your answer. It is the run's deliverable; nothing else you say is kept.
    * A skill's output format overrides every rule in this block, including the title. Follow it strictly.
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

export interface ReportOptions {
  /** Absolute path the agent must write its final report to (`--output`). */
  outputFile?: string;
  /** Answer a question instead of doing a task and reporting (`testeiya ask`). */
  brief?: boolean;
}
