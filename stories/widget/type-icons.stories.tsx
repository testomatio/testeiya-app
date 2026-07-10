import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SuiteKindIcon, TypeIcon } from "@/components/widgets/type-icons";

const meta = {
  title: "Widget/TypeIcons",
  component: TypeIcon,
  args: { type: "manual" },
  argTypes: {
    type: {
      control: "select",
      options: ["manual", "automated", "mixed"],
    },
  },
} satisfies Meta<typeof TypeIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Manual: Story = {};
export const Automated: Story = { args: { type: "automated" } };
export const Mixed: Story = { args: { type: "mixed" } };

export const AllTypes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-2 text-xs">
        <TypeIcon type="manual" />
        <span className="text-muted-foreground">manual</span>
      </span>
      <span className="inline-flex items-center gap-2 text-xs">
        <TypeIcon type="automated" />
        <span className="text-muted-foreground">automated</span>
      </span>
      <span className="inline-flex items-center gap-2 text-xs">
        <TypeIcon type="mixed" />
        <span className="text-muted-foreground">mixed</span>
      </span>
    </div>
  ),
};

export const SuiteKinds: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-2 text-xs">
        <SuiteKindIcon fileType="folder" />
        <span className="text-muted-foreground">folder</span>
      </span>
      <span className="inline-flex items-center gap-2 text-xs">
        <SuiteKindIcon fileType="folder" isRoot />
        <span className="text-muted-foreground">root folder</span>
      </span>
      <span className="inline-flex items-center gap-2 text-xs">
        <SuiteKindIcon fileType="file" />
        <span className="text-muted-foreground">file (suite)</span>
      </span>
    </div>
  ),
};
