"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

/**
 * Client-side registry that lets the active widget expose an imperative command
 * handler keyed by its widget id (`WidgetDescriptor.key`). The agent's
 * `ui_widget(widget_id, action, params)` tool resolves to `dispatch(...)`, which
 * runs the same handler the widget's own buttons call — so the user watches the
 * widget change and the agent gets the resulting data back.
 *
 * Only one widget is live at a time (the right pane), so the map normally holds
 * a single entry; it is keyed anyway so a future multi-widget layout just works.
 */
export type WidgetCommandHandle = (
  action: string,
  params: Record<string, unknown>
) => unknown | Promise<unknown>;

export interface WidgetDispatchResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface WidgetBus {
  register(widgetId: string, handle: WidgetCommandHandle): void;
  unregister(widgetId: string, handle: WidgetCommandHandle): void;
  dispatch(
    widgetId: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<WidgetDispatchResult>;
}

const WidgetCommandContext = createContext<WidgetBus | null>(null);

export function WidgetCommandProvider({ children }: { children: ReactNode }) {
  const handles = useRef(new Map<string, WidgetCommandHandle>());

  const bus = useMemo<WidgetBus>(
    () => ({
      register(widgetId, handle) {
        handles.current.set(widgetId, handle);
      },
      unregister(widgetId, handle) {
        if (handles.current.get(widgetId) === handle) {
          handles.current.delete(widgetId);
        }
      },
      async dispatch(widgetId, action, params) {
        const handle = handles.current.get(widgetId);
        if (!handle) {
          return {
            ok: false,
            error: `No active widget with id "${widgetId}". Widgets are only controllable while shown to the user.`,
          };
        }
        try {
          const result = await handle(action, params);
          return { ok: true, result };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),
    []
  );

  return (
    <WidgetCommandContext.Provider value={bus}>{children}</WidgetCommandContext.Provider>
  );
}

export function useWidgetBus(): WidgetBus {
  const bus = useContext(WidgetCommandContext);
  if (!bus) throw new Error("useWidgetBus must be used within a WidgetCommandProvider");
  return bus;
}

/**
 * Register a widget's command handler for the lifetime of the component. The
 * handler is read through a ref so it always sees the latest props/state without
 * re-registering on every render.
 */
export function useRegisterWidget(
  widgetId: string | null | undefined,
  handle: WidgetCommandHandle
): void {
  const bus = useContext(WidgetCommandContext);
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  });

  const stable = useCallback<WidgetCommandHandle>(
    (action, params) => handleRef.current(action, params),
    []
  );

  useEffect(() => {
    if (!bus || !widgetId) return;
    bus.register(widgetId, stable);
    return () => bus.unregister(widgetId, stable);
  }, [bus, widgetId, stable]);
}
