import { makeAutoObservable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson, del } from "./http";
import type { RootStore } from "./root-store";
import type { ChatMessage } from "@/hooks/use-testeiya";

/**
 * Lists the SDK conversation transcripts for the current workspace (keyed by the
 * session `cwd`) so the Chats sidebar section can switch between them. The actual
 * switch needs the live agent socket, which lives in the chat page's `useTesteiya`
 * hook — so the page injects `applyConversation` / `startNew` here (mirroring how
 * RootStore.navigate is injected). Sections stay thin observers over this service.
 */
export class SessionsService {
  conversations: ConversationInfo[] = [];
  activeId: string | null = null;
  loading = false;
  error: string | null = null;

  applyConversation: (id: string, messages: ChatMessage[]) => void = () => {};
  startNew: () => void = () => {};

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      { root: false, applyConversation: false, startNew: false },
      { autoBind: true }
    );
    reaction(
      () => this.root.sessionId,
      () => {
        this.conversations = [];
        void this.load();
      }
    );
  }

  get sessionId(): string | null {
    return this.root.sessionId;
  }

  setActiveId(id: string | null): void {
    this.activeId = id;
  }

  setHandlers(
    applyConversation: (id: string, messages: ChatMessage[]) => void,
    startNew: () => void
  ): void {
    this.applyConversation = applyConversation;
    this.startNew = startNew;
  }

  async load(): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const data = await getJson<{ conversations: ConversationInfo[] }>(
        `/api/sessions?session=${encodeURIComponent(sessionId)}`
      );
      runInAction(() => {
        this.conversations = data.conversations;
      });
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : String(err);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchMessages(conversationId: string): Promise<ChatMessage[]> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return [];
    const data = await getJson<{ messages: ChatMessage[] }>(
      `/api/sessions/${encodeURIComponent(conversationId)}/messages?session=${encodeURIComponent(sessionId)}`
    );
    return data.messages;
  }

  async select(conversationId: string): Promise<void> {
    if (!this.root.sessionId) return;
    const openTab = this.root.chatTabs.findByConversation(conversationId);
    if (openTab) {
      this.root.chatTabs.activate(openTab.key);
      return;
    }
    const messages = await this.fetchMessages(conversationId);
    this.applyConversation(conversationId, messages);
  }

  createNew(): void {
    this.startNew();
  }

  async rename(conversationId: string, title: string): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    try {
      await postJson(
        `/api/sessions/${encodeURIComponent(conversationId)}/rename?session=${encodeURIComponent(sessionId)}`,
        { title }
      );
      runInAction(() => {
        const conv = this.conversations.find((c) => c.id === conversationId);
        if (conv) conv.title = title;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename agent");
    }
  }

  async remove(conversationId: string): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    try {
      await del(
        `/api/sessions/${encodeURIComponent(conversationId)}?session=${encodeURIComponent(sessionId)}`
      );
      runInAction(() => {
        this.conversations = this.conversations.filter((c) => c.id !== conversationId);
      });
      const openTab = this.root.chatTabs.findByConversation(conversationId);
      if (openTab) {
        this.root.chatTabs.close(openTab.key);
      } else if (conversationId === this.activeId) {
        this.startNew();
      }
      toast.success("Agent deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    }
  }
}

export interface ConversationInfo {
  id: string;
  title: string | null;
  firstMessage: string;
  messageCount: number;
  created: string;
  modified: string;
}
