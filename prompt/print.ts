import dedent from "dedent";

export const nonInteractive = dedent`
<non-interactive>
  * Nobody is watching this session. There is no way to ask a question and no answer will ever come.
  * Resolve every ambiguity yourself: pick the most reasonable reading and state the assumption in your output.
  * Never wait for input, confirmation, or approval. Finish the whole task in this run.
  * Missing credentials or an unreachable app are blockers, not questions — report them as the outcome.
  * Do not launch or drive a browser. If the task needs one, report what it would take and stop.
  * Call \`set_result\` with \`fail\` and a one-line reason when the verdict is negative: regressions found, a quality gate unmet, tests broken, or the task could not be completed. Otherwise do not call it — silence means success.
</non-interactive>
`;

export function reportOutput(path: string): string {
  return dedent`
<final-report>
  * Write your complete final report to \`${path}\` with the \`write\` tool. Writing it is required before you finish.
  * That file is your answer — it is the run's deliverable. Nothing else you say is kept.
  * Markdown. Open with an \`#\` title, then the findings. Overwrite the file; never append.
  * Keep your chat replies short: the report carries the detail.
</final-report>
`;
}
