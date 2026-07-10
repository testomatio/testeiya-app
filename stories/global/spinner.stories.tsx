import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Spinner } from "@/components/ui/spinner";

const meta = {
  title: "Global/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Spinner className="size-3 text-muted-foreground" />
      <Spinner className="size-4" />
      <Spinner className="size-6 text-primary" />
    </div>
  ),
};
