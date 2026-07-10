import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SectionShell } from "@/components/panel/SectionShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RotateCwIcon, Trash2Icon } from "@/lib/icons";

const meta = {
  title: "Sidebar/SectionShell",
  component: SectionShell,
  args: {
    title: "Workspace",
    active: true,
    children: (
      <p className="px-4 py-2 text-sm text-muted-foreground">
        Section content scrolls inside the shell body.
      </p>
    ),
  },
} satisfies Meta<typeof SectionShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAccessoryAndActions: Story = {
  render: () => (
    <div className="h-64 w-96 overflow-hidden rounded-md border">
      <SectionShell
        title="Debug"
        active={true}
        titleAccessory={
          <Tabs defaultValue="requests">
            <TabsList className="h-7">
              <TabsTrigger value="store" className="px-2">
                Store
              </TabsTrigger>
              <TabsTrigger value="requests" className="gap-1 px-2">
                Requests
                <span className="text-xs tabular-nums opacity-60">12</span>
              </TabsTrigger>
              <TabsTrigger value="cli" className="gap-1 px-2">
                CLI
                <span className="text-xs tabular-nums opacity-60">3</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
        actions={
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Refresh">
                    <RotateCwIcon className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>
                <p>Refresh</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Clear log">
                    <Trash2Icon className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>
                <p>Clear log</p>
              </TooltipContent>
            </Tooltip>
          </>
        }
      >
        <p className="p-4 text-xs text-muted-foreground">
          No requests yet. Same-origin /api calls and outbound Testomat.io
          calls appear here.
        </p>
      </SectionShell>
    </div>
  ),
};
