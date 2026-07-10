import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const meta = {
  title: "Global/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = [
  { name: "Login flow", type: "Automated", status: "Passed", dur: "1.2s" },
  { name: "Checkout", type: "Manual", status: "Failed", dur: "34s" },
  { name: "Search", type: "Automated", status: "Skipped", dur: "—" },
  { name: "Profile update", type: "Mixed", status: "Passed", dur: "5.4s" },
];

const STATUS_COLOR: Record<string, string> = {
  Passed: "text-run-passed",
  Failed: "text-run-failed",
  Skipped: "text-run-skipped",
};

export const Default: Story = {
  render: () => (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableCaption className="mb-3">Recent test runs</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Test</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-muted-foreground">{row.type}</TableCell>
              <TableCell>
                <span className={STATUS_COLOR[row.status] ?? "text-muted-foreground"}>
                  {row.status}
                </span>
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{row.dur}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};
