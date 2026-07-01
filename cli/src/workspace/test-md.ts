// Parsing helpers for `*.test.md` files — the check-tests markdown format where a
// file is a suite (`<!-- suite\nid: @S… -->`) and each test is a `<!-- test\nid:
// @T… -->` block above a `#`/`##` heading. Shared by the delete + rename endpoints.

export const TEST_MD_RE = /\.test\.md$/i;

const SUITE_ID_RE = /@S([\w\d]{8})/;
const TEST_ID_RE = /@T([\w\d]{8})/;
const TEST_MARKER_RE = /^<!--\s*test\b/;
const ANY_MARKER_RE = /^<!--\s*(test|suite)\b/;
const HEADING_RE = /^#{1,2}\s+(.+?)\s*$/;

/** The suite id (`@S…`, prefix stripped) from a file's `<!-- suite` block. */
export function suiteId(content: string): string | null {
  const match = SUITE_ID_RE.exec(content);
  if (!match) return null;
  return match[1];
}

/** Line range of the test whose heading equals `anchor`, marker line through the
 *  line before the next `<!-- test`/`<!-- suite` marker (or EOF). */
export function findTestBlock(
  lines: string[],
  anchor: string
): { start: number; end: number } | null {
  for (let i = 0; i < lines.length; i++) {
    if (!TEST_MARKER_RE.test(lines[i])) continue;
    if (blockTitle(lines, i) !== anchor) continue;
    let end = lines.length - 1;
    for (let j = i + 1; j < lines.length; j++) {
      if (!ANY_MARKER_RE.test(lines[j])) continue;
      end = j - 1;
      break;
    }
    return { start: i, end };
  }
  return null;
}

/** The test id (`@T…`, prefix stripped) inside a block. */
export function blockTestId(lines: string[], block: { start: number; end: number }): string | null {
  const match = TEST_ID_RE.exec(lines.slice(block.start, block.end + 1).join("\n"));
  if (!match) return null;
  return match[1];
}

/** Index of the block's first `#`/`##` heading line, or -1. */
export function blockHeadingLine(lines: string[], block: { start: number; end: number }): number {
  for (let j = block.start + 1; j <= block.end; j++) {
    if (HEADING_RE.test(lines[j])) return j;
  }
  return -1;
}

function blockTitle(lines: string[], markerLine: number): string | null {
  for (let j = markerLine + 1; j < lines.length; j++) {
    if (ANY_MARKER_RE.test(lines[j])) return null;
    const match = HEADING_RE.exec(lines[j]);
    if (match) return match[1];
  }
  return null;
}
