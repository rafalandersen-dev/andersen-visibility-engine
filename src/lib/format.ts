// Deterministic, locale-independent date formatters to keep SSR and client output identical.

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function parseISO(input: string | Date): Date {
  return typeof input === "string" ? new Date(input) : input;
}

// 21 Jun 2026
export function formatDate(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Sun, 21 Jun
export function formatDateShort(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${DAYS_SHORT[d.getUTCDay()]} · ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

// 21 Jun 2026 · 14:32
export function formatDateTime(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(d)} · ${formatTime(d)}`;
}

// 14:32 — UTC (SSR-deterministic), for audit-style timestamps (created/updated/
// published-at). NOT for schedule instants — see the Local variants below.
export function formatTime(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/*
 * LOCAL variants — schedule instants only (scheduledPublishAt and the go-live
 * pickers). The user PICKS these as wall-clock local times in a datetime-local
 * input; rendering them back in UTC made the same gesture show two different
 * clocks ("schedule 09:00" → toast "07:00" in CEST). Every surface that shows a
 * schedule instant renders from client-hydrated store state (never during SSR),
 * so the file-header determinism rule doesn't apply to them — and OrphanLane /
 * StackedDeck already render these instants local via date-fns format().
 */

// 21 Jun 2026 (browser-local calendar day)
export function formatDateLocal(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// 09:00 (browser-local wall clock — matches what the user typed in the picker)
export function formatTimeLocal(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 21 Jun 2026 · 09:00 (browser-local)
export function formatDateTimeLocal(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateLocal(d)} · ${formatTimeLocal(d)}`;
}
