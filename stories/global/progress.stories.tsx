import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Progress } from "@/components/ui/progress";

const meta = {
  title: "Global/Progress",
  component: Progress,
  args: { value: 60 },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <Progress value={25} />
      <Progress value={60} />
      <Progress value={90} />
    </div>
  ),
};

export const Indeterminate: Story = {
  render: () => (
    <div className="w-72">
      <Progress value={null} />
    </div>
  ),
};
