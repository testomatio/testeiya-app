import dedent from 'dedent';

/**
 * How an answer already posted stops being the current one, per host. The round
 * is the same wherever the thread lives — find your marked comments, diff from
 * the commit the last one carries, make it recede, write the current answer — so
 * a host contributes only its own rules: which of the two strategies its API
 * affords, and the facts about it that cannot be worked out from the API alone.
 *
 * The host comes from the environment, never from the remote. A remote says
 * where the code lives; only the CI variables say we are in a job that has a
 * subject to answer and a token to answer with.
 *
 * This table is the extension point. There is no default host: a job nothing
 * claims falls to `generic`, which states the choice and lets the agent make it.
 */
const HOSTS = {
  github: {
    env: ['GITHUB_ACTIONS'],
    rules: dedent`
    **Append and collapse.** GitHub hides a whole comment, so leave the earlier ones where they are and fold each one with the GraphQL \`minimizeComment\` mutation, classifier \`OUTDATED\`. Issues and pull requests share the same comment API, so this is the same call on both.

    Read comment bodies from \`body\`; \`body_text\` has the marker stripped out. \`isMinimized\` per comment is both the list you fold from and the check that it worked — a mutation that answers without an error has still not necessarily hidden anything. Never \`gh pr comment --edit-last\` or \`--delete-last\`: they mean the last comment by this user, which in CI is a bot account shared with every other tool in the repository.`,
  },

  gitlab: {
    env: ['GITLAB_CI'],
    rules: dedent`
    **Rewrite.** GitLab folds the body of a note but never the note itself, so a note per round leaves a column of headers behind. Keep one note in this thread and rewrite it: the current answer on top, the previous one under it inside a \`<details>\` block, stripped of the \`<details>\` block it already carried. Fold one generation, never a chain of them.

    \`CI_JOB_TOKEN\` cannot write notes, so \`$GITLAB_TOKEN\` must carry a project access token with the \`api\` scope; report it as a blocker when it is empty. Use notes rather than discussions: a discussion is a resolvable thread, and an unresolved one blocks the merge wherever all threads must be resolved. Read the note body back to check the rewrite landed and carries exactly one folded generation.`,
  },

  bitbucket: {
    env: ['BITBUCKET_BUILD_NUMBER'],
    rules: dedent`
    **Append and collapse.** Bitbucket resolves a whole comment thread, so leave the earlier ones where they are and resolve each one. Only a top-level comment resolves; a reply answers 403.

    \`$BITBUCKET_ACCESS_TOKEN\` carries the token; report it as a blocker when it is empty. Deleted comments stay in the list as blanked tombstones, so filter on \`deleted=false\`. \`resolved\` per thread is both the list you resolve from and the check that it worked. A pull request caps at 200 comments, so post once per round and never twice. The marker may render as visible text here — keep it anyway, since finding your own comments matters more than a tidy first line.`,
  },

  generic: {
    env: [],
    rules: dedent`
    **Find out which of the two applies.** If this host can hide, minimise, resolve or otherwise fold a whole comment, append the new answer and fold the earlier ones. If it can only edit, keep one comment and rewrite it, with the previous answer folded inside wherever the host renders collapsible markup.

    Whichever it is, find the field the host exposes for that state and read it back afterwards; if it exposes none, fetch the comment again and look. If the host can do neither, post the answer and say in your output that this host cannot collapse the earlier ones.`,
  },
} satisfies Record<string, Host>;

/**
 * Which host this job belongs to. `generic` when it is CI and nothing claims it,
 * nothing at all when it is not CI — a developer's own checkout has no thread.
 */
export function threadHost(env: Environment): ThreadHost | null {
  for (const [name, host] of Object.entries(HOSTS)) {
    if (host.env.some((variable) => env[variable])) return name as ThreadHost;
  }
  if (env.CI) return 'generic';
  return null;
}

/** What a comment of this thread opens with, and so what identifies it. */
export function threadMarker(thread: string): string {
  return `<!-- testeiya thread=${thread}`;
}

export function commentThread(options: CommentThreadOptions): string {
  const write = options.posts
    ? dedent`
    Your report is posted for you, once this turn ends. Do not post it yourself — so at step 5 no comment of yours is showing yet.`
    : dedent`
    Post it yourself, opening the body with that same marker line — so at step 5 the one comment of yours still showing is the one you just posted.`;
  return dedent`
  <comment-thread>
    This section governs threads you post into: a pull request, a merge request, an issue. It says nothing about any other kind of work.

    A comment you write opens with exactly this line, and your earlier ones already carry it:

    \`${options.marker}\`

    Yours in this conversation are the ones whose \`thread=\` is \`${options.thread}\`. A comment carrying a different thread belongs to another conversation on the same subject — never touch it.

    **Never delete a comment.** A human reply may be sitting under it, and everything here is reversible where a delete is not.

    Each round:

    1. Ask the host for the thread, now, in this round. Yours are the comments whose raw body starts \`${threadMarker(options.thread)}\` — read the raw body, a rendered one may have dropped the marker. Take the list, every id in it and how many there are from that answer alone. An id, a command line or a count further up this conversation describes the thread as it stood in an earlier round; reusing one acts on that thread, not this one.
    2. The newest one is your complete answer as of the \`commit=\` in its marker, so \`git diff <that sha>...HEAD\` is what you have not seen.
    3. Make **every** one of them recede, by the rule below. Not the first, not the one you folded last time — each comment of yours the host still shows. One folded and the rest left standing is the same broken thread as folding none.
    4. Write the **complete current answer**, not a delta — everything earlier is folded, so a delta would leave the thread with no visible state. Open with a short "Since the last round" list of what was fixed, what is new and what is still open.
    5. Read the thread back before you finish and check the state field on each of your comments. Nothing of yours may still be showing except this round's answer. Fold whatever is, then check again. If something will not recede, or the answer that landed is not the one you meant, say so in your output — a half-folded thread is a result to report, not a detail to drop.

    ${indent(write)}

    ${indent(HOSTS[options.host].rules)}
  </comment-thread>`;
}

// dedent trims the literal parts of a template, never what is interpolated into
// them, so a block spanning lines has to arrive already at the right column.
function indent(text: string): string {
  return text.split('\n').join('\n    ');
}

export type ThreadHost = keyof typeof HOSTS;

type Environment = Record<string, string | undefined>;

interface Host {
  /** A variable only this host's CI sets. Empty means nothing claims it. */
  env: string[];
  /** Which strategy its API affords, and what cannot be guessed about it. */
  rules: string;
}

export interface CommentThreadOptions {
  host: ThreadHost;
  /** Which conversation this run is, so parallel runs never touch each other. */
  thread: string;
  /**
   * The exact marker line a comment opens with. Built by the CLI so a comment
   * the agent posts itself is stamped the same way as one the CLI delivers —
   * the next round finds both by the same prefix.
   */
  marker: string;
  /** True when the CLI posts the report itself, so the agent must not. */
  posts?: boolean;
}
