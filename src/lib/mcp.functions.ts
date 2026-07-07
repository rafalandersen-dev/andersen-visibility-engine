/**
 * Claude Connector (MCP) v1 — auth-gated server functions for the token UI.
 * The server-only mcp module is lazy-imported per handler so its service-role
 * code never enters the client bundle. Plaintext tokens are returned ONCE (on
 * create) and never again.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface McpTokenMeta {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export const getMcpStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ endpoint: string; toolNames: string[]; tokens: McpTokenMeta[] }> => {
    const { listTokens, mcpToolNames } = await import("./mcp.server");
    const tokens = await listTokens(context.userId);
    return { endpoint: "https://milogrowth.com/api/mcp", toolNames: mcpToolNames(), tokens };
  });

export const createMcpTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ label: z.string().max(80).optional() }).parse(input))
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    const { createToken } = await import("./mcp.server");
    const { token } = await createToken(context.userId, (data.label ?? "").trim());
    return { token };
  });

export const revokeMcpTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const { revokeToken } = await import("./mcp.server");
    await revokeToken(context.userId, data.id);
    return { success: true };
  });
