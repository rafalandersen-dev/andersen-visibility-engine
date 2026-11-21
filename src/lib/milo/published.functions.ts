import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toPostView } from "./published";
import { getPublished, listPublished } from "./published.server";

/** Published Milo articles. A failed read degrades to an empty list, never to an error page. */
export const getMiloBlogListing = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return (await listPublished()).map((row) => {
      const { title, slug, description, publishedAt } = toPostView(row);
      return { slug, title, description, date: publishedAt };
    });
  } catch (err) {
    console.error("[milo] listing read failed", err instanceof Error ? err.message : "unknown");
    return [];
  }
});

export const getMiloBlogPost = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const row = await getPublished(data.slug);
    return row ? toPostView(row) : null;
  });
