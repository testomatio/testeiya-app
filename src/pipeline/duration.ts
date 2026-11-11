const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };

/** A stage's timeout: "30m", "90s", "1h", or a bare number of seconds. */
export class Duration {
  /** In milliseconds, or null when it is not a duration. */
  static ms(value: unknown): number | null {
    if (typeof value === "number" && value > 0) return value * 1000;
    if (typeof value !== "string") return null;
    const unit = value.slice(-1);
    const scale = UNITS[unit];
    let amount = Number(value);
    if (scale) amount = Number(value.slice(0, -1));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return amount * (scale ?? 1000);
  }
}
