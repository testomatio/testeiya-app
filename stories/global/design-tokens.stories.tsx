import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Global/Design Tokens",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CORE_TOKENS = [
  ["Background", "--background", "bg-background"],
  ["Foreground", "--foreground", "bg-foreground"],
  ["Primary", "--primary", "bg-primary"],
  ["Primary fg", "--primary-foreground", "bg-primary-foreground"],
  ["Secondary", "--secondary", "bg-secondary"],
  ["Muted", "--muted", "bg-muted"],
  ["Muted fg", "--muted-foreground", "bg-muted-foreground"],
  ["Accent", "--accent", "bg-accent"],
  ["Accent fg", "--accent-foreground", "bg-accent-foreground"],
  ["Card", "--card", "bg-card"],
  ["Border", "--border", "bg-border"],
  ["Destructive", "--destructive", "bg-destructive"],
  ["Ring", "--ring", "bg-ring"],
  ["Input", "--input", "bg-input"],
  ["Popover", "--popover", "bg-popover"],
] as const;

const STATUS_TOKENS = [
  ["Success", "--status-success", "bg-status-success"],
  ["Success fg", "--status-success-foreground", "bg-status-success-foreground"],
  ["Error", "--status-error", "bg-status-error"],
  ["Error fg", "--status-error-foreground", "bg-status-error-foreground"],
  ["Warning", "--status-warning", "bg-status-warning"],
  ["Warning fg", "--status-warning-foreground", "bg-status-warning-foreground"],
  ["Info", "--status-info", "bg-status-info"],
  ["Info fg", "--status-info-foreground", "bg-status-info-foreground"],
] as const;

const TYPE_TOKENS = [
  ["Manual", "--type-manual", "bg-type-manual"],
  ["Manual fg", "--type-manual-foreground", "bg-type-manual-foreground"],
  ["Automated", "--type-automated", "bg-type-automated"],
  ["Auto fg", "--type-automated-foreground", "bg-type-automated-foreground"],
  ["Mixed", "--type-mixed", "bg-type-mixed"],
  ["Mixed fg", "--type-mixed-foreground", "bg-type-mixed-foreground"],
] as const;

const RUN_TOKENS = [
  ["Passed", "--run-passed", "bg-run-passed"],
  ["Failed", "--run-failed", "bg-run-failed"],
  ["Skipped", "--run-skipped", "bg-run-skipped"],
  ["Running", "--run-running", "bg-run-running"],
  ["Terminated", "--run-terminated", "bg-run-terminated"],
  ["Pending", "--run-pending", "bg-run-pending"],
] as const;

const CHART_TOKENS = [
  ["Chart 1", "--chart-1", "bg-chart-1"],
  ["Chart 2", "--chart-2", "bg-chart-2"],
  ["Chart 3", "--chart-3", "bg-chart-3"],
  ["Chart 4", "--chart-4", "bg-chart-4"],
  ["Chart 5", "--chart-5", "bg-chart-5"],
] as const;

const RADII = [
  ["rounded-sm", "sm (0.375rem)"],
  ["rounded-md", "md (0.5rem)"],
  ["rounded-lg", "lg (0.625rem)"],
  ["rounded-xl", "xl (0.875rem)"],
  ["rounded-2xl", "2xl (1.125rem)"],
  ["rounded-3xl", "3xl (1.375rem)"],
  ["rounded-full", "full"],
] as const;

export const Colors: Story = {
  render: () => (
    <div className="space-y-6">
      <SwatchGroup label="Core tokens" swatches={CORE_TOKENS} />
      <SwatchGroup label="Status" swatches={STATUS_TOKENS} />
      <SwatchGroup label="Test types" swatches={TYPE_TOKENS} />
      <SwatchGroup label="Run statuses" swatches={RUN_TOKENS} />
      <SwatchGroup label="Charts" swatches={CHART_TOKENS} />
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-xs text-muted-foreground">Heading scale</p>
        <div className="space-y-1">
          <h1>H1 — 24px Medium Tight</h1>
          <h2>H2 — 22px Medium Tight</h2>
          <h3>H3 — 20px Medium Tight</h3>
          <h4>H4 — 18px SemiBold</h4>
          <h5>H5 — 16px SemiBold</h5>
          <h6>H6 — 14px Bold Uppercase Indigo Eyebrow</h6>
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs text-muted-foreground">Body sizes</p>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">text-xs / 12px — caption, labels</p>
          <p className="text-sm">text-sm / 14px — default body, UI text</p>
          <p className="text-base">text-base / 16px — primary readable content</p>
          <p className="text-lg">text-lg / 18px — lead paragraph</p>
          <p className="text-xl">text-xl / 20px — large callout</p>
          <p className="text-2xl">text-2xl / 24px — display</p>
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs text-muted-foreground">Monospace — JetBrains Mono</p>
        <code className="font-mono text-sm bg-muted px-2 py-1 rounded-md">
          {'const greeting = "Hello, Testeiya!";'}
        </code>
      </div>
    </div>
  ),
};

export const Radius: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {RADII.map(([cls, label]) => (
        <div key={label} className="flex flex-col items-center gap-2">
          <div className={`h-10 w-10 bg-primary ${cls}`} />
          <span className="text-[10px] font-mono text-muted-foreground text-center">{label}</span>
        </div>
      ))}
    </div>
  ),
};

function Swatch({ label, varName, className }: { label: string; varName: string; className: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 min-w-[80px]">
      <div className={`h-10 w-full rounded-lg border border-border ${className}`} />
      <span className="text-[10px] font-medium text-foreground leading-tight">{label}</span>
      <span className="text-[10px] text-muted-foreground font-mono leading-tight">{varName}</span>
    </div>
  );
}

function SwatchGroup({
  label,
  swatches,
}: {
  label: string;
  swatches: readonly (readonly [string, string, string])[];
}) {
  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">{label}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-4">
        {swatches.map(([name, varName, className]) => (
          <Swatch key={varName} label={name} varName={varName} className={className} />
        ))}
      </div>
    </div>
  );
}
