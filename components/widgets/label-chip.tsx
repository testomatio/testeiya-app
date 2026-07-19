"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const MAX_CHARS = 25;

/**
 * A Testomat.io label rendered as a chip in its configured color — same color
 * math as the product's CustomFieldsLabel component: light theme tints the
 * background with the raw color and darkens the text; dark theme inverts that.
 * Long `title` / `title: value` text truncates at 25 chars with a tooltip
 * carrying the full text.
 */
export function LabelChip({
  title,
  value,
  color,
  short,
  onClick,
  className,
  dark: darkOverride,
}: {
  title: string;
  value?: string;
  color?: string;
  /** Label configured as "short": render only the value; title goes to the tooltip. */
  short?: boolean;
  onClick?: () => void;
  className?: string;
  /** Force a theme (Storybook/host-less contexts); defaults to useTheme(). */
  dark?: boolean;
}) {
  const dark = useIsDark(darkOverride);

  const style: React.CSSProperties = {};
  if (color) {
    if (dark) {
      style.background = adjustColor(color, -100);
      style.color = color;
    } else {
      style.background = hexToRgba(color);
      style.color = adjustColor(color, -100);
    }
  }

  const isShort = !!short && !!value;
  const full = value ? `${title}: ${value}` : title;
  let text = truncatedLabelText(title, value);
  if (isShort) text = truncatedLabelText(value!);
  const truncated = text !== full;

  const chipClass = cn(
    "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium",
    !color && "border bg-muted/20",
    onClick && "cursor-pointer transition-opacity hover:opacity-80",
    className
  );

  let chip: React.ReactElement;
  if (onClick) {
    chip = (
      <button type="button" onClick={onClick} style={style} className={chipClass}>
        {text}
      </button>
    );
  } else {
    chip = (
      <span style={style} className={chipClass}>
        {text}
      </span>
    );
  }

  // Short chips hide the title, so the tooltip always carries the full text.
  if (!truncated && !isShort) return chip;
  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent>
        <p>{full}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function useIsDark(override?: boolean): boolean {
  let theme: string | null = null;
  // Outside a ThemeProvider (Storybook) the hook throws; fall back to the
  // override / light. useContext still runs, so hook order is stable.
  try {
    theme = useTheme().theme;
  } catch {
    theme = null;
  }
  if (override !== undefined) return override;
  return theme === "dark";
}

/** Truncate `title` / `title: value` to MAX_CHARS, ported from the product. */
function truncatedLabelText(title: string, value?: string): string {
  if (!value) {
    if (title.length <= MAX_CHARS) return title;
    return `${title.slice(0, MAX_CHARS)}…`;
  }

  const separator = ": ";
  const sepLen = separator.length;
  const minTitleLen = 1;

  const totalLen = title.length + sepLen + value.length;
  if (totalLen <= MAX_CHARS) return `${title}${separator}${value}`;

  const maxTitleLen = Math.max(minTitleLen, MAX_CHARS - sepLen - value.length);
  let cutTitle = title.slice(0, Math.min(maxTitleLen, title.length));
  const wasTitleTruncated = cutTitle.length < title.length;
  if (wasTitleTruncated) cutTitle += "…";

  const remaining = MAX_CHARS - cutTitle.length - sepLen + (wasTitleTruncated ? 1 : 0);
  let cutValue = value;
  if (cutTitle.length <= 2) cutValue = value.slice(0, remaining);
  if (cutValue.length < value.length) cutValue += "…";

  return `${cutTitle}${separator}${cutValue}`;
}

/**
 * Darken/lighten a hex color, flipping direction for already-dark colors —
 * ported verbatim from the product so chip colors match it exactly.
 */
export function adjustColor(col: string | undefined, amt: number): string {
  if (!col) return "#999";

  let usePound = false;
  if (col[0] === "#") {
    col = col.slice(1);
    usePound = true;
  }

  const num = parseInt(col, 16);
  // too dark
  if (num < 4390867) amt = -amt;

  let r = (num >> 16) + amt;
  if (r > 255) r = 255;
  else if (r < 0) r = 0;

  let b = ((num >> 8) & 0x00ff) + amt;
  if (b > 255) b = 255;
  else if (b < 0) b = 0;

  let g = (num & 0x0000ff) + amt;
  if (g > 255) g = 255;
  else if (g < 0) g = 0;

  let prefix = "";
  if (usePound) prefix = "#";
  return prefix + (g | (b << 8) | (r << 16)).toString(16);
}

function hexToRgba(hex: string, alpha = 1): string {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
