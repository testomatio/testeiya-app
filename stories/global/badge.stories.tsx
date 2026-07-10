import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, InfoIcon, StarIcon, XCircleIcon } from "@/lib/icons";

const meta = {
  title: "Global/Badge",
  component: Badge,
  args: { children: "Badge" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Destructive: Story = { args: { variant: "destructive" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Link: Story = { args: { variant: "link" } };
export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="default"><CheckIcon /> Passed</Badge>
      <Badge variant="secondary"><InfoIcon /> Manual</Badge>
      <Badge variant="destructive"><XCircleIcon /> Failed</Badge>
      <Badge variant="outline"><StarIcon /> Featured</Badge>
    </div>
  ),
};
