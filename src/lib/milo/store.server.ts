// Server-only storage adapter (service role), loaded only after auth and a valid payload.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftRow, MiloStore } from "./receiver";

const DRAFT_COLUMNS = "id,slug,title,meta_title,meta_description,sections,published_slug";

export async function createMiloStore(): Promise<MiloStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  // Rethrown as a plain object so callers can read the Postgres error code.
  const check = (error: { message: string; code?: string } | null) => {
    if (error) throw { message: error.message, code: error.code };
  };
  return {
    async getDraft(projectId, assetId) {
      const { data, error } = await db
        .from("milo_blog_drafts")
        .select(DRAFT_COLUMNS)
        .eq("project_id", projectId)
        .eq("asset_id", assetId)
        .maybeSingle();
      check(error);
      return (data as DraftRow | null) ?? null;
    },
    async upsertDraft(row) {
      const { data, error } = await db
        .from("milo_blog_drafts")
        .upsert(
          { ...row, received_at: new Date().toISOString() },
          { onConflict: "project_id,asset_id" },
        )
        .select("id")
        .single();
      check(error);
      return { id: String(data?.id) };
    },
    async publish(draft) {
      // published_at is left out so it keeps the first publish time on re-publish.
      const { error } = await db.from("milo_blog_published").upsert(
        {
          draft_id: draft.id,
          slug: draft.slug,
          title: draft.title,
          meta_title: draft.meta_title,
          meta_description: draft.meta_description,
          sections: draft.sections,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "draft_id" },
      );
      check(error);
      const locked = await db
        .from("milo_blog_drafts")
        .update({ published_slug: draft.slug })
        .eq("id", draft.id);
      check(locked.error);
    },
  };
}
