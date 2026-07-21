import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  DataTableCellBadge,
  DataTableCellBar,
  DataTableCellBoolean,
  DataTableCellCode,
  DataTableCellGauge,
  DataTableCellHeatmap,
  DataTableCellLevelIndicator,
  DataTableCellNumber,
  DataTableCellStar,
  DataTableCellStatusCode,
  DataTableCellText,
  DataTableCellTimestamp,
} from "@/components/data-table/data-table-cell";

const VIOLET = "#8b5cf6";
const sampleDate = new Date("2026-04-21T10:12:33Z");

const meta = {
  title: "Widget/DataTableCells",
  component: DataTableCellText,
  args: { value: "Verify increased braking distance at 10% battery level" },
} satisfies Meta<typeof DataTableCellText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Badge: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-sm">
      <DataTableCellBadge value="GET" color={VIOLET} />
      <DataTableCellBadge value="POST" color="#22c55e" />
      <DataTableCellBadge value={404} color="#ef4444" />
      <DataTableCellBadge value="regression" />
    </div>
  ),
};

export const Bar: Story = {
  render: () => (
    <div className="flex w-48 flex-col gap-3 text-sm">
      <div className="rounded-md border p-2">
        <DataTableCellBar value={42} min={0} max={200} unit="ms" color={VIOLET} />
      </div>
      <div className="rounded-md border p-2">
        <DataTableCellBar value={128} min={0} max={200} unit="ms" color={VIOLET} />
      </div>
      <div className="rounded-md border p-2">
        <DataTableCellBar value={200} min={0} max={200} unit="ms" />
      </div>
    </div>
  ),
};

export const Boolean: Story = {
  render: () => (
    <div className="flex w-16 flex-col gap-2 text-sm">
      <DataTableCellBoolean value={true} />
      <DataTableCellBoolean value={false} />
      <DataTableCellBoolean value={true} color={VIOLET} />
    </div>
  ),
};

export const Code: Story = {
  render: () => (
    <div className="flex flex-col gap-1 text-sm">
      <DataTableCellCode value="req_8f3a91c2" />
      <DataTableCellCode value="trace-4497d6a3" color={VIOLET} />
    </div>
  ),
};

export const Gauge: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      <DataTableCellGauge value={17} min={0} max={100} unit="%" color={VIOLET} />
      <DataTableCellGauge value={62} min={0} max={100} unit="%" color={VIOLET} />
      <DataTableCellGauge value={94} min={0} max={100} unit="%" />
    </div>
  ),
};

export const Heatmap: Story = {
  render: () => (
    <div className="flex w-32 flex-col gap-2 text-sm">
      {[12, 48, 96, 186].map((value) => (
        <div key={value} className="rounded-md border p-2">
          <DataTableCellHeatmap
            value={value}
            min={0}
            max={200}
            unit="ms"
            color={VIOLET}
          />
        </div>
      ))}
    </div>
  ),
};

export const LevelIndicator: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      {["error", "warn", "info", "debug", "success"].map((level) => (
        <DataTableCellLevelIndicator key={level} value={level} />
      ))}
    </div>
  ),
};

export const Number: Story = {
  render: () => (
    <div className="flex flex-col gap-1 text-sm">
      <DataTableCellNumber value={12345.678} unit="ms" />
      <DataTableCellNumber value={42} />
      <DataTableCellNumber value={0.125} unit="s" color={VIOLET} />
    </div>
  ),
};

export const Star: Story = {
  render: () => (
    <div className="flex w-16 flex-col gap-2 text-sm">
      <DataTableCellStar value={true} />
      <DataTableCellStar value={false} />
    </div>
  ),
};

export const StatusCode: Story = {
  render: () => (
    <div className="flex items-center gap-3 text-sm">
      <DataTableCellStatusCode value={200} />
      <DataTableCellStatusCode value={301} />
      <DataTableCellStatusCode value={404} />
      <DataTableCellStatusCode value={500} />
      <DataTableCellStatusCode value={200} color={VIOLET} />
    </div>
  ),
};

export const Text: Story = {
  render: () => (
    <div className="flex w-56 flex-col gap-2 text-sm">
      <DataTableCellText value="Short text" />
      <DataTableCellText value="A much longer text value that truncates and shows a tooltip on hover" />
      <DataTableCellText value="Colored text value" color={VIOLET} />
    </div>
  ),
};

export const Timestamp: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      <DataTableCellTimestamp date={sampleDate} />
      <DataTableCellTimestamp date="2026-06-02T02:13:00Z" color={VIOLET} />
    </div>
  ),
};
