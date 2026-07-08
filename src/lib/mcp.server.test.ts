/**
 * Regression tests for MCP scope enforcement + the deterministic audit /
 * last_used_at persistence added in Phase 0 (task_3a036b52).
 *
 * The Supabase admin client is mocked at the module boundary, so these tests
 * prove (a) the last_used_at touch is AWAITED (a delayed write is settled by
 * the time the resolver returns) and (b) a failing touch never fails auth.
 */
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({
  from: undefined as unknown as (table: string) => unknown,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => h.from(table) },
}));

import {
  MCP_TOKEN_PREFIX,
  TOOL_SCOPES,
  toolAllowed,
  mcpToolNames,
  handleMcpMessage,
  buildMcpAuditEvent,
  resolveUser,
} from "./mcp.server";
import { resolveAccessToken, revokeAccessTokenByHash, MCP_RESOURCE_URL } from "./oauth.server";

// ---- supabase chain fakes -------------------------------------------------

function selectChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.is = () => chain;
  chain.maybeSingle = async () => ({ data, error: null });
  return chain;
}

interface TouchState {
  updateCalled: boolean;
  updatedWith: Record<string, unknown> | null;
  settled: boolean;
}

/** A thenable update chain that settles on a timer — if the caller does not
 * await it, `settled` is still false when the resolver returns. */
function updateChain(state: TouchState, opts: { reject?: boolean; delayMs?: number } = {}) {
  const p = new Promise<{ error: null }>((resolve, reject) => {
    setTimeout(() => {
      state.settled = true;
      if (opts.reject) reject(new Error("db_down"));
      else resolve({ error: null });
    }, opts.delayMs ?? 10);
  });
  p.catch(() => {}); // keep node quiet if a branch is never awaited
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.is = () => chain;
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

function tableFake(expectTable: string, rows: { select: unknown }, state: TouchState, opts: { reject?: boolean } = {}) {
  return (table: string) => {
    expect(table).toBe(expectTable);
    return {
      select: () => selectChain(rows.select),
      update: (r: Record<string, unknown>) => {
        state.updateCalled = true;
        state.updatedWith = r;
        return updateChain(state, opts);
      },
    };
  };
}

const freshTouch = (): TouchState => ({ updateCalled: false, updatedWith: null, settled: false });

// ---- scope map regression ---------------------------------------------------

describe("TOOL_SCOPES / toolAllowed", () => {
  it("maps all 8 read tools to the 4 read scopes exactly", () => {
    expect(TOOL_SCOPES).toEqual({
      list_projects: "milo.projects.read",
      get_project_brief: "milo.projects.read",
      list_opportunities: "milo.content.read",
      list_content: "milo.content.read",
      get_content: "milo.content.read",
      get_latest_audit: "milo.insights.read",
      get_gsc_summary: "milo.insights.read",
      list_authority_opportunities: "milo.authority.read",
    });
    expect(mcpToolNames().sort()).toEqual(Object.keys(TOOL_SCOPES).sort());
  });
  it("null scopes = legacy developer token = every tool", () => {
    for (const name of mcpToolNames()) expect(toolAllowed(name, null)).toBe(true);
  });
  it("scoped grants only reach their tools; unknown tools are never allowed", () => {
    expect(toolAllowed("list_projects", ["milo.projects.read"])).toBe(true);
    expect(toolAllowed("list_content", ["milo.projects.read"])).toBe(false);
    expect(toolAllowed("does_not_exist", ["milo.projects.read"])).toBe(false);
    expect(toolAllowed("list_projects", [])).toBe(false);
  });
});

// ---- JSON-RPC dispatch ------------------------------------------------------

describe("handleMcpMessage", () => {
  const grantAll = { userId: "user1", scopes: null };
  const grantProjects = { userId: "user1", scopes: ["milo.projects.read"] };

  it("initialize / ping / notifications behave as before", async () => {
    const init = (await handleMcpMessage(grantAll, { id: 1, method: "initialize" })) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("milo-growth");
    const ping = (await handleMcpMessage(grantAll, { id: 2, method: "ping" })) as { result: unknown };
    expect(ping.result).toEqual({});
    expect(await handleMcpMessage(grantAll, { method: "notifications/initialized" })).toBeNull();
    const unknown = (await handleMcpMessage(grantAll, { id: 3, method: "nope" })) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
  });

  it("tools/list is filtered to the grant's scopes", async () => {
    const all = (await handleMcpMessage(grantAll, { id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    expect(all.result.tools).toHaveLength(8);
    const scoped = (await handleMcpMessage(grantProjects, { id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    expect(scoped.result.tools.map((t) => t.name).sort()).toEqual(["get_project_brief", "list_projects"]);
    const none = (await handleMcpMessage({ userId: "user1", scopes: [] }, { id: 1, method: "tools/list" })) as { result: { tools: unknown[] } };
    expect(none.result.tools).toHaveLength(0);
  });

  it("tools/call without the required scope → JSON-RPC -32002, generic message, no DB touch", async () => {
    h.from = () => {
      throw new Error("workspace must not be loaded on denial");
    };
    const denied = (await handleMcpMessage(grantProjects, { id: 4, method: "tools/call", params: { name: "list_content", arguments: {} } })) as {
      error: { code: number; message: string };
    };
    expect(denied.error.code).toBe(-32002);
    expect(denied.error.message).toBe("Insufficient scope for this tool.");
  });

  it("tools/call on an unknown tool → -32602", async () => {
    const r = (await handleMcpMessage(grantAll, { id: 5, method: "tools/call", params: { name: "nope" } })) as { error: { code: number } };
    expect(r.error.code).toBe(-32602);
  });

  it("an allowed tools/call loads the workspace and returns tool output", async () => {
    h.from = (table: string) => {
      expect(table).toBe("workspaces");
      return { select: () => selectChain({ data: { projects: [{ id: "p1", name: "P1", businessName: "Biz", websiteUrl: "https://x.se", market: "SE", primaryLanguage: "Swedish" }] } }) };
    };
    const r = (await handleMcpMessage(grantProjects, { id: 6, method: "tools/call", params: { name: "list_projects", arguments: {} } })) as {
      result: { content: { type: string; text: string }[]; isError?: boolean };
    };
    expect(r.result.isError).toBeUndefined();
    const projects = JSON.parse(r.result.content[0].text) as { id: string; businessName: string }[];
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe("p1");
  });
});

// ---- audit event builder ----------------------------------------------------

describe("buildMcpAuditEvent", () => {
  it("logs mcp_call with method/tool/ok for a successful tools/call", () => {
    const msg = { id: 1, method: "tools/call", params: { name: "list_projects", arguments: { secretArg: "must-not-appear" } } };
    const ev = buildMcpAuditEvent(msg, { jsonrpc: "2.0", id: 1, result: { content: [] } });
    expect(ev).toEqual({ event: "mcp_call", detail: { method: "tools/call", tool: "list_projects", ok: true } });
    expect(JSON.stringify(ev)).not.toContain("must-not-appear");
  });

  it("logs mcp_denied with tool + requiredScope for an insufficient-scope rejection", async () => {
    const msg = { id: 4, method: "tools/call", params: { name: "list_content" } };
    const denial = await handleMcpMessage({ userId: "u", scopes: ["milo.projects.read"] }, msg);
    const ev = buildMcpAuditEvent(msg, denial);
    expect(ev).toEqual({ event: "mcp_denied", detail: { tool: "list_content", requiredScope: "milo.content.read" } });
  });

  it("logs plain method calls (tools/list, initialize) as mcp_call without a tool key", () => {
    const ev = buildMcpAuditEvent({ id: 1, method: "tools/list" }, { jsonrpc: "2.0", id: 1, result: { tools: [] } });
    expect(ev).toEqual({ event: "mcp_call", detail: { method: "tools/list", ok: true } });
  });

  it("marks JSON-RPC errors and isError tool results as ok:false", () => {
    const err = buildMcpAuditEvent({ id: 1, method: "nope" }, { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "x" } });
    expect(err.detail.ok).toBe(false);
    expect(err.event).toBe("mcp_call");
    const toolFail = buildMcpAuditEvent(
      { id: 1, method: "tools/call", params: { name: "list_projects" } },
      { jsonrpc: "2.0", id: 1, result: { content: [], isError: true } },
    );
    expect(toolFail.detail).toEqual({ method: "tools/call", tool: "list_projects", ok: false });
  });

  it("treats notifications (null response) as ok mcp_call and tolerates malformed input", () => {
    expect(buildMcpAuditEvent({ method: "notifications/initialized" }, null)).toEqual({
      event: "mcp_call",
      detail: { method: "notifications/initialized", ok: true },
    });
    expect(buildMcpAuditEvent(null, null)).toEqual({ event: "mcp_call", detail: { method: "unknown", ok: true } });
  });

  it("a -32002 without a tool name stays mcp_call (denied events always carry the tool)", () => {
    const ev = buildMcpAuditEvent({ id: 1, method: "tools/call", params: {} }, { jsonrpc: "2.0", id: 1, error: { code: -32002, message: "x" } });
    expect(ev.event).toBe("mcp_call");
    expect(ev.detail.ok).toBe(false);
  });
});

// ---- deterministic last_used_at touches --------------------------------------

describe("resolveUser (legacy developer token) last_used_at", () => {
  const row = { id: "row1", user_id: "user1", token_hash: "h", label: null, created_at: "", last_used_at: null, revoked_at: null };

  it("AWAITS the touch: a delayed update is settled before the resolver returns", async () => {
    const state = freshTouch();
    h.from = tableFake("mcp_connections", { select: row }, state);
    const uid = await resolveUser(`${MCP_TOKEN_PREFIX}sometoken`);
    expect(uid).toBe("user1");
    expect(state.updateCalled).toBe(true);
    expect(state.updatedWith).toHaveProperty("last_used_at");
    expect(state.settled).toBe(true); // fire-and-forget would still be false here
  });

  it("a failing touch never fails auth", async () => {
    const state = freshTouch();
    h.from = tableFake("mcp_connections", { select: row }, state, { reject: true });
    expect(await resolveUser(`${MCP_TOKEN_PREFIX}sometoken`)).toBe("user1");
    expect(state.settled).toBe(true);
  });

  it("unknown token → null, no touch; wrong prefix → null, no DB at all", async () => {
    const state = freshTouch();
    h.from = tableFake("mcp_connections", { select: null }, state);
    expect(await resolveUser(`${MCP_TOKEN_PREFIX}unknown`)).toBeNull();
    expect(state.updateCalled).toBe(false);
    h.from = () => {
      throw new Error("no DB for bad prefix");
    };
    expect(await resolveUser("milo_at_not_a_dev_token")).toBeNull();
  });
});

describe("resolveAccessToken (OAuth) last_used_at", () => {
  const validRow = {
    user_id: "user1",
    client_id: "client1",
    scope: "milo.projects.read",
    resource: MCP_RESOURCE_URL,
    access_expires_at: new Date(Date.now() + 60_000).toISOString(),
    revoked_at: null,
  };

  it("AWAITS the touch and resolves the grant", async () => {
    const state = freshTouch();
    h.from = tableFake("oauth_tokens", { select: validRow }, state);
    const grant = await resolveAccessToken("milo_at_sometoken");
    expect(grant).toEqual({ userId: "user1", clientId: "client1", scope: "milo.projects.read", resource: MCP_RESOURCE_URL });
    expect(state.updateCalled).toBe(true);
    expect(state.updatedWith).toHaveProperty("last_used_at");
    expect(state.settled).toBe(true); // fire-and-forget would still be false here
  });

  it("a failing touch never fails token validation", async () => {
    const state = freshTouch();
    h.from = tableFake("oauth_tokens", { select: validRow }, state, { reject: true });
    expect(await resolveAccessToken("milo_at_sometoken")).not.toBeNull();
    expect(state.settled).toBe(true);
  });

  it("invalid rows (expired/revoked/unknown) → null and NO touch", async () => {
    for (const bad of [null, { ...validRow, revoked_at: "2026-01-01" }, { ...validRow, access_expires_at: new Date(Date.now() - 1).toISOString() }]) {
      const state = freshTouch();
      h.from = tableFake("oauth_tokens", { select: bad }, state);
      expect(await resolveAccessToken("milo_at_sometoken")).toBeNull();
      expect(state.updateCalled).toBe(false);
    }
  });
});

// ---- revocation DB helper (shares the supabase mock) --------------------------

describe("revokeAccessTokenByHash", () => {
  const liveRow = { user_id: "user1", client_id: "client1", revoked_at: null };

  function revocationFake(selectRow: unknown, state: { updateCalled: boolean; updatedWith: Record<string, unknown> | null }, updateError: unknown = null) {
    return (table: string) => {
      expect(table).toBe("oauth_tokens");
      const chain: Record<string, unknown> = {};
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.maybeSingle = async () => ({ data: selectRow, error: null });
      chain.then = (res: (v: { error: unknown }) => unknown) => Promise.resolve({ error: updateError }).then(res);
      return {
        select: () => chain,
        update: (r: Record<string, unknown>) => {
          state.updateCalled = true;
          state.updatedWith = r;
          return chain;
        },
      };
    };
  }

  it("revokes a live row and returns its safe context (no token material)", async () => {
    const state = { updateCalled: false, updatedWith: null as Record<string, unknown> | null };
    h.from = revocationFake(liveRow, state);
    const r = await revokeAccessTokenByHash("somehash", "2026-07-08T00:00:00.000Z");
    expect(r).toEqual({ userId: "user1", clientId: "client1" });
    expect(state.updateCalled).toBe(true);
    expect(state.updatedWith).toEqual({ revoked_at: "2026-07-08T00:00:00.000Z" });
  });

  it("unknown or already-revoked rows → null, no update write", async () => {
    for (const row of [null, { ...liveRow, revoked_at: "2026-01-01" }]) {
      const state = { updateCalled: false, updatedWith: null as Record<string, unknown> | null };
      h.from = revocationFake(row, state);
      expect(await revokeAccessTokenByHash("somehash", "2026-07-08T00:00:00.000Z")).toBeNull();
      expect(state.updateCalled).toBe(false);
    }
  });

  it("empty hash → null without any DB access", async () => {
    h.from = () => {
      throw new Error("no DB for empty hash");
    };
    expect(await revokeAccessTokenByHash("", "2026-07-08T00:00:00.000Z")).toBeNull();
  });

  it("throws when the revocation write fails (caller must not report success)", async () => {
    const state = { updateCalled: false, updatedWith: null as Record<string, unknown> | null };
    h.from = revocationFake(liveRow, state, { message: "db_down" });
    await expect(revokeAccessTokenByHash("somehash", "2026-07-08T00:00:00.000Z")).rejects.toThrow("revoke_failed");
  });
});
