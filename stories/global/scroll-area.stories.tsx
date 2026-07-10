import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ScrollArea } from "@/components/ui/scroll-area";

const meta = {
  title: "Global/ScrollArea",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-40 w-full max-w-md rounded-lg border border-border">
      <div className="p-4 space-y-2">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-muted-foreground font-mono text-xs">{i + 1}</span>
            <span>Test case #{i + 1} — Login with valid credentials</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
