import { TextWithTooltip } from "@/components/data-table/text-with-tooltip";

export function DataTableCellText({
  value,
  color,
}: {
  value: string | number;
  color?: string;
}) {
  return <TextWithTooltip text={value} style={color ? { color } : undefined} />;
}
