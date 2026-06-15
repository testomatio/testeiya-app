"use client";

import { observer } from "mobx-react-lite";
import { mdiChatOutline, mdiChatPlusOutline } from "@mdi/js";
import { usePanel } from "@/lib/panel/PanelContext";
import { useSessionsService } from "@/lib/services/StoreProvider";
import { MdiIcon } from "@/components/icons";
import { BrowserControls } from "@/components/BrowserControls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const RAIL_W = 48;

/**
 * The collapsed chat rail: a 48px strip docked to the right when the chat is
 * minimized. Mirrors the left sidebar's icon strip. Exposes expand-chat (top),
 * New chat, and the browser controls so common actions stay reachable.
 */
export const ChatRail = observer(function ChatRail() {
  const { setChatOpen } = usePanel();
  const sessions = useSessionsService();

  return (
    <nav
      className="flex shrink-0 flex-col items-center gap-1 border-l bg-background px-1"
      style={{ width: RAIL_W }}
      aria-label="Chat"
    >
      <div className="flex h-12 shrink-0 items-center justify-center">
        <Tooltip>
          <TooltipTrigger render={
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Open chat"
              className="flex size-8 items-center justify-center rounded-md transition-colors text-foreground hover:bg-muted"
            >
              <MdiIcon path={mdiChatOutline} className="size-4" />
            </button>
          } />
          <TooltipContent side="left"><p>Open chat</p></TooltipContent>
        </Tooltip>
      </div>

      <Tooltip>
        <TooltipTrigger render={
          <button
            type="button"
            onClick={() => sessions.createNew()}
            disabled={!sessions.sessionId}
            aria-label="New chat"
            className="flex size-8 items-center justify-center rounded-md transition-colors text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <MdiIcon path={mdiChatPlusOutline} className="size-4" />
          </button>
        } />
        <TooltipContent side="left"><p>New chat</p></TooltipContent>
      </Tooltip>

      <BrowserControls iconOnly />
    </nav>
  );
});
