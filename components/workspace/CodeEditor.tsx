"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import { highlightCode } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";

export type CodeEditorProps = {
  /** File source. Seeded on mount; the textarea is controlled by this value. */
  value: string;
  onChange: (code: string) => void;
  /** File path — used to pick the syntax-highlighting language. */
  path: string;
  readOnly?: boolean;
  /** Fired on Cmd/Ctrl+S. */
  onSaveShortcut?: () => void;
  /** Scroll to the first line whose text matches this. */
  scrollToText?: string;
  className?: string;
};

type Tokenized = NonNullable<ReturnType<typeof highlightCode>>;

// No wrapping (white-space: pre + wrap="off" on the textarea): lines break only
// at real newlines, so the highlighted <pre> and the textarea lay out
// identically. Soft-wrapping would drift the two layers apart (the textarea's
// scrollbar steals width, and its native wrap differs from CSS pre-wrap).
const sharedTextStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  lineHeight: 1.6,
  padding: "1rem",
  tabSize: 2,
  whiteSpace: "pre",
};

export function CodeEditor({
  value,
  onChange,
  path,
  readOnly,
  onSaveShortcut,
  scrollToText,
  className,
}: CodeEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const language = useMemo(() => languageFromPath(path), [path]);

  const rawTokens = useMemo<Tokenized>(
    () => ({
      bg: "transparent",
      fg: "inherit",
      tokens: value
        .split("\n")
        .map((line) =>
          line === "" ? [] : [{ color: "inherit", content: line } as ThemedToken]
        ),
    }),
    [value]
  );

  const syncTokens = useMemo(
    () => (language ? highlightCode(value, language) ?? rawTokens : rawTokens),
    [value, language, rawTokens]
  );

  const [asyncTokens, setAsyncTokens] = useState<{
    value: string;
    language: BundledLanguage | null;
    tokens: Tokenized;
  } | null>(null);

  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    // The callback only fires while shiki is still loading; once the highlighter
    // is cached, highlightCode resolves synchronously (populated by a microtask
    // before this effect runs) and returns the tokens without calling back.
    const cached = highlightCode(value, language, (result) => {
      if (!cancelled) setAsyncTokens({ value, language, tokens: result });
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setAsyncTokens({ value, language, tokens: cached });
    return () => {
      cancelled = true;
    };
  }, [value, language]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.readOnly = Boolean(readOnly);
  }, [readOnly]);

  useEffect(() => {
    if (!scrollToText?.trim()) return;
    const needle = scrollToText.trim().toLowerCase();
    const lines = value.split("\n");
    const lineIndex = lines.findIndex((l) => l.toLowerCase().includes(needle));
    if (lineIndex === -1) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lineHeight = 13 * 1.6;
    textarea.scrollTop = Math.max(0, lineIndex * lineHeight - 48);
    if (preRef.current) preRef.current.scrollTop = textarea.scrollTop;
  }, [scrollToText, value]);

  const tokenized =
    asyncTokens && asyncTokens.value === value && asyncTokens.language === language
      ? asyncTokens.tokens
      : syncTokens;

  return (
    <div
      className={cn(
        "testeiya-code-editor relative h-full w-full overflow-hidden bg-background",
        className
      )}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSaveShortcut?.();
        }
      }}
    >
      <pre
        ref={preRef}
        aria-hidden
        className="absolute inset-0 box-border m-0 overflow-hidden text-foreground pointer-events-none"
        style={sharedTextStyle}
      >
        <code style={{ fontFamily: "inherit" }}>
          {tokenized.tokens.map((line, i) => (
            <Fragment key={i}>
              {line.map((token, j) => (
                <span
                  key={j}
                  className="dark:!text-[var(--shiki-dark)]"
                  style={tokenStyle(token)}
                >
                  {token.content}
                </span>
              ))}
              {i < tokenized.tokens.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </code>
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          const pre = preRef.current;
          if (pre) {
            pre.scrollTop = e.currentTarget.scrollTop;
            pre.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        readOnly={readOnly}
        spellCheck={false}
        wrap="off"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className="absolute inset-0 box-border resize-none overflow-auto border-0 bg-transparent text-transparent outline-none"
        style={{
          ...sharedTextStyle,
          WebkitTextFillColor: "transparent",
          caretColor: "var(--color-foreground)",
        }}
      />
    </div>
  );
}

function tokenStyle(token: ThemedToken): CSSProperties {
  const fontStyle = token.fontStyle ?? 0;
  return {
    color: token.color,
    // oxlint-disable-next-line eslint(no-bitwise)
    fontStyle: fontStyle & 1 ? "italic" : undefined,
    // oxlint-disable-next-line eslint(no-bitwise)
    fontWeight: fontStyle & 2 ? "bold" : undefined,
    // oxlint-disable-next-line eslint(no-bitwise)
    textDecoration: fontStyle & 4 ? "underline" : undefined,
    ...token.htmlStyle,
  };
}

function languageFromPath(path: string): BundledLanguage | null {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name === "dockerfile") return "docker";
  if (name === "makefile") return "makefile";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return EXT_TO_LANGUAGE[ext] ?? null;
}

const EXT_TO_LANGUAGE: Record<string, BundledLanguage> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  php: "php",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  sql: "sql",
  vue: "vue",
  svelte: "svelte",
  graphql: "graphql",
  gql: "graphql",
  ini: "ini",
  conf: "ini",
  diff: "diff",
  patch: "diff",
};
