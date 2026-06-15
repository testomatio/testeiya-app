"use client";

import { observer } from "mobx-react-lite";
import {
  mdiPlayCircleOutline,
  mdiPowerStandby,
  mdiRecordCircleOutline,
  mdiStopCircleOutline,
  mdiMonitorScreenshot,
} from "@mdi/js";
import { ChevronDownIcon } from "lucide-react";
import { GlobeIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MdiIcon } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useBrowserService } from "@/lib/services/StoreProvider";

/**
 * Browser controls for the live Playwright CLI session, as a dropdown with a
 * status dot (green = browser running, gray = not running): Start/Stop the
 * browser, Record/Stop video, Screenshot. Self-contained — relocate as needed.
 */
export const BrowserControls = observer(function BrowserControls({
  iconOnly = false,
}: {
  /** Render just a status dot + globe icon trigger (for the collapsed rail). */
  iconOnly?: boolean;
}) {
  const browser = useBrowserService();
  const startStopIcon = browser.browserOpen ? mdiPowerStandby : mdiPlayCircleOutline;
  const recordIcon = browser.recording ? mdiStopCircleOutline : mdiRecordCircleOutline;
  const statusDot = (
    <span
      className={cn(
        "size-2 rounded-full",
        browser.browserOpen ? "bg-green-500" : "bg-muted-foreground/40"
      )}
      title={browser.browserOpen ? "Browser running" : "Browser not running"}
    />
  );

  return (
    <DropdownMenu onOpenChange={(open) => open && void browser.refreshStatus()}>
      {iconOnly && (
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!browser.sessionId}
                    aria-label="Browser"
                    className="relative text-muted-foreground"
                  />
                }
              >
                <GlobeIcon className="size-4" />
                <span className="absolute right-1 top-1">{statusDot}</span>
              </DropdownMenuTrigger>
            }
          />
          <TooltipContent side="left"><p>Browser</p></TooltipContent>
        </Tooltip>
      )}
      {!iconOnly && (
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!browser.sessionId}
              className="h-7 gap-1.5 px-2 text-muted-foreground text-xs"
            />
          }
        >
          {statusDot}
          Browser
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          disabled={browser.busy}
          onClick={() => void browser.toggleBrowser()}
        >
          <MdiIcon path={startStopIcon} className="size-4" />
          {browser.browserOpen ? "Stop Browser" : "Start Browser"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={browser.busy}
          onClick={() => void browser.toggleRecording()}
        >
          <MdiIcon
            path={recordIcon}
            className={cn("size-4", browser.recording && "text-red-500")}
          />
          {browser.recording ? "Stop Video Recording" : "Record Video"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={browser.busy || !browser.browserOpen}
          onClick={() => void browser.screenshot()}
        >
          <MdiIcon path={mdiMonitorScreenshot} className="size-4" />
          Screenshot
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={browser.incognito}
          disabled={browser.busy}
          onCheckedChange={(checked) => void browser.setIncognito(checked)}
          onSelect={(e) => e.preventDefault()}
        >
          Incognito mode
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
