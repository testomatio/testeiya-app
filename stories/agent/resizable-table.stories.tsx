import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ResizableTh,
  ResizableThead,
} from "@/components/ai-elements/resizable-table";

const rows = [
  {
    test: "Text input field should be cleared after each item",
    status: "passed",
    duration: "1.24s",
    environment: "chrome-headless",
  },
  {
    test: "Todos containing weird characters",
    status: "failed",
    duration: "3.61s",
    environment: "chrome-headless",
  },
  {
    test: "Create multiple todo items",
    status: "passed",
    duration: "2.08s",
    environment: "firefox",
  },
  {
    test: "Verify increased braking distance at 10% battery level",
    status: "skipped",
    duration: "—",
    environment: "qa-rig-3",
  },
];

const meta = {
  title: "Agent/ResizableTable",
  component: ResizableThead,
} satisfies Meta<typeof ResizableThead>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <ResizableThead>
          <tr>
            <ResizableTh>Test</ResizableTh>
            <ResizableTh>Status</ResizableTh>
            <ResizableTh>Duration</ResizableTh>
            <ResizableTh>Environment</ResizableTh>
          </tr>
        </ResizableThead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.test} className="border-t">
              <td className="px-4 py-2">{row.test}</td>
              <td className="px-4 py-2">{row.status}</td>
              <td className="px-4 py-2">{row.duration}</td>
              <td className="px-4 py-2">{row.environment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};
