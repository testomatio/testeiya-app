import { makeAutoObservable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson } from "./http";
import type { SearchResponse, SearchScope } from "./types";
import type { RootStore } from "./root-store";

/**
 * Workspace full-text search business logic: the sidebar search bar state, the
 * query run against `/api/workspace/search`, and the main-panel results view.
 * The views (WorkspaceSection search bar / SearchResults) only read/call this;
 * opening a result delegates to WorkspaceService (which owns the editor).
 */
export class SearchService {
  searchOpen = false;
  searchQuery = "";
  searchScope: SearchScope = "manual";
  results: SearchResponse | null = null;
  searching = false;
  searchError: string | null = null;
  showSearch = false;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false }, { autoBind: true });

    reaction(
      () => this.root.sessionId,
      () => this.reset()
    );
  }

  get sessionId(): string | null {
    return this.root.sessionId;
  }

  toggleSearch() {
    this.searchOpen = !this.searchOpen;
  }

  setSearchQuery(query: string) {
    this.searchQuery = query;
  }

  setSearchScope(scope: SearchScope) {
    this.searchScope = scope;
    if (this.searchQuery.trim()) void this.runSearch();
  }

  async runSearch() {
    const sessionId = this.root.sessionId;
    const query = this.searchQuery.trim();
    if (!sessionId || !query) return;
    this.searching = true;
    this.searchError = null;
    this.showSearch = true;
    try {
      const data = await getJson<SearchResponse>(
        `/api/workspace/search?session=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(query)}&scope=${this.searchScope}`
      );
      runInAction(() => {
        this.results = data;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      runInAction(() => {
        this.searchError = message;
        this.results = null;
      });
      toast.error(message);
    } finally {
      runInAction(() => {
        this.searching = false;
      });
    }
  }

  closeSearch() {
    this.showSearch = false;
  }

  openResult(path: string, lineText: string) {
    this.root.workspace.open(path, undefined, {
      fullHeight: true,
      scrollToText: lineText,
    });
  }

  private reset() {
    this.searchOpen = false;
    this.searchQuery = "";
    this.searchScope = "manual";
    this.results = null;
    this.searching = false;
    this.searchError = null;
    this.showSearch = false;
  }
}
