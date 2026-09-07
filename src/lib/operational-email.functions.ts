import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { operationalEmailEnabled, readOperationalEmailAddress } from "./operational-email.server";
const preference = z
  .object({ enabled: z.boolean(), locale: z.enum(["en", "pl", "sv", "da"]) })
  .strict();
const history = z
  .array(
    z.object({
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
      created_at: z.string(),
      finished_at: z.string().nullable(),
    }),
  )
  .max(20);
export const getOperationalEmailSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    interface Query extends PromiseLike<{ data: unknown; error: unknown }> {
      select(columns: string): Query;
      eq(column: string, value: unknown): Query;
      maybeSingle(): Query;
      order(column: string, options: { ascending: boolean }): Query;
      limit(n: number): Query;
    }
    const db = supabaseAdmin as unknown as { from(table: string): Query };
    const [prefs, sent, address] = await Promise.all([
      db
        .from("operational_email_preferences")
        .select("enabled,locale")
        .eq("user_id", context.userId)
        .maybeSingle(),
      db
        .from("operational_email_outbox")
        .select("id,status,created_at,finished_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      readOperationalEmailAddress(context.userId as string),
    ]);
    if (prefs.error || sent.error) throw new Error("Email settings are temporarily unavailable.");
    return {
      ready: operationalEmailEnabled(),
      addressVerification: address.status,
      preference: preference.parse(prefs.data ?? { enabled: false, locale: "en" }),
      history: history.parse(sent.data),
    };
  });
export const setOperationalEmailSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => preference.parse(input))
  .handler(async ({ context, data }) => {
    if (data.enabled && !operationalEmailEnabled())
      throw new Error("Operational email is not activated yet.");
    if (
      data.enabled &&
      (await readOperationalEmailAddress(context.userId as string)).status !== "verified"
    )
      throw new Error("Confirm your current account email before enabling summaries.");
    const db = context.supabase as unknown as {
      rpc(
        name: string,
        args: Record<string, unknown>,
      ): PromiseLike<{ data: unknown; error: unknown }>;
    };
    const saved = await db.rpc("set_operational_email_preference", {
      p_enabled: data.enabled,
      p_locale: data.locale,
    });
    if (saved.error || saved.data !== true) throw new Error("Email settings could not be saved.");
    return { saved: true };
  });
