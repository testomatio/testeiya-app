import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PriorityIcon } from "@/components/widgets/priority-icon";

const meta = {
  title: "Widget/PriorityIcon",
  component: PriorityIcon,
  args: { priority: "high" },
} satisfies Meta<typeof PriorityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

const PRIORITIES = ["low", "normal", "high", "important", "critical"];

export const Default: Story = {};

export const AllPriorities: Story = {
  render: () => (
    <div className="flex flex-col gap-1 text-sm">
      {PRIORITIES.map((priority) => (
        <div key={priority} className="flex items-center gap-2">
          <PriorityIcon priority={priority} />
          <span>{priority}</span>
        </div>
      ))}
    </div>
  ),
};

export const NextToTitle: Story = {
  render: () => (
    <div className="flex w-96 flex-col divide-y rounded-md border text-sm">
      {PRIORITIES.map((priority) => (
        <div key={priority} className="flex items-center gap-2 px-2 py-1.5">
          <PriorityIcon priority={priority} />
          <span className="truncate font-medium">
            Approval permissions restrict create, dismiss, and review actions
          </span>
        </div>
      ))}
    </div>
  ),
};
