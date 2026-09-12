import { emailLocaleSchema } from "./email-languages";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { operationalEmailEnabled, readOperationalEmailAddress } from "./operational-email.server";
const preference = z.object({ enabled: z.boolean(), locale: emailLocaleSchema }).strict();
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

/** Language-only persistence does not resolve a recipient, enable delivery,
 * create tokens, enqueue a message or touch an existing outbox. */
export const setOperationalEmailLanguageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ locale: emailLocaleSchema }).strict().parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as {
      rpc(
        name: string,
        args: Record<string, unknown>,
      ): PromiseLike<{ data: unknown; error: unknown }>;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        db.rpc("set_operational_email_language", { p_locale: data.locale }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), 10000);
        }),
      ]);
      if (!result || result.error || result.data !== true) throw new Error("unconfirmed");
      return { saved: true };
    } catch {
      // A lost response may still have saved the language. Never retry here.
      throw new Error(
        "Email language could not be confirmed. Reload the saved settings before another change.",
      );
    } finally {
      clearTimeout(timer);
    }
  });
