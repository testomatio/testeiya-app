import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as StatusPill from "@/components/widgets/status-pill";

const meta = {
  title: "Widget/StatusPill",
  component: StatusPill.MetaPill,
  args: { children: "manual" },
} satisfies Meta<typeof StatusPill.MetaPill>;

export default meta;
type Story = StoryObj<typeof meta>;

const RUN_STATUSES = [
  "passed",
  "failed",
  "skipped",
  "terminated",
  "pending",
  "queued",
  "running",
];

export const MetaPill: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill.MetaPill>manual</StatusPill.MetaPill>
      <StatusPill.MetaPill>automated</StatusPill.MetaPill>
      <StatusPill.MetaPill title="branch">release/v2.3</StatusPill.MetaPill>
      <StatusPill.MetaPill>staging</StatusPill.MetaPill>
      <StatusPill.MetaPill className="text-amber-600 dark:text-amber-400">
        hidden
      </StatusPill.MetaPill>
    </div>
  ),
};

export const LabelsRow: Story = {
  render: () => (
    <StatusPill.LabelsRow
      labels={[
        { title: "To Review", color: "#e5b6e7" },
        { title: "Automatable", color: "#c2e2ff" },
        { title: "Severity", value: "critical", color: "#ffe9ad" },
        { title: "Component", value: "checkout", color: "#e2eecd", short: true },
        "wcag-2.0",
        { name: "regression" },
      ]}
      tags={["smoke", "nightly"]}
    />
  ),
};

export const OverflowBadgeList: Story = {
  render: () => (
    <div className="w-56 rounded-md border p-2">
      <StatusPill.OverflowBadgeList
        items={[
          "smoke",
          "tier-1",
          "regression",
          "nightly",
          "payments",
          "a11y",
          "hardware",
        ]}
      />
    </div>
  ),
};

export const StatusCount: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <StatusPill.StatusCount tone="pass" value={38} />
      <StatusPill.StatusCount tone="fail" value={2} />
      <StatusPill.StatusCount tone="skip" value={2} />
      <StatusPill.StatusCount tone="pass" value={0} />
    </div>
  ),
};

export const StatusTriplet: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <StatusPill.StatusTriplet passed={38} failed={2} skipped={2} />
      <StatusPill.StatusTriplet passed={0} failed={0} skipped={0} />
    </div>
  ),
};

export const RunStatusDot: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {RUN_STATUSES.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5 text-xs">
          <StatusPill.RunStatusDot status={status} />
          <span className="capitalize text-muted-foreground">{status}</span>
        </span>
      ))}
    </div>
  ),
};

export const RunProgress: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <StatusPill.RunProgress percent={0} />
      <StatusPill.RunProgress percent={28} />
      <StatusPill.RunProgress percent={60} />
      <StatusPill.RunProgress percent={100} />
    </div>
  ),
};

export const StatusFilterChip: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusPill.StatusFilterChip
        label="Passed"
        status="passed"
        count={38}
        active={true}
        onClick={() => {}}
      />
      <StatusPill.StatusFilterChip
        label="Failed"
        status="failed"
        count={2}
        active={false}
        onClick={() => {}}
      />
      <StatusPill.StatusFilterChip
        label="Skipped"
        status="skipped"
        count={2}
        active={false}
        onClick={() => {}}
      />
    </div>
  ),
};
