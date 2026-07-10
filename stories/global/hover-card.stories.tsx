import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

const meta = {
  title: "Global/HoverCard",
  component: HoverCard,
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger className="text-sm text-primary underline underline-offset-4 cursor-pointer">
        @testomat.io
      </HoverCardTrigger>
      <DemoHoverCardContent />
    </HoverCard>
  ),
};

export const Open: Story = {
  render: () => (
    <HoverCard defaultOpen>
      <HoverCardTrigger className="text-sm text-primary underline underline-offset-4 cursor-pointer">
        @testomat.io
      </HoverCardTrigger>
      <DemoHoverCardContent />
    </HoverCard>
  ),
};

function DemoHoverCardContent() {
  return (
    <HoverCardContent>
      <div className="flex gap-3">
        <Avatar>
          <AvatarFallback>T</AvatarFallback>
        </Avatar>
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Testomat.io</p>
          <p className="text-xs text-muted-foreground">
            Test management platform for modern QA teams.
          </p>
        </div>
      </div>
    </HoverCardContent>
  );
}
