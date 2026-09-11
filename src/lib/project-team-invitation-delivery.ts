import { z } from "zod";
import { teamRole } from "./project-team";
export const invitationDeliveryTarget = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), inviteId: z.string().uuid() })
  .strict();
export const invitationDeliveryRequest = invitationDeliveryTarget
  .extend({ email: z.string().email().max(254), role: teamRole })
  .strict();
export const invitationDeliveryStatus = invitationDeliveryTarget
  .extend({
    ownerId: z.string().uuid(),
    delivery: z
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
      .strict()
      .nullable(),
  })
  .strict();
