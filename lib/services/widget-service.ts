import { makeAutoObservable, observable, reaction } from "mobx";
import type { ProjectResource } from "./project-service";
import type { RootStore } from "./root-store";

/**
 * Owns the single widget shown in the right-hand pane. One widget at a time:
 * agent renders (pushed from the chat stream), a project resource view, the
 * file editor, or workspace search. `show` replaces only when a genuinely new
 * widget arrives (deduped by a stable key); the resource/file/search sources are
 * mirrored from their owning services so the pane stays in lock-step with them.
 */
export class WidgetService {
  current: WidgetDescriptor | null = null;
  // A nested sub-view (e.g. the manual-run executor) can override the kind the
  // active widget reports to the agent, since it shares the parent's id but
  // exposes a different action set. Set on mount, cleared on unmount.
  activeOverride: { kind: string; state?: string; title?: string; id?: string } | null = null;
  // The widget key the user removed from prompt context. While it matches the
  // current widget, its <active_widget> block is not sent. Reset whenever a
  // different widget is shown, so navigating re-references by default.
  contextDismissedKey: string | null = null;
  // The full structured contents of the visible widget (the rows the user sees),
  // published by the active renderer. The agent reads it in one shot via the
  // `get` widget action instead of re-querying the API for what's on screen.
  snapshot: unknown = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      {
        root: false,
        current: observable.ref,
        activeOverride: observable.ref,
        snapshot: false,
      },
      { autoBind: true }
    );

    reaction(
      () => this.root.sessionId,
      () => this.clear()
    );
    reaction(
      () => this.sourceKey,
      (key) => this.syncSource(key)
    );
  }

  get hasWidget(): boolean {
    return !!this.current;
  }

  get contextDismissed(): boolean {
    return !!this.current && this.contextDismissedKey === this.current.key;
  }

  show(widget: WidgetDescriptor): void {
    if (this.current?.key === widget.key) return;
    this.contextDismissedKey = null;
    this.snapshot = null;
    this.current = widget;
  }

  clear(): void {
    this.contextDismissedKey = null;
    this.snapshot = null;
    if (this.current) this.current = null;
  }

  setSnapshot(data: unknown): void {
    this.snapshot = data;
  }

  clearSnapshot(): void {
    if (this.snapshot) this.snapshot = null;
  }

  dismissContext(): void {
    this.contextDismissedKey = this.current?.key ?? null;
  }

  setActiveOverride(override: { kind: string; state?: string; title?: string; id?: string }): void {
    this.activeOverride = override;
  }

  clearActiveOverride(): void {
    if (this.activeOverride) this.activeOverride = null;
  }

  private get sourceKey(): string | null {
    const manualRun = this.root.project.activeManualRun;
    if (manualRun) return `manual-run:${String(manualRun.id ?? "")}`;
    const resource = this.root.project.openResource;
    if (resource) return `resource:${resource}`;
    const file = this.root.workspace.openFile;
    if (file) return `file:${file.key}`;
    if (this.root.search.showSearch) return "search";
    return null;
  }

  private syncSource(key: string | null): void {
    if (!key) {
      if (this.current && this.current.source !== "tool") this.clear();
      return;
    }
    if (this.root.project.activeManualRun) {
      this.show({ source: "manual-run", key });
      return;
    }
    const resource = this.root.project.openResource;
    if (resource) {
      this.show({ source: "resource", key, resource });
      return;
    }
    const file = this.root.workspace.openFile;
    if (file) {
      this.show({ source: "file", key, path: file.path });
      return;
    }
    this.show({ source: "search", key });
  }
}

export type WidgetDescriptor =
  | {
      source: "tool";
      key: string;
      toolName: string;
      input: unknown;
      output: unknown;
    }
  | { source: "resource"; key: string; resource: ProjectResource }
  | { source: "manual-run"; key: string }
  | { source: "file"; key: string; path: string }
  | { source: "search"; key: string };
