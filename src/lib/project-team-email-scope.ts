import { z } from "zod";

const schema = z
  .object({
    owner_id: z.string().uuid(),
    project_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    recipient_id: z.string().uuid(),
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type TeamEmailScope = z.infer<typeof schema>;

/** Controlled rollout is fail-closed: enabling transport alone sends nothing.
 * One exact owner/project/recipient tuple, expiring within 24 hours, is required. */
export function teamEmailScopeActive(scope: TeamEmailScope, now = Date.now()) {
  const end = Date.parse(scope.expires_at);
  return end > now && end <= now + 86_400_000;
}
export function teamNotificationEmailScope(): TeamEmailScope | null {
  try {
    const scope = schema.parse(JSON.parse(process.env.TEAM_NOTIFICATION_EMAIL_SCOPE ?? ""));
    return teamEmailScopeActive(scope) ? scope : null;
  } catch {
    return null;
  }
}
export function teamEmailScopeMatches(
  scope: TeamEmailScope,
  target: {
    owner_id: string;
    project_id: string;
    recipient_id: string;
  },
) {
  return (
    scope.owner_id === target.owner_id &&
    scope.project_id === target.project_id &&
    scope.recipient_id === target.recipient_id
  );
}
export function teamEmailScopeArgs(scope: TeamEmailScope) {
  return {
    p_owner: scope.owner_id,
    p_project: scope.project_id,
    p_recipient: scope.recipient_id,
    p_until: scope.expires_at,
  };
}
