"use client";

import { cn } from "@/lib/utils";
import { SlashIcon } from "@/lib/icons";
import { FileText, Folder } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const MAX_RESULTS = 50;

export function useFileMentions({ text, setText, items, skills }: UseFileMentionsArgs): FileMentions {
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Drop a stale mention when the text no longer carries its token at the
  // recorded position (programmatic resets — clear() / insertSkill()).
  const activeMention = useMemo(() => {
    if (!mention) return null;
    const token = text.slice(mention.start, mention.start + 1 + mention.query.length);
    if (token !== `${mention.trigger}${mention.query}`) return null;
    return mention;
  }, [text, mention]);

  const filtered = useMemo(() => {
    if (!activeMention) return [];
    const source = activeMention.trigger === "/" ? skills ?? [] : items;
    return filterItems(source, activeMention.query);
  }, [items, skills, activeMention]);

  const open = filtered.length > 0;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const select = useCallback(
    (item: MentionItem) => {
      if (!activeMention) return;
      let suffix = "";
      if (item.kind === "folder") suffix = "/";
      const token = `${activeMention.trigger}${item.path}${suffix} `;
      const end = activeMention.start + 1 + activeMention.query.length;
      const next = text.slice(0, activeMention.start) + token + text.slice(end);
      setText(next);
      setMention(null);
      const caret = activeMention.start + token.length;
      const el = taRef.current;
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [activeMention, text, setText]
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      taRef.current = e.currentTarget;
      const value = e.currentTarget.value;
      setText(value);
      const next = detect(value, e.currentTarget.selectionStart ?? value.length);
      setMention(next);
      setActiveIndex(0);
    },
    [setText]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      taRef.current = e.currentTarget;
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = filtered[activeIndex % filtered.length];
        if (item) select(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
      }
    },
    [open, filtered, activeIndex, select]
  );

  const onBlur = useCallback(() => setMention(null), []);

  let dropdown: ReactNode = null;
  if (open) {
    dropdown = (
      <div className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
        {filtered.map((item, i) => (
          <button
            key={item.path}
            ref={i === activeIndex % filtered.length ? activeRef : undefined}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              select(item);
            }}
            onMouseEnter={() => setActiveIndex(i)}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
              i === activeIndex % filtered.length && "bg-accent text-accent-foreground"
            )}
          >
            {item.kind === "folder" && <Folder className="size-4 shrink-0 text-muted-foreground" />}
            {item.kind === "file" && <FileText className="size-4 shrink-0 text-muted-foreground" />}
            {item.kind === "skill" && <SlashIcon className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate font-medium">{item.name}</span>
            <span className="ml-auto truncate text-xs text-muted-foreground">
              {item.kind === "skill" ? item.description : item.path}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return { onChange, onKeyDown, onBlur, dropdown };
}

// Both triggers are considered; the one closest to the caret that sits at a
// token boundary wins — so `@src/foo` keeps the file mention alive (the `/`
// inside the path fails the boundary check) while `run /impr` opens skills.
function detect(value: string, caret: number): MentionState | null {
  const before = value.slice(0, caret);
  let best: MentionState | null = null;
  for (const trigger of TRIGGERS) {
    const at = before.lastIndexOf(trigger);
    if (at === -1) continue;
    if (at > 0 && !/\s/.test(before[at - 1])) continue;
    const query = before.slice(at + 1);
    if (/\s/.test(query)) continue;
    if (!best || at > best.start) best = { start: at, query, trigger };
  }
  return best;
}

function filterItems(items: MentionItem[], query: string): MentionItem[] {
  const q = query.toLowerCase();
  const matches = items.filter(
    (it) => it.path.toLowerCase().includes(q) || it.description?.toLowerCase().includes(q)
  );
  matches.sort((a, b) => {
    const an = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bn = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    if (an !== bn) return an - bn;
    return a.path.length - b.path.length;
  });
  return matches.slice(0, MAX_RESULTS);
}

const TRIGGERS = ["@", "/"] as const;

export interface MentionItem {
  name: string;
  path: string;
  kind: "file" | "folder" | "test" | "skill";
  description?: string;
}

interface MentionState {
  start: number;
  query: string;
  trigger: (typeof TRIGGERS)[number];
}

interface UseFileMentionsArgs {
  text: string;
  setText: (value: string) => void;
  items: MentionItem[];
  skills?: MentionItem[];
}

interface FileMentions {
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  dropdown: ReactNode;
}
