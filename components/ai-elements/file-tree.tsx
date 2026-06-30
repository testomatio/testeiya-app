"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { SuiteGlyph, SuiteKindIcon } from "@/components/icons";
import { ChevronRightIcon } from "@/lib/icons";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { HTMLAttributes, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface FileTreeContextType {
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  selectedPath?: string;
  onSelect?: (path: string) => void;
}

// Default noop for context default value
// oxlint-disable-next-line eslint(no-empty-function)
const noop = () => {};

const FileTreeContext = createContext<FileTreeContextType>({
  // oxlint-disable-next-line eslint-plugin-unicorn(no-new-builtin)
  expandedPaths: new Set(),
  togglePath: noop,
});

export type FileTreeProps = Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  expanded?: Set<string>;
  defaultExpanded?: Set<string>;
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onExpandedChange?: (expanded: Set<string>) => void;
};

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onSelect,
  onExpandedChange,
  className,
  children,
  ...props
}: FileTreeProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expandedPaths = controlledExpanded ?? internalExpanded;

  const togglePath = useCallback(
    (path: string) => {
      const newExpanded = new Set(expandedPaths);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      setInternalExpanded(newExpanded);
      onExpandedChange?.(newExpanded);
    },
    [expandedPaths, onExpandedChange]
  );

  const contextValue = useMemo(
    () => ({ expandedPaths, onSelect, selectedPath, togglePath }),
    [expandedPaths, onSelect, selectedPath, togglePath]
  );

  return (
    <FileTreeContext.Provider value={contextValue}>
      <div
        className={cn(
          "font-sans text-sm",
          className
        )}
        role="tree"
        {...props}
      >
        <div className="px-2 py-1">{children}</div>
      </div>
    </FileTreeContext.Provider>
  );
};

export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeIcon = ({
  className,
  children,
  ...props
}: FileTreeIconProps) => (
  <span className={cn("shrink-0 flex items-center", className)} {...props}>
    {children}
  </span>
);

export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeName = ({
  className,
  children,
  ...props
}: FileTreeNameProps) => (
  <span className={cn("truncate", className)} {...props}>
    {children}
  </span>
);

interface FileTreeFolderContextType {
  path: string;
  name: string;
  isExpanded: boolean;
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  isExpanded: false,
  name: "",
  path: "",
});

export type FileTreeFolderProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
  icon?: ReactNode;
  badge?: ReactNode;
  menu?: ReactNode;
  actions?: ReactNode;
  nameClassName?: string;
};

export const FileTreeFolder = ({
  path,
  name,
  icon,
  badge,
  menu,
  actions,
  nameClassName,
  className,
  children,
  ...props
}: FileTreeFolderProps) => {
  const { expandedPaths, togglePath, selectedPath, onSelect } =
    useContext(FileTreeContext);
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;

  const handleOpenChange = useCallback(() => {
    togglePath(path);
  }, [togglePath, path]);

  const handleSelect = useCallback(() => {
    onSelect?.(path);
  }, [onSelect, path]);

  const folderContextValue = useMemo(
    () => ({ isExpanded, name, path }),
    [isExpanded, name, path]
  );

  const header = (
    <div
      className={cn(
        "group flex w-full items-center gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50",
        isSelected && "bg-muted"
      )}
    >
      <CollapsibleTrigger render={<button className="flex shrink-0 cursor-pointer items-center border-none bg-transparent p-0" type="button" />}><ChevronRightIcon
                                  className={cn(
                                    "size-4 shrink-0 text-muted-foreground transition-transform",
                                    isExpanded && "rotate-90"
                                  )}
                                /></CollapsibleTrigger>
      <button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-left"
        onClick={handleSelect}
        type="button"
      >
        <FileTreeIcon>
          {icon ?? <SuiteKindIcon fileType="folder" className="size-4" />}
        </FileTreeIcon>
        <FileTreeName className={nameClassName}>{name}</FileTreeName>
        {badge != null && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground/60">{badge}</span>
        )}
      </button>
      {actions}
    </div>
  );

  return (
    <FileTreeFolderContext.Provider value={folderContextValue}>
      <Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
        <div
          className={cn("", className)}
          role="treeitem"
          tabIndex={0}
          {...props}
        >
          {menu == null ? header : (
            <ContextMenu>
              <ContextMenuTrigger render={header} />
              {menu}
            </ContextMenu>
          )}
          <CollapsibleContent>
            <div className="ml-4 border-l pl-1">{children}</div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </FileTreeFolderContext.Provider>
  );
};

interface FileTreeFileContextType {
  path: string;
  name: string;
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
  name: "",
  path: "",
});

export type FileTreeFileProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
  icon?: ReactNode;
  badge?: ReactNode;
  menu?: ReactNode;
  actions?: ReactNode;
  nameClassName?: string;
};

export const FileTreeFile = ({
  path,
  name,
  icon,
  badge,
  menu,
  actions,
  nameClassName,
  className,
  children,
  ...props
}: FileTreeFileProps) => {
  const { selectedPath, onSelect } = useContext(FileTreeContext);
  const isSelected = selectedPath === path;

  const handleClick = useCallback(() => {
    onSelect?.(path);
  }, [onSelect, path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        onSelect?.(path);
      }
    },
    [onSelect, path]
  );

  const fileContextValue = useMemo(() => ({ name, path }), [name, path]);

  const row = (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted/50",
        isSelected && "bg-muted",
        className
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="treeitem"
      tabIndex={0}
      {...props}
    >
      {children ?? (
        <>
          {/* Spacer for alignment */}
          <span className="size-4 shrink-0" />
          <FileTreeIcon>
            {icon ?? <SuiteGlyph className="size-4 text-muted-foreground" />}
          </FileTreeIcon>
          <FileTreeName className={nameClassName}>{name}</FileTreeName>
          {badge != null && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground/60">{badge}</span>
          )}
          {actions}
        </>
      )}
    </div>
  );

  return (
    <FileTreeFileContext.Provider value={fileContextValue}>
      {menu == null ? row : (
        <ContextMenu>
          <ContextMenuTrigger render={row} />
          {menu}
        </ContextMenu>
      )}
    </FileTreeFileContext.Provider>
  );
};

export type FileTreeActionsProps = HTMLAttributes<HTMLDivElement>;

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

export const FileTreeActions = ({
  className,
  children,
  ...props
}: FileTreeActionsProps) => (
  <div
    className={cn("ml-auto flex items-center gap-1", className)}
    onClick={stopPropagation}
    onKeyDown={stopPropagation}
    role="group"
    {...props}
  >
    {children}
  </div>
);
