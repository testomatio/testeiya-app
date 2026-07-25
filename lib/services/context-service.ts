import { makeAutoObservable, observable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type { ContextEntry, ContextFolder, ContextKind } from "./types";
import type { RootStore } from "./root-store";

const GIT_URL_RE = /^(https?:\/\/|git@|ssh:\/\/)/;

/**
 * Workspace context: extra folders, git repos and documents added to the
 * workspace for the agent to use (stored under `.testeiya/`). Owns the entry
 * list and the "Add to Workspace" modal state — staged files (drop area),
 * the smart path/URL input, the native folder picker — plus removal. Views
 * (the Workspace toolbar, AddToWorkspaceDialog, the chat status bar) only
 * read/call this.
 */
export class ContextService {
  entries: ContextEntry[] = [];
  /** Top-level `.testeiya` folders — one status-bar section each. */
  folders: ContextFolder[] = [];
  /** Which add operation is in flight (drives busy indicators). */
  busy: ContextKind | null = null;

  modalOpen = false;
  /** The smart input: a local folder path or a git URL. */
  pathValue = "";
  /** Files staged in the modal's drop area, uploaded on submit. */
  pendingFiles: File[] = [];

  constructor(readonly root: RootStore) {
    // File objects must not be proxied — the array is always reassigned whole.
    makeAutoObservable(this, { root: false, pendingFiles: observable.ref }, { autoBind: true });
    reaction(
      () => this.root.sessionId,
      () => {
        this.entries = [];
        this.folders = [];
        if (this.root.sessionId) void this.load();
      }
    );
  }

  get sessionId(): string | null {
    return this.root.sessionId;
  }

  get canSubmit(): boolean {
    return this.pendingFiles.length > 0 || !!this.pathValue.trim();
  }

  /** The removable context entries living inside a `.testeiya` folder. */
  entriesIn(folder: ContextFolder): ContextEntry[] {
    return this.entries.filter((e) => e.path.startsWith(folder.path + "/"));
  }

  async load() {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    try {
      const data = await getJson<ContextResponse>(
        `/api/context?session=${encodeURIComponent(sessionId)}`
      );
      runInAction(() => {
        this.entries = data.entries ?? [];
        this.folders = data.folders ?? [];
      });
    } catch {
      // best-effort — an unreadable manifest just lists nothing
    }
  }

  openModal() {
    this.modalOpen = true;
    this.pathValue = "";
    this.pendingFiles = [];
  }

  closeModal() {
    this.modalOpen = false;
  }

  setPathValue(value: string) {
    this.pathValue = value;
  }

  stageFiles(files: File[]) {
    if (files.length === 0) return;
    this.pendingFiles = [...this.pendingFiles, ...files];
  }

  unstageFile(index: number) {
    this.pendingFiles = this.pendingFiles.filter((_, i) => i !== index);
  }

  /** Native folder picker (desktop); on web it hints to type the path. */
  async pickFolder() {
    try {
      const data = await postJson<{ available?: boolean; path?: string | null }>(
        "/api/workspace/pick"
      );
      if (!data.available) {
        toast.info("The folder picker is available in the desktop app — enter the path instead.");
        return;
      }
      if (data.path) this.setPathValue(data.path);
    } catch {
      toast.info("The folder picker is available in the desktop app — enter the path instead.");
    }
  }

  /** Add everything staged in the modal: files, then the folder path / git URL. */
  async submit() {
    if (!this.canSubmit || this.busy) return;
    const value = this.pathValue.trim();
    const files = this.pendingFiles;
    this.modalOpen = false;
    this.pathValue = "";
    this.pendingFiles = [];
    if (files.length > 0) await this.uploadFiles(files);
    if (!value) return;
    if (GIT_URL_RE.test(value)) {
      await this.add("repo", { url: value });
      return;
    }
    await this.add("folder", { path: value });
  }

  async uploadFiles(files: File[]) {
    const sessionId = this.root.sessionId;
    if (!sessionId || files.length === 0) return;
    this.busy = "file";
    try {
      const form = new FormData();
      form.append("session", sessionId);
      for (const file of files) form.append("files", file, file.name);
      const res = await fetch("/api/context/upload", { method: "POST", body: form });
      const data = await parseResponse(res);
      runInAction(() => {
        this.entries = data.entries ?? this.entries;
        this.folders = data.folders ?? this.folders;
      });
      void this.root.workspace.loadTree();
      const count = files.length === 1 ? files[0].name : `${files.length} files`;
      toast.success(`Added ${count} to the workspace`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      runInAction(() => {
        this.busy = null;
      });
    }
  }

  async remove(entry: ContextEntry) {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    try {
      const data = await postJson<ContextResponse>("/api/context/remove", {
        session: sessionId,
        id: entry.id,
      });
      runInAction(() => {
        this.entries = data.entries ?? [];
        this.folders = data.folders ?? this.folders;
      });
      void this.root.workspace.loadTree();
      toast.success(`Removed ${entry.name} from the workspace`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  private async add(kind: "folder" | "repo", body: { path?: string; url?: string }) {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    this.busy = kind;
    if (kind === "repo") toast.info(`Cloning ${body.url}…`);
    try {
      const data = await postJson<ContextResponse & { added: ContextEntry[] }>(
        "/api/context",
        { session: sessionId, kind, ...body }
      );
      runInAction(() => {
        this.entries = data.entries ?? this.entries;
        this.folders = data.folders ?? this.folders;
      });
      void this.root.workspace.loadTree();
      const name = data.added?.[0]?.name ?? "";
      toast.success(`Added ${name} to the workspace`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to workspace");
    } finally {
      runInAction(() => {
        this.busy = null;
      });
    }
  }
}

async function parseResponse(res: Response): Promise<ContextResponse> {
  const text = await res.text();
  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    try {
      const body = JSON.parse(text);
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return JSON.parse(text);
}

interface ContextResponse {
  entries?: ContextEntry[];
  folders?: ContextFolder[];
}
