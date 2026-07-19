import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LabelChip } from "@/components/widgets/label-chip";

const SAMPLE = [
  { title: "Severity", color: "#ffe9ad" },
  { title: "To Review", color: "#e5b6e7" },
  { title: "🍿 Flaky", color: "#ecc6d0" },
  { title: "Component", color: "#e2eecd" },
  { title: "Version", color: "#fbc550" },
  { title: "Legacy", color: "#d9d7d4" },
  { title: "Automatable", color: "#cdeef5" },
];

const meta = {
  title: "Widget/LabelChip",
  component: LabelChip,
  args: { title: "Severity", color: "#ffe9ad" },
} satisfies Meta<typeof LabelChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {
  render: () => (
    <div className="flex flex-wrap gap-1.5">
      {SAMPLE.map((l) => (
        <LabelChip key={l.title} title={l.title} color={l.color} dark={false} />
      ))}
      <LabelChip title="No color" dark={false} />
    </div>
  ),
};

export const Dark: Story = {
  render: () => (
    <div className="dark flex flex-wrap gap-1.5 rounded-md bg-[#0a0a0a] p-4">
      {SAMPLE.map((l) => (
        <LabelChip key={l.title} title={l.title} color={l.color} dark />
      ))}
      <LabelChip title="No color" dark />
    </div>
  ),
};

export const WithValue: Story = {
  args: { title: "Severity", value: "critical", color: "#ffe9ad" },
};

export const Truncated: Story = {
  render: () => (
    <div className="flex flex-wrap gap-1.5">
      <LabelChip
        title="A very long label title that will not fit"
        color="#cdeef5"
        dark={false}
      />
      <LabelChip
        title="Environment configuration"
        value="staging-eu-west-1"
        color="#e5b6e7"
        dark={false}
      />
    </div>
  ),
};

export const Clickable: Story = {
  args: {
    title: "To Review",
    color: "#e5b6e7",
    onClick: () => console.log("clicked"),
  },
};
