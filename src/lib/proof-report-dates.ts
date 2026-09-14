/** Date-only planning values keep their calendar day. Timestamp evidence uses
 * UTC, matching the report's UTC month selector and audit-style date formatting.
 * Reject invalid days and timestamps without an explicit timezone rather than
 * allowing Date.parse to normalize them or depend on the server's timezone.
 */
export function reportDayKey(value: string | undefined): string {
  if (!value) return "";
  const date = /^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))/.exec(value)?.[1];
  if (!date) return "";
  const day = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return "";
  if (value === date) return date;
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    return "";
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString().slice(0, 10) : "";
}
