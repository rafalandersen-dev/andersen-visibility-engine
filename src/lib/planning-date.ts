/**
 * Plan targets are calendar dates; timestamps keep their existing local display.
 * Parse a date-only target at local noon so it cannot slip into the previous day
 * in time zones west of UTC. This is presentation only, never a scheduling value.
 */
export function formatPlanningDate(
  value: string | Date,
  locale: string,
  includeYear = true,
): string {
  const date =
    typeof value === "string" ? new Date(value.length <= 10 ? `${value}T12:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(date);
}
