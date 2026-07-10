import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Switch } from "@/components/ui/switch";

const meta = {
  title: "Global/Switch",
  component: Switch,
  argTypes: {
    size: {
      control: "select",
      options: ["default", "sm"],
    },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Switch disabled />
        <span className="text-sm text-muted-foreground">Disabled off</span>
      </div>
      <div className="flex items-center gap-3">
        <Switch disabled defaultChecked />
        <span className="text-sm text-muted-foreground">Disabled on</span>
      </div>
    </div>
  ),
};
export const SmallSize: Story = { args: { size: "sm", defaultChecked: true } };
