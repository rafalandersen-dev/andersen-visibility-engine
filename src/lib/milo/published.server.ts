// Public (publishable-key) reads of the milo_blog_published table. Drafts are not reachable this way.
import { LIST_COLUMNS, POST_COLUMNS, type PublishedRow } from "./published";

async function restGet(query: string): Promise<PublishedRow[]> {
  const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("milo_read_not_configured");
  const res = await fetch(`${url}/rest/v1/milo_blog_published?${query}`, {
    headers: { apikey: key, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`milo_read_failed_${res.status}`);
  return (await res.json()) as PublishedRow[];
}

export const listPublished = () =>
  restGet(
    new URLSearchParams({
      select: LIST_COLUMNS,
      order: "published_at.desc",
      limit: "500",
    }).toString(),
  );

export async function getPublished(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return null;
  const rows = await restGet(
    new URLSearchParams({ select: POST_COLUMNS, slug: `eq.${slug}`, limit: "1" }).toString(),
  );
  return rows[0] ?? null;
}
