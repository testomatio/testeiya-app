import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Calendar } from "@/components/ui/calendar";

const meta = {
  title: "Global/Calendar",
  component: Calendar,
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Calendar
      mode="single"
      selected={new Date(2026, 5, 12)}
      defaultMonth={new Date(2026, 5, 1)}
      className="rounded-lg border border-border"
    />
  ),
};

export const Range: Story = {
  render: () => (
    <Calendar
      mode="range"
      selected={{ from: new Date(2026, 5, 8), to: new Date(2026, 5, 16) }}
      defaultMonth={new Date(2026, 5, 1)}
      className="rounded-lg border border-border"
    />
  ),
};
