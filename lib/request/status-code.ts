export function getStatusColor(value: number) {
  if (value >= 200 && value < 300) return STATUS_COLORS.success;
  if (value >= 300 && value < 400) return STATUS_COLORS.info;
  if (value >= 400 && value < 500) return STATUS_COLORS.warning;
  if (value >= 500) return STATUS_COLORS.error;
  return STATUS_COLORS.default;
}

const STATUS_COLORS = {
  success: { text: "text-green-600", bg: "bg-green-500", border: "border-green-500" },
  info: { text: "text-sky-600", bg: "bg-sky-500", border: "border-sky-500" },
  warning: { text: "text-amber-600", bg: "bg-amber-500", border: "border-amber-500" },
  error: { text: "text-destructive", bg: "bg-destructive", border: "border-destructive" },
  default: { text: "text-muted-foreground", bg: "bg-muted", border: "border-border" },
};
