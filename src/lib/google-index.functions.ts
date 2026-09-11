import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const project = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
export const requestGoogleIndexFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project
      .extend({ requestId: z.string().uuid(), url: z.string().max(8192) })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { requestGoogleIndex } = await import("./google-index.server");
    return requestGoogleIndex(context.userId, data);
  });
export const listGoogleIndexFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ context, data }) => {
    const { listGoogleIndex } = await import("./google-index.server");
    return listGoogleIndex(context.userId, data);
  });
