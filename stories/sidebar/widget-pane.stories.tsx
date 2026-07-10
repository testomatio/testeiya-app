import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WidgetPane } from "@/components/panel/WidgetPane";

const meta = {
  title: "Sidebar/WidgetPane",
  component: WidgetPane,
  args: {
    children: (
      <div className="p-4 text-sm text-muted-foreground">Widget content</div>
    ),
  },
} satisfies Meta<typeof WidgetPane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex h-80 overflow-hidden rounded-md border">
      <WidgetPane>
        <div className="p-4 text-sm">
          <p className="font-medium">Widget pane</p>
          <p className="mt-1 text-muted-foreground">
            Resizable column between the sidebar and the chat. Drag the right
            edge to resize.
          </p>
        </div>
      </WidgetPane>
      <div className="min-w-0 flex-1 p-4 text-sm text-muted-foreground">
        Chat area
      </div>
    </div>
  ),
};

export const Fill: Story = {
  render: () => (
    <div className="flex h-80 overflow-hidden rounded-md border">
      <WidgetPane fill>
        <div className="p-4 text-sm">
          <p className="font-medium">Fill mode</p>
          <p className="mt-1 text-muted-foreground">
            The pane takes the whole row; the resize handle is hidden.
          </p>
        </div>
      </WidgetPane>
    </div>
  ),
};
