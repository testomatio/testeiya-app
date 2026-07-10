import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Switch } from "@/components/ui/switch";
import { ChevronDownIcon } from "@/lib/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const meta = {
  title: "Global/Collapsible",
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible className="border rounded-lg overflow-hidden max-w-lg">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
        <span>Show advanced settings</span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform data-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 space-y-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm">Enable verbose logging</span>
          <Switch size="sm" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Auto-retry on failure</span>
          <Switch size="sm" defaultChecked />
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const Open: Story = {
  render: () => (
    <Collapsible defaultOpen className="border rounded-lg overflow-hidden max-w-lg">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
        <span>Show advanced settings</span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform data-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 space-y-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm">Enable verbose logging</span>
          <Switch size="sm" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Auto-retry on failure</span>
          <Switch size="sm" defaultChecked />
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
