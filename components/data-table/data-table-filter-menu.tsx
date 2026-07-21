"use client";

import { useDataTable } from "@/components/data-table/data-table-provider";
import { FILTER_COMPONENTS } from "@/components/data-table/data-table-filter-controls";
import type { DataTableFilterField } from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/use-debounce";
import { useHotKey } from "@/hooks/use-hot-key";
import { formatDate } from "@/lib/format";
import { useFilterActions } from "@/lib/store/hooks/useFilterActions";
import { useFilterState } from "@/lib/store/hooks/useFilterState";
import type { FilterType } from "@/lib/table-schema";
import {
  defaultOperator,
  isTqlGroup,
  parseTql,
  serializeTql,
  TQL_OPERATOR_LABELS,
  type Connector,
  type TqlField,
  type TqlGroup,
  type TqlNode,
  type TqlOperator,
} from "@/lib/data-browse/tql";
import {
  AlertCircle,
  CheckIcon,
  ChevronDownIcon,
  FilterIcon,
  Icon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import * as React from "react";

const EMPTY_ROOT: Root = { connector: "and", items: [] };

const SINGLE_VALUE_OPERATORS: TqlOperator[] = ["neq", "contains"];

/*
 * Active toolbar state: subdued indigo rather than a filled primary button. The
 * `dark:` half is not decoration — `outline` ships `dark:bg-input/30` and
 * `dark:border-input`, which would otherwise repaint this grey in dark mode.
 */
const ACTIVE_FILTER_BUTTON =
  "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:border-primary/50 dark:bg-primary/10 dark:hover:bg-primary/20";

export function DataTableFilterMenu() {
  const { table, filterFields, tqlFields } = useDataTable();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("ui");
  const [root, setRoot] = React.useState<Root>(EMPTY_ROOT);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [autoOpenUid, setAutoOpenUid] = React.useState<number | null>(null);
  const uidRef = React.useRef(0);
  const didAutoAdd = React.useRef(false);

  const nextUid = React.useCallback(() => uidRef.current++, []);

  const addRow = React.useCallback(() => {
    const uid = nextUid();
    setRoot((prev) => ({ ...prev, items: [...prev.items, blankRow(uid)] }));
    setAutoOpenUid(uid);
  }, [nextUid]);

  const addGroup = React.useCallback(() => {
    const uid = nextUid();
    const rowUid = nextUid();
    setRoot((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { uid, kind: "group", connector: "or", rows: [blankRow(rowUid)] },
      ],
    }));
    setAutoOpenUid(rowUid);
  }, [nextUid]);

  const editRow = React.useCallback((uid: number, edit: (row: Row) => Row) => {
    setRoot((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.kind === "row") {
          if (item.uid !== uid) return item;
          return edit(item);
        }
        if (!item.rows.some((row) => row.uid === uid)) return item;
        return {
          ...item,
          rows: item.rows.map((row) => (row.uid === uid ? edit(row) : row)),
        };
      }),
    }));
  }, []);

  const dropRow = React.useCallback((uid: number) => {
    setRoot((prev) => ({
      ...prev,
      items: prev.items
        .filter((item) => item.kind === "group" || item.uid !== uid)
        .map((item) => {
          if (item.kind === "row") return item;
          return { ...item, rows: item.rows.filter((row) => row.uid !== uid) };
        })
        // A group that just lost its last row has nothing left to express.
        .filter((item) => item.kind === "row" || item.rows.length > 0),
    }));
  }, []);

  const { setFilters } = useFilterActions();
  const storedTql = useFilterState((s) => s.q) as string | null | undefined;
  const fields = React.useMemo(() => tqlFields ?? [], [tqlFields]);
  const hasTql = fields.length > 0;

  const resetAll = React.useCallback(() => {
    table.resetColumnFilters();
    setRoot(EMPTY_ROOT);
    setDraft("");
    setError(null);
    setAutoOpenUid(null);
    setFilters({ q: null });
  }, [table, setFilters]);

  // Opening the menu with nothing set drops the user straight into picking a
  // field, instead of making them click through an empty panel first.
  React.useEffect(() => {
    if (!open) {
      didAutoAdd.current = false;
      return;
    }
    if (didAutoAdd.current) return;
    didAutoAdd.current = true;
    if (root.items.length) return;
    if (mode !== "ui") return;
    addRow();
  }, [open, root.items.length, mode, addRow]);

  useHotKey(() => setOpen((prev) => !prev), "b");
  useHotKey(resetAll, "Escape");

  const fieldById = React.useMemo(() => {
    const map = new Map<string, DataTableFilterField<unknown>>();
    filterFields?.forEach((field) => map.set(field.value as string, field));
    return map;
  }, [filterFields]);

  const allRows = React.useMemo(() => flattenRows(root), [root]);
  const query = React.useMemo(() => toQuery(root, fields), [root, fields]);
  const debouncedDraft = useDebounce(draft, 500);

  // The builder is the source of truth in UI mode: every edit is serialised
  // into the `tql` param the list request already understands.
  React.useEffect(() => {
    if (mode !== "ui") return;
    if (!hasTql) return;
    const next = serializeTql(query, fields);
    const current = typeof storedTql === "string" ? storedTql : "";
    if (next === current) return;
    setFilters({ q: next || null });
  }, [mode, hasTql, query, fields, storedTql, setFilters]);

  // Typing in the query text applies on a pause, not per keystroke — every
  // prefix of a valid query parses, so each character would otherwise fire its
  // own list request. `draft` stays immediate, so validation is not delayed.
  React.useEffect(() => {
    if (mode !== "tql") return;
    const parsed = parseTql(debouncedDraft, fields);
    if (!parsed.ok) return;
    const next = debouncedDraft.trim();
    const current = typeof storedTql === "string" ? storedTql : "";
    if (next === current) return;
    setFilters({ q: next || null });
  }, [mode, debouncedDraft, fields, storedTql, setFilters]);

  // Restore the builder from a query that was already in the store (a reopened
  // widget, a shared URL) — the tree itself lives in this component.
  React.useEffect(() => {
    if (root.items.length) return;
    if (typeof storedTql !== "string" || !storedTql) return;
    const parsed = parseTql(storedTql, fields);
    if (!parsed.ok) return;
    setRoot(toRoot(parsed.query, nextUid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedTql, fields]);

  const selectable = filterFields ?? [];

  // Some columns exist only as REST filter params upstream (`sync_status` has
  // no TQL field at all), so they travel next to the query instead of inside
  // it — surfaced in TQL mode so nothing silently vanishes.
  const outsideTql = React.useMemo(
    () => allRows.filter((row) => isLegacy(row, fields) && !isEmpty(row.value)),
    [allRows, fields],
  );

  // A REST param is always ANDed with the query by the backend, so the root
  // connector cannot be flipped to Or while one is pinned there — Or lives in
  // a group instead.
  const legacyPinned =
    !hasTql ||
    root.items.some((item) => item.kind === "row" && isLegacy(item, fields));
  // Counted from the query that is actually applied, not from the builder rows
  // — in TQL mode the tree is frozen, so rows would keep reporting a filter the
  // user has already edited away in the text.
  const activeCount = React.useMemo(() => {
    if (mode === "ui") return countConditions(query) + outsideTql.length;
    const applied = typeof storedTql === "string" ? storedTql : "";
    const parsed = parseTql(applied, fields);
    if (!parsed.ok) return outsideTql.length;
    return countConditions(parsed.query) + outsideTql.length;
  }, [mode, query, storedTql, fields, outsideTql]);

  const rowProps = (row: Row, inGroup: boolean) => ({
    // The flag only means "this row was just created empty" — a row that
    // already picked a field must never pop its picker open again.
    autoOpen: !row.id && row.uid === autoOpenUid,
    field: row.id ? (fieldById.get(row.id) ?? null) : null,
    tqlField: fields.find((item) => item.key === row.id) ?? null,
    operator: row.operator,
    value: row.value,
    available: availableFields(row, inGroup, {
      selectable,
      fields,
      rows: allRows,
      connector: root.connector,
    }),
    onValueChange: (next: unknown) => {
      const tqlField = fields.find((f) => f.key === row.id);
      editRow(row.uid, (item) => ({
        ...item,
        ...reconcile(item.operator, next, tqlField),
      }));
      if (!tqlField && row.id) table.getColumn(row.id)?.setFilterValue(next);
    },
    onFieldChange: (next: string) => {
      setAutoOpenUid(null);
      // Only a REST-only row owns its column filter. A TQL row shares that slot
      // with the toolbar search, which must survive this row being re-targeted.
      if (isLegacy(row, fields)) {
        table.getColumn(row.id as string)?.setFilterValue(undefined);
      }
      const tqlField = fields.find((item) => item.key === next);
      let operator: TqlOperator = "eq";
      if (tqlField) operator = defaultOperator(tqlField);
      editRow(row.uid, (item) => ({
        ...item,
        id: next,
        operator,
        value: undefined,
      }));
    },
    onOperatorChange: (next: TqlOperator) =>
      editRow(row.uid, (item) => ({
        ...item,
        operator: next,
        value: trim(next, item.value),
      })),
    onRemove: () => {
      if (isLegacy(row, fields)) {
        table.getColumn(row.id as string)?.setFilterValue(undefined);
      }
      dropRow(row.uid);
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    role="combobox"
                    aria-expanded={open}
                    aria-label="Filters"
                    className={cn(
                      "gap-2",
                      activeCount && [
                        ACTIVE_FILTER_BUTTON,
                        "rounded-r-none border-r-0",
                        // `outline` greys the trigger out while the popover is
                        // open; the active state has to keep its own colour.
                        "aria-expanded:bg-primary/15 aria-expanded:text-primary",
                      ],
                    )}
                  />
                }
              />
            }
          >
            <FilterIcon className="size-4" />
            <span className="hidden md:block">Filters</span>
            {activeCount ? (
              <span className="bg-primary/20 text-primary rounded-full px-1.5 text-xs font-medium tabular-nums">
                {activeCount}
              </span>
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-nowrap">
              Open filters with{" "}
              <Kbd className="text-muted-foreground ml-1">
                <span className="mr-1">⌘</span>
                <span>B</span>
              </Kbd>
            </p>
          </TooltipContent>
        </Tooltip>
        {activeCount ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Clear all filters"
                  onClick={resetAll}
                  className={cn(ACTIVE_FILTER_BUTTON, "rounded-l-none")}
                />
              }
            >
              <XIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-nowrap">
                Clear all filters with{" "}
                <Kbd className="text-muted-foreground ml-1">
                  <span className="mr-1">⌘</span>
                  <span>Esc</span>
                </Kbd>
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <PopoverContent
        align="end"
        className="w-[40rem] max-w-[calc(100vw-2rem)] gap-0 p-0"
      >
        <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="font-heading font-medium">Filters</p>
          {hasTql ? (
            <ModeToggle
              mode={mode}
              onChange={(next) => {
                setError(null);
                // Switching modes remounts the builder, so a stale flag would
                // re-open the picker on whichever row still carries that uid.
                setAutoOpenUid(null);
                if (next === "tql") {
                  setDraft(serializeTql(query, fields));
                  setMode("tql");
                  return;
                }
                const parsed = parseTql(draft, fields);
                if (!parsed.ok) {
                  setError(parsed.error);
                  return;
                }
                // Rows the query text cannot hold (REST-only fields) live on
                // untouched — rebuilding from TQL alone would drop them.
                const kept = root.items.filter(
                  (item) => item.kind === "row" && isLegacy(item, fields),
                );
                const merged = mergeLegacy(
                  toRoot(parsed.query, nextUid),
                  kept,
                  nextUid,
                );
                if (!merged) {
                  setError(
                    "Remove the filters applied alongside the query before opening it in the builder.",
                  );
                  return;
                }
                setRoot(merged);
                setMode("ui");
              }}
            />
          ) : null}
        </div>

        {mode === "tql" ? (
          <TqlEditor
            value={draft}
            error={error}
            fields={fields}
            outside={outsideTql.map((row) => ({
              uid: row.uid,
              field: fieldById.get(row.id as string) ?? null,
              value: row.value,
            }))}
            onOutsideChange={(uid, next) => {
              const target = allRows.find((item) => item.uid === uid);
              editRow(uid, (item) => ({ ...item, value: next }));
              if (target?.id) table.getColumn(target.id)?.setFilterValue(next);
            }}
            onOutsideRemove={(uid) => {
              const target = allRows.find((item) => item.uid === uid);
              if (target?.id) {
                table.getColumn(target.id)?.setFilterValue(undefined);
              }
              dropRow(uid);
            }}
            onChange={(text) => {
              setDraft(text);
              const parsed = parseTql(text, fields);
              if (!parsed.ok) {
                setError(parsed.error);
                return;
              }
              setError(null);
            }}
          />
        ) : (
          <div className="max-h-[24rem] overflow-y-auto p-3">
            {root.items.length ? (
              <div className="grid gap-2">
                {root.items.map((item, index) => (
                  <div
                    key={item.uid}
                    className="flex min-w-0 items-start gap-2"
                  >
                    <Joiner
                      index={index}
                      connector={root.connector}
                      locked={legacyPinned}
                      onChange={(next) =>
                        setRoot((prev) => ({ ...prev, connector: next }))
                      }
                    />
                    {item.kind === "row" ? (
                      <FilterRow {...rowProps(item, false)} />
                    ) : (
                      <GroupCard
                        onAddRow={() => {
                          const uid = nextUid();
                          setRoot((prev) => ({
                            ...prev,
                            items: prev.items.map((entry) => {
                              if (entry.uid !== item.uid) return entry;
                              if (entry.kind === "row") return entry;
                              return {
                                ...entry,
                                rows: [...entry.rows, blankRow(uid)],
                              };
                            }),
                          }));
                          setAutoOpenUid(uid);
                        }}
                        onRemove={() =>
                          setRoot((prev) => ({
                            ...prev,
                            items: prev.items.filter(
                              (entry) => entry.uid !== item.uid,
                            ),
                          }))
                        }
                      >
                        {item.rows.map((row, rowIndex) => (
                          <div
                            key={row.uid}
                            className="flex min-w-0 items-start gap-2"
                          >
                            <Joiner
                              index={rowIndex}
                              connector={item.connector}
                              onChange={(next) =>
                                setRoot((prev) => ({
                                  ...prev,
                                  items: prev.items.map((entry) =>
                                    entry.uid === item.uid
                                      ? { ...entry, connector: next }
                                      : entry,
                                  ),
                                }))
                              }
                            />
                            <FilterRow {...rowProps(row, true)} />
                          </div>
                        ))}
                      </GroupCard>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm font-medium">No filters applied</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add a condition to narrow down the rows below.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
          {mode === "ui" ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={addRow}
              >
                <PlusIcon className="size-4" />
                Add filter
              </Button>
              {hasTql ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={addGroup}
                      />
                    }
                  >
                    <PlusIcon className="size-4" />
                    Add group
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-56">
                      Combine conditions with Or inside a bracketed group.
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Operators: == != % in and or ( )
            </p>
          )}
          {activeCount || root.items.length || draft ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={resetAll}
            >
              Clear all
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter editor mode"
      className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5"
    >
      {(["ui", "tql"] as Mode[]).map((value) => (
        <Button
          key={value}
          size="sm"
          variant="ghost"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "h-7 px-2.5 text-xs font-medium",
            mode === value && "bg-background text-foreground shadow-sm",
            mode !== value && "text-muted-foreground",
          )}
        >
          {value === "ui" ? "Builder" : "TQL"}
        </Button>
      ))}
    </div>
  );
}

function TqlEditor({
  value,
  error,
  fields,
  outside,
  onOutsideChange,
  onOutsideRemove,
  onChange,
}: {
  value: string;
  error: string | null;
  fields: TqlField[];
  outside: {
    uid: number;
    field: DataTableFilterField<unknown> | null;
    value: unknown;
  }[];
  onOutsideChange: (uid: number, value: unknown) => void;
  onOutsideRemove: (uid: number) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 p-3">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-label="TQL query"
        aria-invalid={Boolean(error)}
        placeholder="(priority == 'high' or priority == 'critical') and state == 'manual'"
        className={cn(
          "min-h-24 resize-y font-mono text-xs",
          error && "border-destructive focus-visible:ring-destructive/30",
        )}
      />
      {error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-xs"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Fields: {fields.map((field) => field.tqlName).join(", ")}
        </p>
      )}
      {outside.length ? (
        <div className="border-border bg-muted/30 grid gap-1.5 rounded-md border px-2.5 py-2">
          <p className="text-muted-foreground text-xs">
            Applied alongside the query — these fields have no TQL equivalent:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {outside.map((item) => (
              <OutsideChip
                key={item.uid}
                field={item.field}
                value={item.value}
                onChange={(next) => onOutsideChange(item.uid, next)}
                onRemove={() => onOutsideRemove(item.uid)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutsideChip({
  field,
  value,
  onChange,
  onRemove,
}: {
  field: DataTableFilterField<unknown> | null;
  value: unknown;
  onChange: (value: unknown) => void;
  onRemove: () => void;
}) {
  if (!field) return null;
  const FilterComponent = FILTER_COMPONENTS[field.type];
  const summary = valueLabel(field, value, field.type);

  return (
    <span className="border-border bg-background flex items-center gap-0.5 rounded-md border pl-2">
      <span className="text-xs font-medium">{field.label}</span>
      <span className="text-muted-foreground text-xs">is</span>
      {field.type === "input" ? (
        <span className="block w-40 py-0.5">
          <FilterComponent
            {...field}
            placeholder="Enter text"
            className="h-7 rounded-md"
            filterValue={value}
            onFilterChange={onChange}
          />
        </span>
      ) : (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${field.label} value`}
                className="h-7 gap-1 px-1.5 text-xs font-normal"
              />
            }
          >
            <span className="max-w-32 truncate">
              {summary ?? "Select value"}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <FilterComponent
              {...field}
              filterValue={value}
              onFilterChange={onChange}
            />
          </PopoverContent>
        </Popover>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`Remove ${field.label}`}
              className="text-muted-foreground hover:text-destructive size-7"
            />
          }
        >
          <XIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>Remove filter</TooltipContent>
      </Tooltip>
    </span>
  );
}

function GroupCard({
  onAddRow,
  onRemove,
  children,
}: {
  onAddRow: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-muted/20 min-w-0 flex-1 rounded-md border p-2">
      <div className="grid gap-2">{children}</div>
      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5 text-xs"
          onClick={onAddRow}
        >
          <PlusIcon className="size-3.5" />
          Add nested filter
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                aria-label="Remove group"
                className="text-muted-foreground hover:text-destructive"
              />
            }
          >
            <TrashIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Remove group</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function Joiner({
  index,
  connector,
  locked,
  onChange,
}: {
  index: number;
  connector: Connector;
  locked?: boolean;
  onChange: (value: Connector) => void;
}) {
  if (index === 0) {
    return (
      <span className="text-muted-foreground flex h-8 w-14 shrink-0 items-center px-1.5 text-xs">
        Where
      </span>
    );
  }
  if (index > 1 || locked) {
    return (
      <span className="text-muted-foreground flex h-8 w-14 shrink-0 items-center px-1.5 text-xs uppercase">
        {connector}
      </span>
    );
  }
  return <ConnectorSelect value={connector} onChange={onChange} />;
}

function FilterRow({
  autoOpen,
  field,
  tqlField,
  operator,
  value,
  onValueChange,
  available,
  onFieldChange,
  onOperatorChange,
  onRemove,
}: {
  autoOpen: boolean;
  field: DataTableFilterField<unknown> | null;
  tqlField: TqlField | null;
  operator: TqlOperator;
  value: unknown;
  onValueChange: (value: unknown) => void;
  available: DataTableFilterField<unknown>[];
  onFieldChange: (value: string) => void;
  onOperatorChange: (value: TqlOperator) => void;
  onRemove: () => void;
}) {
  const [fieldOpen, setFieldOpen] = React.useState(autoOpen);
  const [opOpen, setOpOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const kind = editorKind(operator, field, tqlField);
  const FilterComponent = kind ? FILTER_COMPONENTS[kind] : null;
  const summary = field && kind ? valueLabel(field, value, kind) : null;
  // `is not` has no `not in` upstream and `contains` is free text, so switching
  // to either would quietly discard every value but one.
  const multiValue = Array.isArray(value) && value.length > 1;

  let valueControl = <div className="min-w-0 flex-1" />;
  if (field && FilterComponent && kind === "input") {
    // Typing a string needs no popover — the input is the control, and it
    // already shows the value, so there is nothing left for a trigger to label.
    valueControl = (
      <div className="min-w-0 flex-1">
        <FilterComponent
          {...field}
          type={kind}
          placeholder="Enter text"
          className="h-8"
          filterValue={value}
          onFilterChange={onValueChange}
        />
      </div>
    );
  } else if (field && FilterComponent) {
    valueControl = (
      <div className="min-w-0 flex-1">
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                aria-label={`${field.label} value`}
                className="w-full justify-between gap-1 font-normal"
              />
            }
          >
            <span
              className={cn(
                "min-w-0 truncate",
                !summary && "text-muted-foreground",
              )}
            >
              {summary ?? "Select value"}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <FilterComponent
              {...field}
              type={kind}
              filterValue={value}
              onFilterChange={onValueChange}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Popover open={fieldOpen} onOpenChange={setFieldOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={fieldOpen}
              aria-label="Filter field"
              className="w-32 shrink-0 justify-between gap-1 font-normal"
            />
          }
        >
          <span
            className={cn(
              "min-w-0 truncate",
              !field && "text-muted-foreground",
            )}
          >
            {field?.label ?? "Select filter"}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <Command>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search..."
            />
            <CommandList>
              <CommandEmpty>No filter found.</CommandEmpty>
              <CommandGroup>
                {available.map((option) => (
                  <CommandItem
                    key={option.value as string}
                    value={option.label}
                    onSelect={() => {
                      onFieldChange(option.value as string);
                      setFieldOpen(false);
                    }}
                    className="gap-2"
                  >
                    {option.icon ? (
                      <Icon
                        name={option.icon}
                        className="text-muted-foreground size-4"
                      />
                    ) : null}
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {tqlField && tqlField.operators.length > 1 ? (
        <Popover open={opOpen} onOpenChange={setOpOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={opOpen}
                aria-label="Operator"
                className="w-28 shrink-0 justify-between gap-1 font-normal"
              />
            }
          >
            <span className="min-w-0 truncate">
              {TQL_OPERATOR_LABELS[operator]}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1">
            {tqlField.operators.map((option) => (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                disabled={multiValue && SINGLE_VALUE_OPERATORS.includes(option)}
                onClick={() => {
                  onOperatorChange(option);
                  setOpOpen(false);
                }}
                className="w-full justify-between gap-2 font-normal"
              >
                {TQL_OPERATOR_LABELS[option]}
                {option === operator ? (
                  <CheckIcon className="text-primary size-4" />
                ) : null}
              </Button>
            ))}
            {multiValue ? (
              <p className="text-muted-foreground px-2 py-1.5 text-xs">
                Greyed operators take a single value — deselect first.
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : (
        <span className="text-muted-foreground w-28 shrink-0 truncate text-xs">
          {field ? TQL_OPERATOR_LABELS[operator] : null}
        </span>
      )}

      {valueControl}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`Remove ${field?.label ?? "filter"}`}
              className="text-muted-foreground hover:text-destructive shrink-0"
            />
          }
        >
          <TrashIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Remove filter</TooltipContent>
      </Tooltip>
    </div>
  );
}

function ConnectorSelect({
  value,
  onChange,
}: {
  value: Connector;
  onChange: (value: Connector) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Combine conditions with"
            className="h-8 w-14 shrink-0 justify-between gap-0.5 px-1.5 text-xs font-normal uppercase"
          />
        }
      >
        {value}
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-28 p-1">
        {(["and", "or"] as Connector[]).map((option) => (
          <Button
            key={option}
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
            className="w-full justify-between gap-2 font-normal uppercase"
          >
            {option}
            {option === value ? (
              <CheckIcon className="text-primary size-4" />
            ) : null}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function blankRow(uid: number): Row {
  return { uid, kind: "row", id: null, operator: "eq", value: undefined };
}

function flattenRows(root: Root): Row[] {
  const rows: Row[] = [];
  for (const item of root.items) {
    if (item.kind === "row") {
      rows.push(item);
      continue;
    }
    rows.push(...item.rows);
  }
  return rows;
}

function isLegacy(row: Row, fields: TqlField[]): boolean {
  if (!row.id) return false;
  return !fields.some((field) => field.key === row.id);
}

function toQuery(root: Root, fields: TqlField[]): TqlGroup {
  const children: TqlNode[] = [];
  for (const item of root.items) {
    if (item.kind === "row") {
      const condition = toCondition(item, fields);
      if (condition) children.push(condition);
      continue;
    }
    const nested: TqlNode[] = [];
    for (const row of item.rows) {
      const condition = toCondition(row, fields);
      if (condition) nested.push(condition);
    }
    if (nested.length) {
      children.push({ connector: item.connector, children: nested });
    }
  }
  return { connector: root.connector, children };
}

function toCondition(row: Row, fields: TqlField[]): TqlNode | null {
  if (!row.id) return null;
  if (isLegacy(row, fields)) return null;
  if (isEmpty(row.value)) return null;
  return { field: row.id, operator: row.operator, value: row.value };
}

function toRoot(query: TqlGroup, nextUid: () => number): Root {
  return {
    connector: query.connector,
    items: query.children.map((child) => {
      if (!isTqlGroup(child)) {
        return {
          uid: nextUid(),
          kind: "row",
          id: child.field,
          operator: child.operator,
          value: child.value,
        };
      }
      return {
        uid: nextUid(),
        kind: "group",
        connector: child.connector,
        rows: child.children.filter(isCondition).map((condition) => ({
          uid: nextUid(),
          kind: "row" as const,
          id: condition.field,
          operator: condition.operator,
          value: condition.value,
        })),
      };
    }),
  };
}

/**
 * REST-only rows are ANDed with the query by the backend, so they can only sit
 * at a root that combines with And. A rebuilt Or root is folded into a single
 * group first, which keeps the meaning identical; a root that already holds
 * groups cannot be folded without exceeding the one-level nesting the UI draws.
 */
function mergeLegacy(
  rebuilt: Root,
  kept: Item[],
  nextUid: () => number,
): Root | null {
  if (!kept.length) return rebuilt;
  if (rebuilt.connector === "and" || rebuilt.items.length < 2) {
    return { connector: "and", items: [...rebuilt.items, ...kept] };
  }
  if (rebuilt.items.some((item) => item.kind === "group")) return null;
  const rows = rebuilt.items.filter((item): item is Row => item.kind === "row");
  return {
    connector: "and",
    items: [
      { uid: nextUid(), kind: "group", connector: rebuilt.connector, rows },
      ...kept,
    ],
  };
}

function availableFields(
  row: Row,
  inGroup: boolean,
  ctx: {
    selectable: DataTableFilterField<unknown>[];
    fields: TqlField[];
    rows: Row[];
    connector: Connector;
  },
): DataTableFilterField<unknown>[] {
  return ctx.selectable.filter((option) => {
    const key = option.value as string;
    if (key === row.id) return true;
    // Two rows may target the same TQL column on purpose — that is what makes
    // `priority == 'high' or priority == 'critical'` expressible.
    if (ctx.fields.some((field) => field.key === key)) return true;
    if (inGroup) return false;
    if (ctx.connector === "or") return false;
    return !ctx.rows.some((other) => other.id === key);
  });
}

/**
 * Keeps the row's operator and value consistent so the builder and the TQL
 * text always describe the same query: picking several values widens `is` to
 * `is any of`, and `is not` stays single-valued (the API has no `not in`).
 */
function reconcile(
  operator: TqlOperator,
  value: unknown,
  field: TqlField | undefined,
): { operator: TqlOperator; value: unknown } {
  // REST-only fields carry no operator, so multi-select stays untouched.
  if (!field) return { operator, value };
  if (!Array.isArray(value) || value.length <= 1) return { operator, value };
  if (operator === "eq" && field.operators.includes("in")) {
    return { operator: "in", value };
  }
  return { operator, value: trim(operator, value) };
}

/**
 * The operator decides what a value means, so it decides which editor can express
 * it: `contains` is a free-text match, while `is` / `is not` / `is any of` pick
 * from a set. REST-only columns carry no operator and keep their declared editor.
 */
function editorKind(
  operator: TqlOperator,
  field: DataTableFilterField<unknown> | null,
  tqlField: TqlField | null,
): FilterType | null {
  if (!field) return null;
  if (!tqlField) return field.type;
  if (field.type === "slider" || field.type === "timerange") return field.type;
  if (operator === "contains") return "input";
  return "checkbox";
}

function trim(operator: TqlOperator, value: unknown): unknown {
  // Free text and the list editors hold different shapes, so a value carried
  // across an operator change is converted when it can be and dropped when it
  // cannot — never left behind to serialise as something else.
  if (operator === "contains") {
    if (!Array.isArray(value)) return value;
    if (value.length === 1) return String(value[0]);
    return undefined;
  }
  if (operator !== "eq" && operator !== "neq") return value;
  if (!Array.isArray(value) || value.length <= 1) return value;
  return [value[value.length - 1]];
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && !value.length) return true;
  return false;
}

function isCondition(node: TqlNode): node is Exclude<TqlNode, TqlGroup> {
  return !isTqlGroup(node);
}

function countConditions(group: TqlGroup): number {
  let total = 0;
  for (const child of group.children) {
    if (isTqlGroup(child)) {
      total += countConditions(child);
      continue;
    }
    total++;
  }
  return total;
}

function valueLabel(
  field: DataTableFilterField<unknown>,
  filterValue: unknown,
  kind: FilterType,
): string | null {
  if (filterValue === undefined || filterValue === null) return null;

  if (kind === "timerange") {
    const dates = Array.isArray(filterValue) ? filterValue : [filterValue];
    const formatted = dates
      .filter((date): date is Date => date instanceof Date)
      .map((date) => formatDate(date));
    if (!formatted.length) return null;
    return formatted.join(" – ");
  }

  if (field.type === "slider") {
    const numbers = Array.isArray(filterValue) ? filterValue : [filterValue];
    if (!numbers.length) return null;
    const unit = field.unit ?? "";
    return `${numbers[0]}${unit} – ${numbers[numbers.length - 1]}${unit}`;
  }

  if (kind === "input") {
    if (typeof filterValue !== "string" || !filterValue) return null;
    return filterValue;
  }

  const values = Array.isArray(filterValue) ? filterValue : [filterValue];
  if (!values.length) return null;
  if (values.length > 1) return `${values.length} selected`;
  const option = field.options?.find((item) => item.value === values[0]);
  return option?.label ?? String(values[0]);
}

type Mode = "ui" | "tql";

interface Row {
  uid: number;
  kind: "row";
  id: string | null;
  operator: TqlOperator;
  value: unknown;
}

interface Group {
  uid: number;
  kind: "group";
  connector: Connector;
  rows: Row[];
}

type Item = Row | Group;

interface Root {
  connector: Connector;
  items: Item[];
}
