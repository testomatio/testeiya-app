import { makeAutoObservable, reaction } from "mobx";
import type { RootStore } from "./root-store";
import type { ChatStatus } from "@/hooks/use-testeiya";

const MAX_TABS = 5;

/**
 * Manages the parallel chat tabs shown in the chat panel header. Each tab is
 * backed by its own mounted ChatView (own `useTesteiya` hook + WebSocket +
 * agent session), which reports its live state up via `report()`; inactive
 * views stay mounted (hidden) so background chats keep streaming. Capped at
 * MAX_TABS because every prompted tab holds its own agent session + MCP
 * subprocesses on the server.
 */
export class ChatTabsService {
  tabs: ChatTab[] = [];
  activeKey: string | null = null;

  private counter = 0;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false }, { autoBind: true });
    this.openTab();
    reaction(
      () => this.root.sessionId,
      () => this.reset()
    );
  }

  get activeTab(): ChatTab | undefined {
    return this.tabs.find((t) => t.key === this.activeKey);
  }

  get visibleTabs(): ChatTab[] {
    return this.tabs.filter((t) => !isBlankTab(t));
  }

  get canOpen(): boolean {
    if (this.tabs.length < MAX_TABS) return true;
    return this.tabs.some(isBlankTab);
  }

  openTab(): void {
    const blank = this.tabs.find(isBlankTab);
    if (blank) {
      this.activeKey = blank.key;
      return;
    }
    if (this.tabs.length >= MAX_TABS) return;
    this.counter += 1;
    const tab: ChatTab = {
      key: `tab-${this.counter}`,
      conversationId: null,
      status: "ready",
      mcpTools: [],
      expectedMcpServers: [],
      mcpLoaded: false,
      cwd: null,
    };
    this.tabs.push(tab);
    this.activeKey = tab.key;
  }

  close(key: string): void {
    const idx = this.tabs.findIndex((t) => t.key === key);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    if (tab.status === "submitted" || tab.status === "streaming") tab.stop?.();
    this.tabs.splice(idx, 1);
    if (this.tabs.length === 0) {
      this.openTab();
      return;
    }
    if (this.activeKey !== key) return;
    this.activeKey = this.tabs[Math.min(idx, this.tabs.length - 1)].key;
  }

  activate(key: string): void {
    if (!this.tabs.some((t) => t.key === key)) return;
    this.activeKey = key;
    this.tabs = this.tabs.filter((t) => t.key === key || !isBlankTab(t));
  }

  report(key: string, patch: Partial<ChatTab>): void {
    const tab = this.tabs.find((t) => t.key === key);
    if (!tab) return;
    Object.assign(tab, patch);
  }

  findByConversation(conversationId: string): ChatTab | undefined {
    return this.tabs.find((t) => t.conversationId === conversationId);
  }

  private reset(): void {
    if (this.tabs.length === 1 && isBlankTab(this.tabs[0])) return;
    this.tabs = [];
    this.openTab();
  }
}

function isBlankTab(tab: ChatTab): boolean {
  if (tab.conversationId) return false;
  return tab.status !== "submitted" && tab.status !== "streaming";
}

export interface ChatTab {
  key: string;
  conversationId: string | null;
  status: ChatStatus;
  mcpTools: string[];
  expectedMcpServers: string[];
  mcpLoaded: boolean;
  cwd: string | null;
  stop?: () => void;
}
