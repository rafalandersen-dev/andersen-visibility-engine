import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const project = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
export const readCrawlOwnershipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ context, data }) => {
    const { readCrawlOwnership } = await import("./technical-ownership-lifecycle.server");
    return readCrawlOwnership(context.userId, data);
  });
export const issueCrawlOwnershipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ context, data }) => {
    const { issueCrawlOwnership } = await import("./technical-ownership-lifecycle.server");
    return issueCrawlOwnership(context.userId, data);
  });
export const verifyCrawlOwnershipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ context, data }) => {
    const { verifyCrawlOwnership } = await import("./technical-ownership-lifecycle.server");
    return verifyCrawlOwnership(context.userId, data);
  });
export const revokeCrawlOwnershipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ context, data }) => {
    const { revokeCrawlOwnership } = await import("./technical-ownership-lifecycle.server");
    return revokeCrawlOwnership(context.userId, data);
  });
