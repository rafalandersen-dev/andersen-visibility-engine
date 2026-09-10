import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { awarenessInput, readWorkAwareness } from "./work-awareness.server";
export const getWorkAwarenessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => awarenessInput.parse(input))
  .handler(async ({ context, data }) => {
    try {
      return await readWorkAwareness(context.userId as string, data);
    } catch {
      throw new Error("Current work could not be checked. Please refresh.");
    }
  });
