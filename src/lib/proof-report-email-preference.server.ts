import { emailLocaleSchema, type EmailLanguage } from "./email-languages";

interface PreferenceQuery {
  select(columns: string): PreferenceQuery;
  eq(column: string, value: string): PreferenceQuery;
  abortSignal(signal: AbortSignal): PreferenceQuery;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface ReportEmailPreferenceDb {
  from(table: string): PreferenceQuery;
}

/** Read only the authenticated caller's language. This neither reads nor changes
 * delivery consent, resolves recipients, creates an outbox item or sends mail. */
export async function readProofReportEmailLocale(
  userId: string,
  suppliedDb?: ReportEmailPreferenceDb,
): Promise<EmailLanguage> {
  if (!userId) throw new Error("Report email language could not be confirmed.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      const db =
        suppliedDb ??
        ((await import("@/integrations/supabase/client.server"))
          .supabaseAdmin as unknown as ReportEmailPreferenceDb);
      return db
        .from("operational_email_preferences")
        .select("locale")
        .eq("user_id", userId)
        .abortSignal(controller.signal)
        .maybeSingle();
    };
    const result = await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, 10000);
      }),
    ]);
    if (result.error) throw new Error("read_failed");
    // The settings page also defaults to English when no preference exists.
    if (result.data === null) return "en";
    const parsed = emailLocaleSchema.safeParse(
      typeof result.data === "object" && result.data !== null && "locale" in result.data
        ? result.data.locale
        : undefined,
    );
    if (!parsed.success) throw new Error("invalid_preference");
    return parsed.data;
  } catch {
    throw new Error(
      "Report email language could not be confirmed. Reload your saved email settings before trying again.",
    );
  } finally {
    clearTimeout(timer);
  }
}
