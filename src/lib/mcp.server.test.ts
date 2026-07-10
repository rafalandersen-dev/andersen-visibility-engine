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
  rpc: undefined as unknown as (fn: string, args: Record<string, unknown>) => unknown,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => h.from(table),
    rpc: (fn: string, args: Record<string, unknown>) => h.rpc(fn, args),
  },
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
import {
  resolveAccessToken,
  revokeTokenByHash,
  revokeTokenFamily,
  getTokenRowByRefreshHash,
  consumeRefreshTokenByHash,
  listGrantsForUser,
  revokeGrantsForUserClient,
  MCP_RESOURCE_URL,
} from "./oauth.server";

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

  it("tools/list stays the same 8 READ tools even with MCP_WRITE_TOOLS_ENABLED on (no phantom write tools)", async () => {
    vi.stubEnv("MCP_WRITE_TOOLS_ENABLED", "true");
    try {
      const all = (await handleMcpMessage(grantAll, { id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } };
      expect(all.result.tools).toHaveLength(8);
      expect(all.result.tools.map((t) => t.name).join(",")).not.toMatch(/create|update|write|publish|delete/);
    } finally {
      vi.unstubAllEnvs();
    }
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

// ---- revocation DB helpers (share the supabase mock) --------------------------

/** Token-table fake: single-row lookups keyed by the filter column, list
 * selects for family scans, update recording. */
interface TokenFakeCfg {
  byAccess?: Record<string, unknown> | null;
  byRefresh?: Record<string, unknown> | null;
  familyLive?: number;
  updateError?: unknown;
}
interface TokenFakeLog {
  singleLookups: string[];
  listSelects: number;
  updates: { payload: Record<string, unknown>; filters: { k: string; v: unknown }[] }[];
}
const freshLog = (): TokenFakeLog => ({ singleLookups: [], listSelects: 0, updates: [] });

function tokenTableFake(cfg: TokenFakeCfg, log: TokenFakeLog) {
  return (table: string) => {
    expect(table).toBe("oauth_tokens");
    return {
      select: () => {
        const filters: { k: string; v: unknown }[] = [];
        const chain: Record<string, unknown> = {};
        chain.eq = (k: string, v: unknown) => {
          filters.push({ k, v });
          return chain;
        };
        chain.is = (k: string, v: unknown) => {
          filters.push({ k, v });
          return chain;
        };
        chain.maybeSingle = async () => {
          const key = filters[0]?.k;
          log.singleLookups.push(String(key));
          if (key === "access_token_hash") return { data: cfg.byAccess ?? null, error: null };
          if (key === "refresh_token_hash") return { data: cfg.byRefresh ?? null, error: null };
          return { data: null, error: null };
        };
        chain.then = (res: (v: unknown) => unknown) => {
          log.listSelects += 1;
          return Promise.resolve({ data: Array.from({ length: cfg.familyLive ?? 0 }, () => ({ user_id: "user1" })), error: null }).then(res);
        };
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        const filters: { k: string; v: unknown }[] = [];
        const chain: Record<string, unknown> = {};
        chain.eq = (k: string, v: unknown) => {
          filters.push({ k, v });
          return chain;
        };
        chain.is = (k: string, v: unknown) => {
          filters.push({ k, v });
          return chain;
        };
        chain.then = (res: (v: { error: unknown }) => unknown) => {
          log.updates.push({ payload, filters });
          return Promise.resolve({ error: cfg.updateError ?? null }).then(res);
        };
        return chain;
      },
    };
  };
}

describe("revokeTokenByHash (family-aware)", () => {
  const NOWISO = "2026-07-08T00:00:00.000Z";
  const familyLess = { user_id: "user1", client_id: "client1", revoked_at: null, refresh_family_id: null };
  const familyRow = { user_id: "user1", client_id: "client1", revoked_at: null, refresh_family_id: "fam-1" };

  it("pre-refresh row (null family): single-row revoke, current behavior preserved", async () => {
    const log = freshLog();
    h.from = tokenTableFake({ byAccess: familyLess }, log);
    const r = await revokeTokenByHash("somehash", NOWISO);
    expect(r).toEqual({ userId: "user1", clientId: "client1", tokenType: "access", familyRevoked: null });
    expect(log.updates).toHaveLength(1);
    expect(log.updates[0].payload).toEqual({ revoked_at: NOWISO });
    expect(log.updates[0].filters).toEqual([
      { k: "access_token_hash", v: "somehash" },
      { k: "revoked_at", v: null },
    ]);
  });

  it("access token WITH a family: revokes the whole family and reports the live count", async () => {
    const log = freshLog();
    h.from = tokenTableFake({ byAccess: familyRow, familyLive: 3 }, log);
    const r = await revokeTokenByHash("somehash", NOWISO);
    expect(r).toEqual({ userId: "user1", clientId: "client1", tokenType: "access", familyRevoked: 3 });
    expect(log.updates).toHaveLength(1);
    expect(log.updates[0].filters).toEqual([
      { k: "refresh_family_id", v: "fam-1" },
      { k: "revoked_at", v: null },
    ]);
  });

  it("refresh-token hash (access miss): tokenType refresh, family kill", async () => {
    const log = freshLog();
    h.from = tokenTableFake({ byAccess: null, byRefresh: familyRow, familyLive: 2 }, log);
    const r = await revokeTokenByHash("refreshhash", NOWISO);
    expect(r).toEqual({ userId: "user1", clientId: "client1", tokenType: "refresh", familyRevoked: 2 });
    expect(log.singleLookups).toEqual(["access_token_hash", "refresh_token_hash"]);
  });

  it("refresh_token hint orders the refresh lookup first", async () => {
    const log = freshLog();
    h.from = tokenTableFake({ byRefresh: familyRow, familyLive: 1 }, log);
    const r = await revokeTokenByHash("refreshhash", NOWISO, "refresh_token");
    expect(r?.tokenType).toBe("refresh");
    expect(log.singleLookups).toEqual(["refresh_token_hash"]);
  });

  it("unknown or already-revoked → null, no update write", async () => {
    for (const cfg of [{}, { byAccess: { ...familyLess, revoked_at: "2026-01-01" } }] as TokenFakeCfg[]) {
      const log = freshLog();
      h.from = tokenTableFake(cfg, log);
      expect(await revokeTokenByHash("somehash", NOWISO)).toBeNull();
      expect(log.updates).toHaveLength(0);
    }
  });

  it("empty hash → null without DB; failing write throws", async () => {
    h.from = () => {
      throw new Error("no DB for empty hash");
    };
    expect(await revokeTokenByHash("", NOWISO)).toBeNull();
    const log = freshLog();
    h.from = tokenTableFake({ byAccess: familyLess, updateError: { message: "db_down" } }, log);
    await expect(revokeTokenByHash("somehash", NOWISO)).rejects.toThrow("revoke_failed");
  });
});

describe("revokeTokenFamily / getTokenRowByRefreshHash / consumeRefreshTokenByHash", () => {
  it("revokeTokenFamily revokes live family rows and returns the live count", async () => {
    const log = freshLog();
    h.from = tokenTableFake({ familyLive: 2 }, log);
    expect(await revokeTokenFamily("fam-1", "2026-07-08T00:00:00.000Z")).toBe(2);
    expect(log.updates[0].filters).toEqual([
      { k: "refresh_family_id", v: "fam-1" },
      { k: "revoked_at", v: null },
    ]);
    expect(await revokeTokenFamily("", "now")).toBe(0); // no family → no DB write needed
  });

  it("getTokenRowByRefreshHash selects safe columns by refresh hash", async () => {
    const row = { user_id: "user1", client_id: "client1", scope: "s", refresh_family_id: "fam-1" };
    const log = freshLog();
    h.from = tokenTableFake({ byRefresh: row }, log);
    expect(await getTokenRowByRefreshHash("rhash")).toEqual(row);
    expect(await getTokenRowByRefreshHash("")).toBeNull();
  });

  it("consumeRefreshTokenByHash maps the RPC result and throws on RPC error", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    h.rpc = (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: true, error: null });
    };
    expect(await consumeRefreshTokenByHash("rhash", "2026-07-08T00:00:00.000Z")).toBe(true);
    expect(calls[0].fn).toBe("consume_refresh_token");
    expect(calls[0].args).toEqual({ p_refresh_hash: "rhash", p_now: "2026-07-08T00:00:00.000Z" });

    h.rpc = () => Promise.resolve({ data: null, error: null });
    expect(await consumeRefreshTokenByHash("rhash", "now")).toBe(false); // lost race / dead token

    h.rpc = () => Promise.resolve({ data: null, error: { message: "db_down" } });
    await expect(consumeRefreshTokenByHash("rhash", "now")).rejects.toThrow("consume_refresh_failed");
  });
});

// ---- connected apps DB helpers (share the supabase mock) ----------------------

interface QueryLog {
  table: string;
  kind: "select" | "update";
  columnsOrPayload: unknown;
  filters: { op: string; key: string; value: unknown }[];
}

/** Multi-table fake: records every select/update + filter, serves list results. */
function multiTableFake(data: Record<string, unknown[]>, log: QueryLog[], updateError: unknown = null) {
  return (table: string) => {
    const listChain = (entry: QueryLog, result: () => { data: unknown; error: unknown }) => {
      const chain: Record<string, unknown> = {};
      chain.eq = (key: string, value: unknown) => {
        entry.filters.push({ op: "eq", key, value });
        return chain;
      };
      chain.is = (key: string, value: unknown) => {
        entry.filters.push({ op: "is", key, value });
        return chain;
      };
      chain.in = (key: string, value: unknown) => {
        entry.filters.push({ op: "in", key, value });
        return chain;
      };
      chain.maybeSingle = async () => result();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
      return chain;
    };
    return {
      select: (columns: string) => {
        const entry: QueryLog = { table, kind: "select", columnsOrPayload: columns, filters: [] };
        log.push(entry);
        return listChain(entry, () => ({ data: data[table] ?? [], error: null }));
      },
      update: (payload: Record<string, unknown>) => {
        const entry: QueryLog = { table, kind: "update", columnsOrPayload: payload, filters: [] };
        log.push(entry);
        return listChain(entry, () => ({ data: null, error: updateError }));
      },
    };
  };
}

describe("listGrantsForUser", () => {
  const NOWISH = Date.now();
  const tokenRow = {
    client_id: "client1",
    scope: "milo.projects.read",
    created_at: new Date(NOWISH - 60_000).toISOString(),
    access_expires_at: new Date(NOWISH + 60_000).toISOString(),
    last_used_at: new Date(NOWISH - 30_000).toISOString(),
    revoked_at: null,
  };
  const consentRow = { client_id: "client1", scope: "milo.projects.read", granted_at: new Date(NOWISH - 60_000).toISOString(), revoked_at: null };

  it("selects display-safe columns only and scopes every query to the user", async () => {
    const log: QueryLog[] = [];
    h.from = multiTableFake({ oauth_tokens: [tokenRow], oauth_consents: [consentRow], oauth_clients: [{ client_id: "client1", client_name: "Claude" }] }, log);
    const apps = await listGrantsForUser("user1");

    expect(apps).toHaveLength(1);
    expect(apps[0].clientId).toBe("client1");
    expect(apps[0].clientName).toBe("Claude");
    expect(apps[0].status).toBe("active");
    expect(apps[0].activeTokenCount).toBe(1);
    expect(apps[0].latestTokenLastUsedAt).toBe(tokenRow.last_used_at);

    const selects = log.filter((l) => l.kind === "select");
    expect(selects.map((s) => s.table).sort()).toEqual(["oauth_clients", "oauth_consents", "oauth_tokens"]);
    for (const s of selects) {
      expect(String(s.columnsOrPayload)).not.toMatch(/hash|code|secret|\*/i);
    }
    const tokenSelect = selects.find((s) => s.table === "oauth_tokens");
    expect(tokenSelect?.filters).toEqual([{ op: "eq", key: "user_id", value: "user1" }]);
    const consentSelect = selects.find((s) => s.table === "oauth_consents");
    expect(consentSelect?.filters).toEqual([{ op: "eq", key: "user_id", value: "user1" }]);
    const clientSelect = selects.find((s) => s.table === "oauth_clients");
    expect(clientSelect?.filters).toEqual([{ op: "in", key: "client_id", value: ["client1"] }]);
    expect(JSON.stringify(apps)).not.toMatch(/hash|secret/i);
  });

  it("empty user id → [] with no DB access; no grants → [] without a clients lookup", async () => {
    h.from = () => {
      throw new Error("no DB for empty user");
    };
    expect(await listGrantsForUser("")).toEqual([]);

    const log: QueryLog[] = [];
    h.from = multiTableFake({ oauth_tokens: [], oauth_consents: [] }, log);
    expect(await listGrantsForUser("user1")).toEqual([]);
    expect(log.filter((l) => l.table === "oauth_clients")).toHaveLength(0);
  });
});

describe("revokeGrantsForUserClient", () => {
  it("revokes live tokens AND active consents, always filtered to user + client", async () => {
    const log: QueryLog[] = [];
    h.from = multiTableFake({}, log);
    await revokeGrantsForUserClient("user1", "client1", "2026-07-08T00:00:00.000Z");

    const updates = log.filter((l) => l.kind === "update");
    expect(updates.map((u) => u.table)).toEqual(["oauth_tokens", "oauth_consents"]);
    for (const u of updates) {
      expect(u.columnsOrPayload).toEqual({ revoked_at: "2026-07-08T00:00:00.000Z" });
      expect(u.filters).toEqual([
        { op: "eq", key: "user_id", value: "user1" },
        { op: "eq", key: "client_id", value: "client1" },
        { op: "is", key: "revoked_at", value: null },
      ]);
    }
  });

  it("missing user or client → no-op without DB access", async () => {
    h.from = () => {
      throw new Error("no DB for blank ids");
    };
    await revokeGrantsForUserClient("", "client1", "now");
    await revokeGrantsForUserClient("user1", "", "now");
  });

  it("throws when a revocation write fails", async () => {
    const log: QueryLog[] = [];
    h.from = multiTableFake({}, log, { message: "db_down" });
    await expect(revokeGrantsForUserClient("user1", "client1", "now")).rejects.toThrow("revoke_tokens_failed");
  });
});
