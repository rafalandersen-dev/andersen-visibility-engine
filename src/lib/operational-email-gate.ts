/**
 * Optional account allowlists for email delivery (21 October 2026).
 *
 * OPERATIONAL_EMAIL_ENABLED and TEAM_INVITATION_EMAIL_ENABLED are global: once
 * true, every verified account may opt in to summaries and every owner's
 * requested invitation is sent. For a controlled acceptance (or a staged
 * rollout) set the matching allowlist to a comma-separated list of account ids:
 * - OPERATIONAL_EMAIL_ALLOWED_USER_IDS: accounts that may enable summaries,
 *   have digests queued or receive one;
 * - TEAM_INVITATION_EMAIL_ALLOWED_OWNER_IDS: owners whose requested invitations
 *   the worker may send.
 * Unset or empty keeps the existing behaviour. Malformed entries match nobody,
 * so a typo narrows delivery instead of widening it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function allowedBy(variable: string, accountId: string): boolean {
  const raw = process.env[variable]?.trim();
  if (!raw) return true;
  const id = accountId.trim().toLowerCase();
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => UUID.test(entry) && entry === id);
}

export const operationalEmailAllowedFor = (userId: string) =>
  allowedBy("OPERATIONAL_EMAIL_ALLOWED_USER_IDS", userId);

export const teamInvitationEmailAllowedForOwner = (ownerId: string) =>
  allowedBy("TEAM_INVITATION_EMAIL_ALLOWED_OWNER_IDS", ownerId);
