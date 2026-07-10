import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import { InfoIcon } from "@/lib/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const meta = {
  title: "Global/Popover",
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
      <DemoPopoverContent />
    </Popover>
  ),
};

export const IconTrigger: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button size="icon" variant="ghost" />}>
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent side="right">
        <p className="text-xs text-muted-foreground">
          This field accepts a valid API key from Testomat.io.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

export const Open: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
      <DemoPopoverContent />
    </Popover>
  ),
};

function DemoPopoverContent() {
  return (
    <PopoverContent>
      <div className="space-y-2">
        <p className="text-sm font-medium">Popover content</p>
        <p className="text-xs text-muted-foreground">
          Use popovers for contextual controls and additional information.
        </p>
        <Button size="sm" className="w-full">
          Action
        </Button>
      </div>
    </PopoverContent>
  );
}
