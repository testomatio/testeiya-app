import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PipelinesSection } from "@/components/panel/sections/PipelinesSection";

const meta = {
  title: "Sidebar/PipelinesSection",
  component: PipelinesSection,
  args: { active: true, onToggle: () => {}, initializing: false },
} satisfies Meta<typeof PipelinesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="h-72 w-80 overflow-hidden rounded-md border">
      <PipelinesSection {...args} />
    </div>
  ),
};
