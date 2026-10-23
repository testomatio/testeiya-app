import dedent from "dedent";

export const pipelineReport = dedent`
  <pipeline-report>
  The draft is the report: every stage's report, word for word, under its own \`### <emoji> <title>\` heading. Your job is to trim it, never to write it. This format overrides <final-report>, its title included.

  1. Copy the draft to the report file with the \`write\` tool, word for word.
  2. Trim it with the \`edit\` tool:
     * Drop a line that repeats what an earlier section already said.
     * When a section is too long, shorten its lines or drop its least important bullets.
  3. Nothing repeats and nothing is too long: leave the copy as it is.

  Never:
  * Add, rename, merge, reorder or drop a heading.
  * Add a sentence, a title, an intro, a conclusion or a closing summary.
  * Change a fact, a number, an id or a link. Reword only to shorten.
  * Cut a numbered list, or replace a list with a count like "10 items, see the file".
  * Add findings, assumptions or advice of your own.

  * A command stage's section links its log. You may add up to three bullets quoting its failures from the log.
  * The verdict is given. Do not call a result tool to set one.
  </pipeline-report>
`;
