// Audit dates stay UTC; schedule dates use the browser-local calendar and clock.
// The optional interface locale changes displayed calendar text only. Existing
// callers keep their original English representation until explicitly migrated.

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseISO(input: string | Date): Date {
  return typeof input === "string" ? new Date(input) : input;
}

function localizedDate(d: Date, locale: string, local: boolean, short = false): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    ...(short ? { weekday: "short" as const } : { year: "numeric" as const }),
    ...(local ? {} : { timeZone: "UTC" }),
  }).format(d);
}

// 21 Jun 2026
export function formatDate(input: string | Date, locale = "en"): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  if (locale !== "en") return localizedDate(d, locale, false);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Sun, 21 Jun
export function formatDateShort(input: string | Date, locale = "en"): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  if (locale !== "en") return localizedDate(d, locale, false, true);
  return `${DAYS_SHORT[d.getUTCDay()]} · ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

// 21 Jun 2026 · 14:32
export function formatDateTime(input: string | Date, locale = "en"): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(d, locale)} · ${formatTime(d)}`;
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
export function formatDateLocal(input: string | Date, locale = "en"): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  if (locale !== "en") return localizedDate(d, locale, true);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// 09:00 (browser-local wall clock — matches what the user typed in the picker)
export function formatTimeLocal(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 21 Jun 2026 · 09:00 (browser-local)
export function formatDateTimeLocal(input: string | Date, locale = "en"): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateLocal(d, locale)} · ${formatTimeLocal(d)}`;
}

// HTML datetime-local values must use local components, not an ISO UTC slice.
export function formatDateTimeLocalInput(input: string | Date): string {
  const d = parseISO(input);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${formatTimeLocal(d)}`;
}
