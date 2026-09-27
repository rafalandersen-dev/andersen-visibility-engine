/**
 * Stored-instant ↔ `datetime-local` round trip with ONE explicit convention for every owner-declared instant
 * (source capture time, fact validity): the control shows the instant as UTC wall-clock
 * (`YYYY-MM-DDTHH:MM:SS`, `step=1`, captioned "UTC") and an edit produces a `…Z` instant. The draft keeps the
 * STORED string untouched until the owner really edits, so a `+02:00` offset or fractional seconds (which the
 * control cannot display) survive review and resave byte-for-byte — the instant is never silently
 * reinterpreted or truncated. Pure, network-free.
 */
export function instantToUtcInput(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString().slice(0, 19);
}
/** The draft value after a control change: the ORIGINAL stored string when the visible UTC wall-clock did not
 * change (no silent rewrite of offset/precision), else the edited wall-clock as a `Z` instant. */
export function instantFromUtcInput(input: string, original: string): string {
  if (input === instantToUtcInput(original)) return original;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return `${input}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input)) return `${input}Z`;
  return input;
}
/** True when the stored string carries something the UTC control cannot show (a non-Z offset or fractional
 * seconds), so the owner should see the exact stored form next to the control. */
export function instantDisplayDiffers(iso: string): boolean {
  const t = iso.trim();
  if (!t || Number.isNaN(Date.parse(t))) return false;
  return t !== `${instantToUtcInput(t)}Z` && t !== `${instantToUtcInput(t)}.000Z`;
}
/** Read-only label of a stored instant with its convention spelled out: `YYYY-MM-DD HH:MM UTC` (the exact
 * stored string stays available to the owner through the edit control / detail views). */
export function utcLabel(iso: string): string {
  const input = instantToUtcInput(iso);
  return input ? `${input.slice(0, 16).replace("T", " ")} UTC` : iso;
}
