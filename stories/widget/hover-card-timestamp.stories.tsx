import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HoverCardTimestamp } from "@/components/data-table/hover-card-timestamp";

const meta = {
  title: "Widget/HoverCardTimestamp",
  component: HoverCardTimestamp,
  args: { date: new Date("2026-04-21T10:12:33Z") },
} satisfies Meta<typeof HoverCardTimestamp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="p-8 text-sm">
      <HoverCardTimestamp {...args} />
    </div>
  ),
};
