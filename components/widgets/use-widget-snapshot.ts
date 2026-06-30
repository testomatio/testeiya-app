"use client";

import { useEffect } from "react";
import { useStores } from "@/lib/services/StoreProvider";

/**
 * Publish the visible widget's full structured contents to WidgetService so the
 * agent can read them in one `get` call (see the `ui_widget` `get` action) rather
 * than re-querying the API for what the user already sees on screen. Runs every
 * render so the snapshot tracks the live data; clears on unmount. Pass
 * `active = false` while a nested view owns the snapshot (e.g. a list whose row
 * detail is open) so the two don't fight over it.
 */
export function useWidgetSnapshot(data: unknown, active = true): void {
  const store = useStores();
  useEffect(() => {
    if (!active) return;
    store.widget.setSnapshot(data);
    return () => store.widget.clearSnapshot();
  });
}
