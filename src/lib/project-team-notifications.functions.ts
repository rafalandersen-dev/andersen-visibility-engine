import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { teamNotificationTarget, teamNotificationChange } from "./project-team-notifications";
export const readTeamNotificationSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamNotificationTarget.parse(v))
  .handler(async ({ context, data }) => {
    const { readTeamNotificationSettings } = await import("./project-team-notifications.server");
    const { admittedReadRpc } = await import("./project-team-read-admission.server");
    return readTeamNotificationSettings(context.userId, data, admittedReadRpc(context.userId));
  });
export const changeTeamNotificationSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamNotificationChange.parse(v))
  .handler(async ({ context, data }) => {
    const { changeTeamNotificationSettings } = await import("./project-team-notifications.server");
    return changeTeamNotificationSettings(context.userId, data);
  });
export const readTeamNotificationHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamNotificationTarget.parse(v))
  .handler(async ({ context, data }) => {
    const { readTeamNotificationHistory } = await import("./project-team-notifications.server");
    const { admittedReadRpc } = await import("./project-team-read-admission.server");
    return readTeamNotificationHistory(context.userId, data, admittedReadRpc(context.userId));
  });
