"use client";

import { useEffect } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import {
  useCreateBlockNote,
  useEditorChange,
  useBlockNoteEditor,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { filterSuggestionItems, insertOrUpdateBlock } from "@blocknote/core";
import { flip, offset, shift, size } from "@floating-ui/react";
import {
  customSchema,
  markdownToBlocks,
  blocksToMarkdown,
  createMarkdownPasteHandler,
  canInsertStepOrSnippet,
  testomatioEditorClassName,
  type CustomEditor,
  type CustomEditorBlock,
} from "testomatio-editor-blocks";
import { cn } from "@/lib/utils";

import "@blocknote/mantine/style.css";
import "testomatio-editor-blocks/styles.css";
import "./block-editor.css";

type Schema = typeof customSchema;

export type BlockEditorProps = {
  /** Markdown source. Consumed once on mount; remount (via key) to reseed. */
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  theme?: "light" | "dark";
  /** Fired on Cmd/Ctrl+S. */
  onSaveShortcut?: () => void;
  className?: string;
};

/** Focus a step/snippet field once its block is rendered. */
function focusStepField(
  editor: CustomEditor | null | undefined,
  blockId?: string,
  fieldName = "title"
) {
  if (!editor || !blockId) return;
  const focus = () => {
    const field = document.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"] [data-step-field="${fieldName}"]`
    );
    if (field) {
      field.focus();
      return;
    }
    editor.setSelection(blockId, blockId);
    editor.setTextCursorPosition(blockId, "end");
    editor.focus();
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(focus);
  } else {
    setTimeout(focus, 0);
  }
}

/** Slash menu that appends Test Step / Snippet items to the defaults. */
function CustomSlashMenu() {
  const editor = useBlockNoteEditor<
    Schema["blockSchema"],
    Schema["inlineContentSchema"],
    Schema["styleSchema"]
  >();

  if (!editor) return null;

  const getItems = async (query: string) => {
    const isMac =
      typeof navigator !== "undefined" &&
      (/Mac/.test(navigator.platform) ||
        (/AppleWebKit/.test(navigator.userAgent) &&
          /Mobile\/\w+/.test(navigator.userAgent)));

    const defaultItems = getDefaultReactSlashMenuItems(editor).map((item) => {
      if (item.badge && isMac) {
        return { ...item, badge: item.badge.replace("Alt", "Option") };
      }
      return item;
    });

    const stepItem = {
      key: "test_step",
      title: "Test Step",
      subtext: "Capture an action with its expected result",
      group: "Test documentation",
      icon: <span className="bn-suggestion-icon">TS</span>,
      aliases: ["step", "test step", "expected"],
      onItemClick: () => {
        const inserted = insertOrUpdateBlock(editor, {
          type: "testStep",
          props: { stepTitle: "", stepData: "", expectedResult: "" },
        });
        focusStepField(editor as unknown as CustomEditor, inserted.id, "title");
      },
    };

    const snippetItem = {
      key: "snippet",
      title: "Snippet",
      subtext: "Insert a reusable snippet with data and an expected result",
      group: "Test documentation",
      icon: <span className="bn-suggestion-icon">SN</span>,
      aliases: ["snippet", "reusable step"],
      onItemClick: () => {
        const inserted = insertOrUpdateBlock(editor, {
          type: "snippet",
          props: {
            snippetId: "",
            snippetTitle: "",
            snippetData: "",
            snippetExpectedResult: "",
          },
        });
        focusStepField(
          editor as unknown as CustomEditor,
          inserted.id,
          "snippet-title"
        );
      },
    };

    const currentBlock = editor.getTextCursorPosition().block;
    const canInsert = canInsertStepOrSnippet(editor, currentBlock.id);
    const items = canInsert
      ? [...defaultItems, stepItem, snippetItem]
      : defaultItems;
    return filterSuggestionItems(items, query);
  };

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={getItems}
      floatingOptions={{
        middleware: [
          offset(10),
          flip({ padding: 10, fallbackPlacements: ["top-start"] }),
          shift({ padding: 10 }),
          size({
            padding: 10,
            apply({ availableHeight, elements }) {
              Object.assign(elements.floating.style, {
                maxHeight: `${Math.max(availableHeight - 10, 120)}px`,
                overflowY: "auto",
              });
            },
          }),
        ],
      }}
    />
  );
}

export function BlockEditor({
  value,
  onChange,
  readOnly,
  theme = "light",
  onSaveShortcut,
  className,
}: BlockEditorProps) {
  const initial = markdownToBlocks(value);
  const editor = useCreateBlockNote({
    schema: customSchema,
    pasteHandler: createMarkdownPasteHandler(markdownToBlocks),
    initialContent: initial.length ? initial : undefined,
  });

  useEditorChange((inst) => {
    try {
      onChange(blocksToMarkdown(inst.document as CustomEditorBlock[]));
    } catch {
      /* transient conversion error while editing — ignore */
    }
  }, editor);

  // Auto-focus newly inserted step / snippet blocks.
  useEffect(() => {
    if (!editor) return;
    const unsubscribe = editor.onChange((instance, context) => {
      const changes = context.getChanges();
      const inserted = changes.find(({ type, block, source }) => {
        if (type !== "insert" || source?.type === "yjs-remote") return false;
        if (block.type === "testStep")
          return ((block.props as { stepTitle?: string })?.stepTitle ?? "") === "";
        if (block.type === "snippet")
          return (
            ((block.props as { snippetTitle?: string })?.snippetTitle ?? "") === ""
          );
        return false;
      });
      if (inserted) {
        const fieldName =
          inserted.block.type === "snippet" ? "snippet-title" : "title";
        focusStepField(
          instance as unknown as CustomEditor,
          inserted.block.id,
          fieldName
        );
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [editor]);

  return (
    <div
      className={cn("testclaw-block-editor h-full w-full overflow-auto", className)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSaveShortcut?.();
        }
      }}
    >
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme={theme}
        slashMenu={false}
        className={testomatioEditorClassName}
      >
        <CustomSlashMenu />
      </BlockNoteView>
    </div>
  );
}
