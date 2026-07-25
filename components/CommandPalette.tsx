"use client";

import { observer } from "mobx-react-lite";
import type { ReactNode } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { PANEL_SECTIONS } from "@/components/panel/sections/registry";
import { TypeIcon } from "@/components/widgets/type-icons";
import { useHotKey } from "@/hooks/use-hot-key";
import { Icon, MoonIcon, SunIcon } from "@/lib/icons";
import { usePanel } from "@/lib/panel/PanelContext";
import { useTheme } from "@/lib/theme";
import {
  useChatTabsService,
  useContextService,
  useDebugLogService,
  usePaletteService,
  useProvidersService,
  useSearchService,
  useSessionsService,
  useWorkflowsService,
  useWorkspaceService,
} from "@/lib/services/StoreProvider";
import type { PaletteFileItem, WorkspaceType } from "@/lib/services/types";

/**
 * Cmd/Ctrl-P quick-opens any file or test heading in the workspace;
 * Cmd/Ctrl-Shift-P opens the same dialog in command mode (a leading `>` in the
 * input switches modes either way). Commands are built here rather than in
 * PaletteService because the panel and theme are React contexts, not services.
 */
export const CommandPalette = observer(function CommandPalette() {
  const palette = usePaletteService();
  const workspace = useWorkspaceService();
  const search = useSearchService();
  const context = useContextService();
  const providers = useProvidersService();
  const workflows = useWorkflowsService();
  const sessions = useSessionsService();
  const chatTabs = useChatTabsService();
  const debug = useDebugLogService();
  const panel = usePanel();
  const { theme, toggle: toggleTheme, locked: themeLocked } = useTheme();

  useHotKey(palette.openFiles, "p", { preventDefault: true });
  useHotKey(palette.openCommands, "p", { shift: true, preventDefault: true });

  const appearance: PaletteCommand[] = [];
  if (!themeLocked && theme === "dark") {
    appearance.push({
      id: "theme",
      label: "Switch to light theme",
      icon: <SunIcon className="size-4" />,
      run: toggleTheme,
    });
  }
  if (!themeLocked && theme !== "dark") {
    appearance.push({
      id: "theme",
      label: "Switch to dark theme",
      icon: <MoonIcon className="size-4" />,
      run: toggleTheme,
    });
  }
  appearance.push({
    id: "providers",
    label: "Model & provider settings…",
    icon: <Icon name="tune" className="size-4" />,
    run: () => providers.setDialogOpen(true),
  });

  const groups: CommandGroupDef[] = [
    {
      heading: "Workspace",
      items: [
        {
          id: "pull",
          label: "Pull tests from Testomat.io",
          icon: <Icon name="download" className="size-4" />,
          run: () => void workspace.sync("pull"),
        },
        {
          id: "push",
          label: "Push changed tests",
          icon: <Icon name="upload" className="size-4" />,
          run: () => void workspace.sync("push"),
        },
        {
          id: "refresh",
          label: "Refresh file tree",
          icon: <Icon name="refresh" className="size-4" />,
          run: () => void workspace.loadTree(),
        },
        {
          id: "open-folder",
          label: "Open folder as workspace…",
          icon: <Icon name="folder_open" className="size-4" />,
          run: () => void workspace.openFolder(),
        },
        {
          id: "add-context",
          label: "Add to workspace…",
          icon: <Icon name="add" className="size-4" />,
          run: context.openModal,
        },
        {
          id: "changed-only",
          label: "Toggle changed files only",
          icon: <Icon name="filter_alt" className="size-4" />,
          run: workspace.toggleChangedOnly,
        },
        {
          id: "search",
          label: "Search workspace…",
          icon: <Icon name="search" className="size-4" />,
          run: () => {
            panel.openSection("workspace");
            search.toggleSearch();
          },
        },
      ],
    },
    {
      heading: "Go to",
      items: PANEL_SECTIONS.filter(
        (def) => def.id !== "debug" || debug.enabled
      ).map((def) => ({
        id: `section:${def.id}`,
        label: `Go to ${def.title}`,
        icon: def.icon,
        run: () => panel.openSection(def.id),
      })),
    },
    {
      heading: "Chat",
      items: [
        {
          id: "new-tab",
          label: "New chat tab",
          icon: <Icon name="add_comment" className="size-4" />,
          run: chatTabs.openTab,
        },
        {
          id: "clear-session",
          label: "Clear session",
          icon: <Icon name="restart_alt" className="size-4" />,
          run: sessions.createNew,
        },
        {
          id: "run-workflow",
          label: "Run workflow…",
          icon: <Icon name="schema" className="size-4" />,
          run: () => workflows.setDialogOpen(true),
        },
        {
          id: "toggle-chat",
          label: "Toggle chat panel",
          icon: <Icon name="forum" className="size-4" />,
          run: panel.toggleChat,
        },
      ],
    },
    {
      heading: "Appearance",
      items: appearance,
    },
  ];

  const q = palette.search.toLowerCase();
  const commandGroups = groups
    .map((group) => ({
      heading: group.heading,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    }))
    .filter((group) => group.items.length > 0);

  const showCommands = palette.mode === "commands";
  let empty = palette.files.length === 0;
  if (showCommands) empty = commandGroups.length === 0;

  return (
    <CommandDialog
      open={palette.open}
      onOpenChange={palette.setOpen}
      className="sm:max-w-[min(56rem,calc(100vw-2rem))] sm:min-w-[min(48rem,calc(100vw-2rem))]"
    >
      <Command shouldFilter={false} loop>
        <CommandInput
          value={palette.query}
          onValueChange={palette.setQuery}
          placeholder="Search tests and files, or type > for commands…"
        />
        <CommandList className="testeiya-palette-list max-h-[50vh]">
          {empty && !showCommands && (
            <CommandEmpty>
              No matching tests or files. Type <Kbd>&gt;</Kbd> for commands.
            </CommandEmpty>
          )}
          {empty && showCommands && <CommandEmpty>No matching commands.</CommandEmpty>}

          {showCommands &&
            commandGroups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      palette.close();
                      item.run();
                    }}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

          {!showCommands && palette.tests.length > 0 && (
            <CommandGroup heading="Tests">
              {palette.tests.map((item, index) => (
                <PaletteRow
                  key={`test:${index}:${item.path}#${item.anchor}`}
                  index={index}
                  item={item}
                  activeType={workspace.activeType}
                  onSelect={() => palette.openItem(item)}
                />
              ))}
            </CommandGroup>
          )}

          {!showCommands && palette.plainFiles.length > 0 && (
            <CommandGroup heading="Files">
              {palette.plainFiles.map((item, index) => (
                <PaletteRow
                  key={`file:${index}:${item.path}`}
                  index={index}
                  item={item}
                  activeType={workspace.activeType}
                  onSelect={() => palette.openItem(item)}
                />
              ))}
            </CommandGroup>
          )}
        </CommandList>

        {!showCommands && palette.matches.length > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              {palette.truncated && `Showing ${palette.files.length} of ${palette.matches.length} matches`}
              {!palette.truncated && `${palette.matches.length} matches`}
            </span>
            {palette.indexing && <span>Indexing…</span>}
          </div>
        )}
      </Command>
    </CommandDialog>
  );
});

function PaletteRow({
  index,
  item,
  activeType,
  onSelect,
}: {
  index: number;
  item: PaletteFileItem;
  activeType: WorkspaceType | null;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={`${item.kind}:${index}:${item.path}#${item.anchor ?? ""}`}
      onSelect={onSelect}
    >
      {item.kind === "test" && (
        <TypeIcon type={item.testType ?? "manual"} className="size-4 shrink-0" />
      )}
      {item.kind === "file" && (
        <Icon name="description" className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <CommandShortcut className="flex min-w-0 max-w-[35%] items-center gap-2 pl-2 tracking-normal">
        {item.type !== activeType && item.typeLabel && (
          <span className="shrink-0 rounded bg-muted px-1 text-[10px] normal-case">
            {item.typeLabel}
          </span>
        )}
        <span className="truncate" title={item.path}>
          {item.path}
        </span>
      </CommandShortcut>
    </CommandItem>
  );
}

interface PaletteCommand {
  id: string;
  label: string;
  icon: ReactNode;
  run: () => void;
}

interface CommandGroupDef {
  heading: string;
  items: PaletteCommand[];
}
