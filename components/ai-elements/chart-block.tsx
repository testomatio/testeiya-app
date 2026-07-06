"use client";

import type { CustomRendererProps } from "streamdown";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Shimmer } from "./shimmer";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
  padding: "4px 8px",
};

const TOOLTIP_ITEM_STYLE = { color: "var(--popover-foreground)" };

const AXIS_STYLE = { fontSize: 12, fill: "var(--muted-foreground)" };

export function ChartRenderer({ code, isIncomplete }: CustomRendererProps) {
  if (isIncomplete) {
    return (
      <div className="my-4 flex h-[240px] items-center justify-center rounded-lg border border-border bg-muted/30">
        <Shimmer>Rendering chart…</Shimmer>
      </div>
    );
  }

  const spec = parseChartSpec(code);
  if (!spec) {
    return (
      <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground">
        {code}
      </pre>
    );
  }

  return (
    <figure className="my-4 rounded-lg border border-border bg-card p-3">
      {spec.title ? (
        <figcaption className="mb-2 text-sm font-medium text-foreground">
          {spec.title}
        </figcaption>
      ) : null}
      <ResponsiveContainer width="100%" height={240}>
        {renderChart(spec)}
      </ResponsiveContainer>
    </figure>
  );
}

function renderChart(spec: ChartSpec) {
  const data = Array.isArray(spec.data) ? spec.data : [];
  const series = resolveSeries(spec);

  if (spec.type === "pie") {
    return (
      <PieChart>
        <Tooltip
          cursor={false}
          contentStyle={TOOLTIP_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={90}
          stroke="var(--background)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Legend verticalAlign="bottom" iconType="circle" />
      </PieChart>
    );
  }

  if (spec.type === "line") {
    return (
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={AXIS_STYLE} stroke="var(--border)" />
        <YAxis tick={AXIS_STYLE} stroke="var(--border)" />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={TOOLTIP_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        {series.length > 1 ? <Legend iconType="circle" /> : null}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  }

  if (spec.type === "area") {
    return (
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={AXIS_STYLE} stroke="var(--border)" />
        <YAxis tick={AXIS_STYLE} stroke="var(--border)" />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={TOOLTIP_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        {series.length > 1 ? <Legend iconType="circle" /> : null}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            fillOpacity={0.2}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );
  }

  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" tick={AXIS_STYLE} stroke="var(--border)" />
      <YAxis tick={AXIS_STYLE} stroke="var(--border)" />
      <Tooltip
        cursor={{ fill: "var(--muted)" }}
        contentStyle={TOOLTIP_STYLE}
        itemStyle={TOOLTIP_ITEM_STYLE}
      />
      {series.length > 1 ? <Legend iconType="circle" /> : null}
      {series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label ?? s.key}
          fill={CHART_COLORS[i % CHART_COLORS.length]}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

function resolveSeries(spec: ChartSpec): ChartSeries[] {
  if (Array.isArray(spec.series) && spec.series.length > 0) return spec.series;
  return [{ key: "value" }];
}

function parseChartSpec(code: string): ChartSpec | null {
  try {
    const parsed = JSON.parse(code);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.data)) return null;
    return parsed as ChartSpec;
  } catch {
    return null;
  }
}

type ChartSeries = { key: string; label?: string };

type ChartSpec = {
  type?: "bar" | "line" | "area" | "pie";
  title?: string;
  data: Array<Record<string, unknown>>;
  series?: ChartSeries[];
};
