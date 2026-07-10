import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RenderFrame } from "@/components/ai-elements/render-frame";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/lib/icons";

const sampleRows = (
  <ul className="space-y-1 text-sm">
    <li className="flex items-center justify-between gap-4">
      <span>Manual run - Todo Tests</span>
      <span className="text-muted-foreground">38/42 passed</span>
    </li>
    <li className="flex items-center justify-between gap-4">
      <span>Hybrid release regression</span>
      <span className="text-muted-foreground">51/60 passed</span>
    </li>
    <li className="flex items-center justify-between gap-4">
      <span>Automated nightly run</span>
      <span className="text-muted-foreground">running</span>
    </li>
  </ul>
);

const meta = {
  title: "Agent/RenderFrame",
  component: RenderFrame,
  args: {
    children: null,
  },
} satisfies Meta<typeof RenderFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <RenderFrame
      title="Runs in codeceptjs"
      icon={<Icon name="directions_run" className="size-4" />}
      tag={<Badge variant="secondary">runs</Badge>}
      meta="3 of 199"
    >
      {sampleRows}
    </RenderFrame>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <RenderFrame
      title="Edited: checkout.spec.ts"
      icon={<Icon name="edit_document" className="size-4" />}
      tag={<Badge variant="secondary">edit</Badge>}
      defaultOpen={false}
    >
      {sampleRows}
    </RenderFrame>
  ),
};
