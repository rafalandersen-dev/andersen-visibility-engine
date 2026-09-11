import { z } from "zod";
import { teamProjectTarget } from "./project-team-view";
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const teamNotificationTarget = teamProjectTarget
  .extend({ recipientId: z.string().uuid() })
  .strict();
export const teamNotificationSettings = teamNotificationTarget
  .extend({
    revision,
    membershipRevision: revision.min(1),
    assigned: z.boolean(),
    optedIn: z.boolean(),
  })
  .strict();
export const teamNotificationChange = teamNotificationTarget
  .extend({
    action: z.enum(["assign", "opt_in"]),
    enabled: z.boolean(),
    expectedRevision: revision,
    expectedMembershipRevision: revision.min(1),
  })
  .strict();
