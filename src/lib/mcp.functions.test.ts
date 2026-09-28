import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  listTokens: vi.fn(),
  isOAuthEnabled: vi.fn(),
  serverImports: 0,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const b = {
      middleware: (items: unknown[]) => {
        h.registered.push(items);
        return b;
      },
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: (a: unknown) => unknown) => (a: { data: unknown; context: unknown }) =>
        fn({ ...a, data: parse(a.data) }),
    };
    return b;
  },
}));
vi.mock("./mcp.server", () => ({
  listTokens: h.listTokens,
  mcpToolNames: () => ["list_projects", "get_project_brief"],
}));
vi.mock("./oauth.server", () => {
  h.serverImports += 1;
  return { isOAuthEnabled: h.isOAuthEnabled };
});
import { getMcpStatusFn } from "./mcp.functions";
const status = () =>
  (getMcpStatusFn as unknown as (a: unknown) => Promise<Record<string, unknown>>)({
    data: undefined,
    context: { userId: "owner-1" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  h.listTokens.mockResolvedValue([
    { id: "t1", label: "laptop", createdAt: "2026-09-01", lastUsedAt: null },
  ]);
});
describe("getMcpStatusFn OAuth availability (AD)", () => {
  it("keeps the auth middleware and the server-only boundary (oauth.server loaded lazily, not at import)", () => {
    expect(h.registered.some((items) => items.includes(h.auth))).toBe(true);
    // The mocked module factory has not run: importing mcp.functions must not pull oauth.server in.
    expect(h.serverImports).toBe(0);
  });
  it.each([
    [true, true],
    [false, false],
  ])(
    "reports the deployment flag %s as oauthEnabled=%s for the authenticated user",
    async (flag, expected) => {
      h.isOAuthEnabled.mockReturnValue(flag);
      const res = await status();
      expect(res.oauthEnabled).toBe(expected);
      expect(h.listTokens).toHaveBeenCalledExactlyOnceWith("owner-1");
      expect(h.serverImports).toBeGreaterThan(0);
    },
  );
  it("exposes only the documented fields — no environment values or scope lists", async () => {
    h.isOAuthEnabled.mockReturnValue(false);
    const res = await status();
    expect(Object.keys(res).sort()).toEqual(["endpoint", "oauthEnabled", "tokens", "toolNames"]);
    expect(JSON.stringify(res)).not.toMatch(/MCP_OAUTH_ENABLED|process|env/);
  });
});
