// Client-side parsing of the `*.test.md` suite format: a file is a suite
// (`<!-- suite\nid: @S… -->`) and every test is a `<!-- test\nid: @T… -->` block
// above a `#`/`##` heading. Mirrors `cli/src/workspace/test-md.ts`, but reads a
// whole suite at once for the editor's contents view.

// `@tag` tokens in a title — Testomat.io's TAG_ALLOWED_SYMBOLS, anchored to a
// word boundary so emails (`a@b.com`) aren't mistaken for tags.
const TAG_RE = /(^|\s)(@[\w=().:&-]*[\w)])/g;
const MARKER_RE = /^<!--\s*(test|suite)\b/;
const ONE_LINE_MARKER_RE = /^<!--\s*(?:test|suite)\b\s*([\s\S]*?)\s*-->\s*$/;
const META_END_RE = /^\s*-->/;
const FIELD_RE = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/;
const HEADING_RE = /^#{1,2}\s+(.+?)\s*$/;

export function parseSuite(content: string): ParsedSuite {
  const lines = content.split("\n");
  const tests: SuiteTest[] = [];
  const description: string[] = [];
  let id: string | null = null;
  let emoji: string | null = null;
  let title: string | null = null;
  let tags: string[] = [];
  let current: SuiteTest | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = MARKER_RE.exec(line);
    if (marker) {
      const meta = readMeta(lines, i);
      i = meta.end;
      if (marker[1] === "suite") {
        id = meta.fields.id ?? null;
        emoji = meta.fields.emoji ?? null;
        continue;
      }
      current = {
        id: meta.fields.id ?? null,
        title: "",
        tags: [],
        type: readType(meta.fields.type),
        priority: meta.fields.priority ?? null,
        anchor: meta.fields.id ?? "",
      };
      tests.push(current);
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (current) {
      if (!heading || current.title) continue;
      const split = splitTags(heading[1]);
      current.title = split.title;
      current.tags = split.tags;
      if (!current.anchor) current.anchor = heading[1];
      continue;
    }
    if (heading && !title) {
      const split = splitTags(heading[1]);
      title = split.title;
      tags = split.tags;
      continue;
    }
    description.push(line);
  }

  return { id, emoji, title, tags, description: description.join("\n").trim(), tests };
}

export function splitTags(name: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const title = name
    .replace(TAG_RE, (_match, pre: string, tag: string) => {
      tags.push(tag);
      return pre;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || name, tags };
}

function readMeta(lines: string[], start: number): { fields: MetaFields; end: number } {
  const fields: MetaFields = {};
  const oneLine = ONE_LINE_MARKER_RE.exec(lines[start]);
  if (oneLine) {
    readField(fields, oneLine[1]);
    return { fields, end: start };
  }
  for (let i = start + 1; i < lines.length; i++) {
    if (META_END_RE.test(lines[i])) return { fields, end: i };
    readField(fields, lines[i]);
  }
  return { fields, end: lines.length - 1 };
}

function readField(fields: MetaFields, raw: string) {
  const match = FIELD_RE.exec(raw);
  if (!match) return;
  fields[match[1].toLowerCase()] = match[2];
}

function readType(raw: string | undefined): TestType {
  if (raw?.trim() === "automated") return "automated";
  return "manual";
}

export type TestType = "manual" | "automated";

export interface SuiteTest {
  id: string | null;
  title: string;
  tags: string[];
  type: TestType;
  priority: string | null;
  /** Text the editor scrolls to — the `@T…` id when the test has one. */
  anchor: string;
}

export interface ParsedSuite {
  id: string | null;
  emoji: string | null;
  title: string | null;
  tags: string[];
  description: string;
  tests: SuiteTest[];
}

type MetaFields = Record<string, string>;
