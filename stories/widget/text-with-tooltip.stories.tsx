import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TextWithTooltip } from "@/components/data-table/text-with-tooltip";

const meta = {
  title: "Widget/TextWithTooltip",
  component: TextWithTooltip,
  args: { text: "Verify heartbeat service reports normal status" },
} satisfies Meta<typeof TextWithTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Truncated: Story = {
  render: () => (
    <div className="w-40 rounded-md border p-2 text-sm">
      <TextWithTooltip text="Verify all interactive elements are reachable and operable using keyboard only" />
    </div>
  ),
};
