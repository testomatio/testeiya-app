import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FolderOpenIcon, PlusIcon } from "@/lib/icons";

const meta = {
  title: "Global/EmptyState",
  component: EmptyState,
  args: {
    icon: <FolderOpenIcon className="size-5 text-muted-foreground" />,
    title: "No tests found",
    description: "Pull test cases from your project or create a new one to get started.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    children: (
      <Button size="sm" variant="outline">
        <PlusIcon /> New test case
      </Button>
    ),
  },
};
