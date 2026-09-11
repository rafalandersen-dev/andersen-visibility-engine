import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  invitationDeliveryTarget,
  invitationDeliveryRequest,
} from "./project-team-invitation-delivery";
export const requestTeamInvitationDeliveryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => invitationDeliveryRequest.parse(v))
  .handler(async ({ context, data }) => {
    const { requestTeamInvitationDelivery } =
      await import("./project-team-invitation-delivery.server");
    return requestTeamInvitationDelivery(context.userId, data);
  });
export const readTeamInvitationDeliveryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => invitationDeliveryTarget.parse(v))
  .handler(async ({ context, data }) => {
    const { readTeamInvitationDelivery } =
      await import("./project-team-invitation-delivery.server");
    return readTeamInvitationDelivery(context.userId, data);
  });
