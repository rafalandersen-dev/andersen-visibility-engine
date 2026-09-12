import { backlinkMonitorSettings } from "./backlink-recurring";

/** Exact decimal USD entry; no binary rounding, exponent or grouping syntax. */
export function backlinkMonitorCap(raw: string) {
  const match = /^(0|[1-9]\d{0,2})(?:[.,](\d{1,6}))?$/.exec(raw.trim());
  if (!match) throw Error("backlink_monitor_cap");
  const value = Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(6, "0"));
  if (value > 100_000_000) throw Error("backlink_monitor_cap");
  return value;
}
export function backlinkMonitorForm(raw: {
  enabled: boolean;
  cadence: "daily" | "weekly";
  lookbackDays: string;
  includeSubdomains: boolean;
  cap: string;
}) {
  if (!/^[1-9]\d?$/.test(raw.lookbackDays)) throw Error("backlink_monitor_days");
  return backlinkMonitorSettings.parse({
    enabled: raw.enabled,
    cadence: raw.cadence,
    lookbackDays: Number(raw.lookbackDays),
    includeSubdomains: raw.includeSubdomains,
    monthlyCapMicrousd: backlinkMonitorCap(raw.cap),
  });
}
