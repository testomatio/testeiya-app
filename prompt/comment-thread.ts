import dedent from 'dedent';

/**
 * How a host collapses a comment. The round is the same everywhere, so a host
 * adds one line of mechanism, never a round of its own.
 *
 * The host comes from the environment, never from the remote: a remote says
 * where the code lives, CI variables say we have a thread to answer in.
 */
const HOSTS = {
  github: {
    env: ['GITHUB_ACTIONS'],
    collapse: dedent`
    Collapse with the \`minimizeComment\` mutation, classifier \`OUTDATED\`; \`isMinimized\` reports it. Read \`body\`, not \`body_text\` — that one strips the marker. Never \`--edit-last\` or \`--delete-last\`: in CI that is a bot account shared with every other tool here.`,
  },

  gitlab: {
    env: ['GITLAB_CI'],
    collapse: dedent`
    Notes cannot collapse, only be rewritten, so keep one note: current answer on top, the previous one under it in \`<details>\`. One generation, never a chain. \`$GITLAB_TOKEN\` needs \`api\` scope — a blocker when empty. Notes, not discussions.`,
  },

  bitbucket: {
    env: ['BITBUCKET_BUILD_NUMBER'],
    collapse: dedent`
    Collapse by resolving the comment thread; \`resolved\` reports it. Top-level comments only, a reply answers 403. \`$BITBUCKET_ACCESS_TOKEN\` — a blocker when empty. Deleted comments linger as tombstones, so filter \`deleted=false\`. The cap is 200 comments.`,
  },

  generic: {
    env: [],
    collapse: dedent`
    Use whatever hides a whole comment here — hide, minimise, collapse, resolve — and read back whatever field reports it. If the host can only edit, keep one comment and rewrite it with the previous answer folded inside. If it can do neither, say so in your output.`,
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
  return dedent`
  <comment-thread>
    You answer in a thread — a pull request, a merge request, an issue — and it shows one answer at a time. Yours open with this line:

    \`${options.marker}\`

    ${indent(round(options))}
  </comment-thread>`;
}

/**
 * Whoever posts the answer collapses what came before it, because only the
 * poster knows which comment is new. When the command delivers, the agent is
 * left with the half it is good at: reading the thread and writing the answer.
 */
function round(options: CommentThreadOptions): string {
  if (options.delivered) {
    return dedent`
    Each round:

    1. Fetch the thread from the host. Yours are the raw bodies starting \`${threadMarker(options.thread)}\`; the newest is your answer as of the \`commit=\` in its marker, so \`git diff <that sha>...HEAD\` is what you have not seen. A different \`thread=\` is someone else's conversation.
    2. ${answer(options)}

    Posting it and collapsing the older ones are done for you. Never post, edit, collapse or delete a comment yourself.`;
  }

  return dedent`
  Each round:

  1. Fetch the thread from the host. Fresh — an id or a count from earlier in this conversation is stale.
  2. Yours are the raw bodies starting \`${threadMarker(options.thread)}\`. Collect every id. Another \`thread=\` is someone else's conversation.
  3. ${answer(options)}
  4. ${post(options)}
  5. Collapse every id from step 2 — all of them, the newest included. Only what you just posted stays open. Collapsing twice is harmless, skipping one leaves a stale answer on screen. Never delete: a reply may sit underneath.
  6. Fetch again. Nothing of yours but the new comment is open, or you say so in your output.

  ${indent(HOSTS[options.host].collapse)}`;
}

// Steps 3 and 4 are where the body comes from. Posting the report file verbatim
// is what keeps the comment the report a reader expects, not a closing remark.
function answer(options: CommentThreadOptions): string {
  const where = options.reportFile ? ` to \`${options.reportFile}\`` : '';
  const parts = [
    `Write the complete current answer${where}, never a delta.`,
    'Open with "Since the last round": what was fixed, what is new, what is still open.',
    'Its first line is the marker above.',
  ];
  if (options.footer) parts.push(`Its last line is exactly \`${options.footer}\`.`);
  return parts.join(' ');
}

function post(options: CommentThreadOptions): string {
  if (!options.reportFile) return 'Post it as a new comment.';
  return `Post that file as a new comment — the comment is the file, nothing added and nothing summarised.`;
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
  /** How step 3 is done here, and what step 5 reads. */
  collapse: string;
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
  /** The report file, so the comment body is the report and not a remark. */
  reportFile?: string;
  /** The line the CLI would have signed the report with, if any. */
  footer?: string;
  /** True when the command posts the answer and collapses the older ones. */
  delivered?: boolean;
}
