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
  return `${formatDate(d)} · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
