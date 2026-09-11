import { monitoringScope, type BacklinkMonitoringScope } from "./backlink-monitoring";
/** Published standard prices checked 2026-09-11. This calculation does not
 * provision a budget or authorize dispatch. Revalidate pricing before activation. */
export function backlinkMonitoringExpense(scope: BacklinkMonitoringScope, now = new Date()) {
  const checked = monitoringScope(scope, now);
  const maximumRows = (Date.parse(checked.dateTo) - Date.parse(checked.dateFrom)) / 86400000 + 1;
  return {
    provider: "dataforseo",
    operation: "backlink_monitoring",
    pricingVersion: "dataforseo-backlinks-2026-07-01",
    sourceUrl: "https://dataforseo.com/pricing/backlinks/backlinks",
    verifiedOn: "2026-09-11",
    maximumRows,
    ceilingMicrousd: 24000 + 36 * maximumRows,
  } as const;
}
