/**
 * Client-side view of whether the OAuth connector route can be offered.
 *
 * - "enabled"  — the authenticated status call succeeded and reported `oauthEnabled: true`.
 * - "disabled" — the status call succeeded and reported `oauthEnabled: false` (flag off or unset on the deployment).
 * - "unknown"  — nothing verified: initial load, a failed status call, or a status without the boolean.
 *
 * A failed refresh always yields "unknown" so a previously verified "enabled" is never shown as still verified.
 */
export type OAuthAvailability = "unknown" | "enabled" | "disabled";

export function oauthAvailabilityFromStatus(
  status: { oauthEnabled?: unknown } | null | undefined,
): OAuthAvailability {
  if (!status || typeof status.oauthEnabled !== "boolean") return "unknown";
  return status.oauthEnabled ? "enabled" : "disabled";
}
