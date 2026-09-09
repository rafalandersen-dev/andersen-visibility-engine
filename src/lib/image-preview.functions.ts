import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { readArticleImagePreview } from "./image-preview.server";
export const getArticleImagePreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ path: z.string().min(1).max(280) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => ({
    previewUrl: await readArticleImagePreview(context.userId as string, data.path),
  }));
