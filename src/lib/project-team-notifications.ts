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
export const teamNotificationHistory = teamNotificationTarget
  .extend({
    deliveries: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            status: z.enum([
              "pending",
              "leased",
              "sending",
              "accepted",
              "unknown",
              "cancelled",
              "failed",
            ]),
            createdAt: z.string().datetime({ offset: true }),
            finishedAt: z.string().datetime({ offset: true }).nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
