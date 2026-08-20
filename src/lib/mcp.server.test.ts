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
  mutateWorkspace: undefined as unknown as (...args: unknown[]) => unknown,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => h.from(table),
    rpc: (fn: string, args: Record<string, unknown>) => h.rpc(fn, args),
  },
}));

// Keep the REAL error classes (instanceof mapping depends on them); intercept
// only mutateWorkspace so write-tool tests control the workspace blob.
vi.mock("./workspace.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace.server")>();
  return {
    ...actual,
    mutateWorkspace: (...args: unknown[]) => h.mutateWorkspace(...args),
  };
});

import {
  MCP_TOKEN_PREFIX,
  TOOL_SCOPES,
  WRITE_TOOL_NAMES,
  CONTENT_WRITE_TOOL_NAMES,
  PENDING_TOOL_NAMES,
  toolAllowed,
  mcpToolNames,
  handleMcpMessage,
  buildMcpAuditEvent,
  resolveUser,
  type McpHooks,
} from "./mcp.server";
import { WorkspaceConflictError } from "./workspace.server";
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
  it("maps the 8 read tools + 2 write tools + 2 content-write tools + 3 pending tools to their scopes exactly", () => {
    expect(TOOL_SCOPES).toEqual({
      list_projects: "milo.projects.read",
      get_project_brief: "milo.projects.read",
      list_opportunities: "milo.content.read",
      list_content: "milo.content.read",
      get_content: "milo.content.read",
      get_latest_audit: "milo.insights.read",
      get_gsc_summary: "milo.insights.read",
      list_authority_opportunities: "milo.authority.read",
      create_growth_task: "milo.tasks.write",
      create_project_recommendation: "milo.projects.write",
      create_content_draft: "milo.content.write",
      update_content_draft: "milo.content.write",
      create_pending_action: "milo.actions.propose",
      list_pending_actions: "milo.actions.propose",
      get_pending_action: "milo.actions.propose",
    });
    expect([...mcpToolNames(), ...WRITE_TOOL_NAMES, ...CONTENT_WRITE_TOOL_NAMES, ...PENDING_TOOL_NAMES].sort()).toEqual(Object.keys(TOOL_SCOPES).sort());
  });
  it("null scopes = legacy developer token = every READ tool, NEVER write tools", () => {
    for (const name of mcpToolNames()) expect(toolAllowed(name, null)).toBe(true);
    for (const name of [...WRITE_TOOL_NAMES, ...CONTENT_WRITE_TOOL_NAMES]) expect(toolAllowed(name, null)).toBe(false);
  });
  it("scoped grants only reach their tools; unknown tools are never allowed", () => {
    expect(toolAllowed("list_projects", ["milo.projects.read"])).toBe(true);
    expect(toolAllowed("list_content", ["milo.projects.read"])).toBe(false);
    expect(toolAllowed("does_not_exist", ["milo.projects.read"])).toBe(false);
    expect(toolAllowed("list_projects", [])).toBe(false);
    expect(toolAllowed("create_growth_task", ["milo.tasks.write"])).toBe(true);
    expect(toolAllowed("create_growth_task", ["milo.projects.write"])).toBe(false);
    expect(toolAllowed("create_project_recommendation", ["milo.projects.write"])).toBe(true);
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
    // Per-entity backend: unmigrated user → bundle null → legacy blob read
    // (+ lazy backfill, which we just acknowledge).
    h.rpc = (fn: string) => {
      if (fn === "read_workspace_bundle") return Promise.resolve({ data: null, error: null });
      if (fn === "backfill_workspace_entities") return Promise.resolve({ data: true, error: null });
      throw new Error(`unexpected rpc ${fn}`);
    };
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
    expect(err?.detail.ok).toBe(false);
    expect(err?.event).toBe("mcp_call");
    const toolFail = buildMcpAuditEvent(
      { id: 1, method: "tools/call", params: { name: "list_projects" } },
      { jsonrpc: "2.0", id: 1, result: { content: [], isError: true } },
    );
    expect(toolFail?.detail).toEqual({ method: "tools/call", tool: "list_projects", ok: false });
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
    expect(ev?.event).toBe("mcp_call");
    expect(ev?.detail.ok).toBe(false);
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

// ---- Phase 1A write tools (flag + explicit scope gated) -----------------------

const READ_SCOPES_ALL = ["milo.projects.read", "milo.content.read", "milo.insights.read", "milo.authority.read"];
const READ_TOOLS_COUNT = 8;

const writeGrant = (scopes: string[] | null, writeEnabled = true) => ({ userId: "user1", scopes, writeEnabled });

/** Workspace blob fixture for write tests (with an unknown key that must survive). */
const writeBlob = () => ({
  projects: [{ id: "p1", name: "P1", primaryLanguage: "Swedish", targetAudience: "Local SMBs" }],
  opportunities: [],
  tasks: [],
  unknownFutureKey: { keep: true },
});

/** mutateWorkspace fake: applies the mutation to `blob`, captures the write. */
function fakeMutate(blob: Record<string, unknown>) {
  const captured: { written: Record<string, unknown> | null; calls: number } = { written: null, calls: 0 };
  h.mutateWorkspace = async (_userId: unknown, mutate: unknown) => {
    captured.calls += 1;
    const next = (mutate as (d: Record<string, unknown>) => { data: Record<string, unknown>; result: unknown })(structuredClone(blob));
    captured.written = next.data;
    return { result: next.result, rev: 42 };
  };
  return captured;
}

function captureHooks(rl?: { allowed: boolean; shouldAudit: boolean }) {
  const audits: { event: string; detail: Record<string, unknown> }[] = [];
  const hooks: McpHooks = {
    ...(rl
      ? { checkWriteLimit: async () => ({ ...rl, windowStartIso: "2026-07-10T18:00:00.000Z", retryAfterSec: 60 }) }
      : {}),
    audit: async (event, detail) => {
      audits.push({ event, detail });
    },
  };
  return { audits, hooks };
}

const parsePayload = (r: object | null) =>
  JSON.parse((r as { result: { content: { text: string }[] } }).result.content[0].text) as Record<string, unknown>;

describe("write tools — tools/list gating matrix", () => {
  const listTools = async (scopes: string[] | null, writeEnabled: boolean) => {
    const r = (await handleMcpMessage(writeGrant(scopes, writeEnabled), { id: 1, method: "tools/list" })) as {
      result: { tools: { name: string }[] };
    };
    return r.result.tools.map((t) => t.name);
  };

  it("flag off → 8 read tools even with both write scopes", async () => {
    const names = await listTools([...READ_SCOPES_ALL, "milo.tasks.write", "milo.projects.write"], false);
    expect(names).toHaveLength(READ_TOOLS_COUNT);
  });
  it("flag on + read-only scopes → still 8", async () => {
    expect(await listTools(READ_SCOPES_ALL, true)).toHaveLength(READ_TOOLS_COUNT);
  });
  it("flag on + tasks.write → only create_growth_task appears", async () => {
    const names = await listTools([...READ_SCOPES_ALL, "milo.tasks.write"], true);
    expect(names).toHaveLength(READ_TOOLS_COUNT + 1);
    expect(names).toContain("create_growth_task");
    expect(names).not.toContain("create_project_recommendation");
  });
  it("flag on + projects.write → only create_project_recommendation appears", async () => {
    const names = await listTools([...READ_SCOPES_ALL, "milo.projects.write"], true);
    expect(names).toHaveLength(READ_TOOLS_COUNT + 1);
    expect(names).toContain("create_project_recommendation");
    expect(names).not.toContain("create_growth_task");
  });
  it("flag on + both write scopes → both write tools with write annotations", async () => {
    const r = (await handleMcpMessage(writeGrant([...READ_SCOPES_ALL, "milo.tasks.write", "milo.projects.write"], true), {
      id: 1,
      method: "tools/list",
    })) as { result: { tools: { name: string; annotations?: Record<string, unknown> }[] } };
    expect(r.result.tools).toHaveLength(READ_TOOLS_COUNT + 2);
    const writeDefs = r.result.tools.filter((t) => (WRITE_TOOL_NAMES as readonly string[]).includes(t.name));
    for (const def of writeDefs) {
      expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    }
  });
  it("legacy developer token (null scopes) never sees write tools, flag on or off", async () => {
    expect(await listTools(null, true)).toHaveLength(READ_TOOLS_COUNT);
    expect(await listTools(null, false)).toHaveLength(READ_TOOLS_COUNT);
  });
});

describe("content-draft tools (Phase P-A)", () => {
  const contentGrant = writeGrant([...READ_SCOPES_ALL, "milo.content.write"], true);
  const call = (name: string, args: Record<string, unknown>, hooks?: McpHooks, grant = contentGrant) =>
    handleMcpMessage(grant, { id: 9, method: "tools/call", params: { name, arguments: args } }, hooks);

  it("tools/list: content.write exposes exactly the two content tools with write annotations", async () => {
    const r = (await handleMcpMessage(contentGrant, { id: 1, method: "tools/list" })) as {
      result: { tools: { name: string; annotations?: Record<string, unknown> }[] };
    };
    const names = r.result.tools.map((t) => t.name);
    expect(names).toContain("create_content_draft");
    expect(names).toContain("update_content_draft");
    expect(names).not.toContain("create_growth_task"); // different write scope
    const defs = r.result.tools.filter((t) => (CONTENT_WRITE_TOOL_NAMES as readonly string[]).includes(t.name));
    expect(defs).toHaveLength(2);
    for (const d of defs) expect(d.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
  });

  it("legacy dev token never sees content tools even with the flag on", async () => {
    const dev = (await handleMcpMessage({ userId: "u", scopes: null, writeEnabled: true }, { id: 1, method: "tools/list" })) as {
      result: { tools: { name: string }[] };
    };
    expect(dev.result.tools.map((t) => t.name)).not.toContain("create_content_draft");
  });

  it("create_content_draft lands a canonical Draft and never leaks body/title in the audit", async () => {
    const captured = fakeMutate(writeBlob());
    const { audits, hooks } = captureHooks();
    const r = await call(
      "create_content_draft",
      {
        projectId: "p1",
        title: "SECRET-DRAFT-TITLE",
        markdown: "SECRET-BODY-TEXT",
        metaDescription: "SECRET-META",
        outline: ["Intro", "Body"],
        faq: [{ q: "SECRET-Q", a: "SECRET-A" }],
        assetType: "article",
        requestId: "cd-1",
      },
      hooks,
    );
    const payload = parsePayload(r);
    expect(payload).toMatchObject({ status: "Draft", projectId: "p1" });
    expect(typeof payload.contentId).toBe("string");

    const content = captured.written?.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({
      projectId: "p1",
      title: "SECRET-DRAFT-TITLE",
      markdown: "SECRET-BODY-TEXT",
      status: "Draft",
      assetType: "article",
      sourceType: "manual",
      publishStatus: "notSent",
      livePublishStatus: "notPublished",
      requestId: "cd-1",
      language: "Swedish", // defaulted from the project
    });
    expect(content[0].slug).toBe("secret-draft-title");
    expect(content[0].h1).toBe("SECRET-DRAFT-TITLE"); // defaults to title
    expect(captured.written?.unknownFutureKey).toEqual({ keep: true }); // untouched keys survive

    const writes = audits.filter((a) => a.event === "mcp_write");
    expect(writes).toHaveLength(1);
    expect(writes[0].detail).toMatchObject({ tool: "create_content_draft", projectId: "p1", action: "create", requestId: "cd-1", ok: true });
    expect(writes[0].detail.fieldsChanged).toEqual(["assetType", "faq", "markdown", "metaDescription", "outline", "title"]);
    expect(JSON.stringify(audits)).not.toContain("SECRET"); // names-only audit
  });

  it("create_content_draft is idempotent on requestId", async () => {
    const blob = { ...writeBlob(), content: [{ id: "existing", requestId: "cd-9", title: "x", status: "Draft" }] };
    const captured = fakeMutate(blob);
    const { hooks } = captureHooks();
    const r = await call("create_content_draft", { projectId: "p1", title: "T", markdown: "M", requestId: "cd-9" }, hooks);
    const payload = parsePayload(r);
    expect(payload.deduped).toBe(true);
    expect(payload.contentId).toBe("existing");
    expect((captured.written?.content as unknown[]).length).toBe(1); // no duplicate appended
  });

  it("update_content_draft patches a draft by id and stamps updatedAt", async () => {
    const blob = { ...writeBlob(), content: [{ id: "c1", projectId: "p1", title: "old", markdown: "old", status: "Draft" }] };
    const captured = fakeMutate(blob);
    const { hooks } = captureHooks();
    const r = await call("update_content_draft", { contentId: "c1", title: "new title", markdown: "new body" }, hooks);
    expect(parsePayload(r)).toMatchObject({ contentId: "c1", status: "Draft", updated: true });
    const content = captured.written?.content as Record<string, unknown>[];
    expect(content[0]).toMatchObject({ id: "c1", title: "new title", markdown: "new body", status: "Draft" });
    expect(typeof content[0].updatedAt).toBe("string");
  });

  it("update_content_draft refuses a published article (-32014)", async () => {
    const blob = { ...writeBlob(), content: [{ id: "c1", status: "Draft", livePublishStatus: "published" }] };
    fakeMutate(blob);
    const r = (await call("update_content_draft", { contentId: "c1", title: "x" })) as { error?: { code: number } };
    expect(r.error?.code).toBe(-32014);
  });

  it("update_content_draft on a missing id is a uniform not-found (-32011)", async () => {
    fakeMutate(writeBlob());
    const r = (await call("update_content_draft", { contentId: "nope", title: "x" })) as { error?: { code: number } };
    expect(r.error?.code).toBe(-32011);
  });

  it("create_content_draft rejects unknown fields and requires markdown", async () => {
    fakeMutate(writeBlob());
    const bad = (await call("create_content_draft", { projectId: "p1", title: "T", markdown: "M", bogus: 1 })) as { error?: { code: number } };
    expect(bad.error?.code).toBe(-32010);
    const noBody = (await call("create_content_draft", { projectId: "p1", title: "T" })) as { error?: { code: number } };
    expect(noBody.error?.code).toBe(-32010);
  });

  it("content tools are unknown when the write flag is off (-32602)", async () => {
    fakeMutate(writeBlob());
    const off = writeGrant([...READ_SCOPES_ALL, "milo.content.write"], false);
    const r = (await call("create_content_draft", { projectId: "p1", title: "T", markdown: "M" }, undefined, off)) as { error?: { code: number } };
    expect(r.error?.code).toBe(-32602);
  });
});

describe("write tools — execution", () => {
  const fullGrant = writeGrant([...READ_SCOPES_ALL, "milo.tasks.write", "milo.projects.write"], true);
  const call = (name: string, args: Record<string, unknown>, hooks?: McpHooks, grant = fullGrant) =>
    handleMcpMessage(grant, { id: 9, method: "tools/call", params: { name, arguments: args } }, hooks);

  it("create_growth_task writes into tasks[] with forced fields and preserves unknown keys", async () => {
    const captured = fakeMutate(writeBlob());
    const { audits, hooks } = captureHooks();
    const r = await call("create_growth_task", { projectId: "p1", title: "SECRET-TITLE-XYZ", description: "SECRET-DESC", dueOn: "2026-08-01", priority: "High", requestId: "req-1" }, hooks);
    const payload = parsePayload(r);
    expect(payload.status).toBe("open");
    expect(payload.projectId).toBe("p1");
    expect(typeof payload.taskId).toBe("string");
    expect(payload.deduped).toBeUndefined();

    const tasks = captured.written?.tasks as Record<string, unknown>[];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ projectId: "p1", title: "SECRET-TITLE-XYZ", status: "open", origin: "claude", requestId: "req-1", priority: "High", dueOn: "2026-08-01" });
    expect(typeof tasks[0].createdAt).toBe("string");
    expect(typeof tasks[0].updatedAt).toBe("string");
    expect(captured.written?.unknownFutureKey).toEqual({ keep: true });

    // Audit: mcp_write with names/ids only — planted content must NOT leak.
    const writes = audits.filter((a) => a.event === "mcp_write");
    expect(writes).toHaveLength(1);
    expect(writes[0].detail).toEqual({
      tool: "create_growth_task",
      projectId: "p1",
      action: "create",
      fieldsChanged: ["description", "dueOn", "priority", "title"],
      requestId: "req-1",
      entityIds: [payload.taskId],
      ok: true,
    });
    expect(JSON.stringify(audits)).not.toContain("SECRET");
  });

  it("create_project_recommendation writes a canonical claude-sourced opportunity", async () => {
    const captured = fakeMutate(writeBlob());
    const { audits, hooks } = captureHooks();
    const r = await call("create_project_recommendation", { projectId: "p1", title: "SECRET-REC-TITLE", rationale: "SECRET-RATIONALE", contentType: "Guide", priority: "Low" }, hooks);
    const payload = parsePayload(r);
    expect(payload.status).toBe("captured");
    expect(typeof payload.opportunityId).toBe("string");

    const opps = captured.written?.opportunities as Record<string, unknown>[];
    expect(opps).toHaveLength(1);
    expect(opps[0]).toMatchObject({
      projectId: "p1",
      title: "SECRET-REC-TITLE",
      // Canonical lifecycle on write; the legacy "Linked" label is read-only history.
      status: "captured",
      source: "claude",
      contentType: "Guide",
      priority: "Low",
      language: "Swedish", // from the project
      businessValue: "SECRET-RATIONALE",
    });
    expect(JSON.stringify(audits)).not.toContain("SECRET");
    expect(audits.filter((a) => a.event === "mcp_write")).toHaveLength(1);
  });

  it("idempotent replay by requestId returns the existing id with deduped:true and writes nothing new", async () => {
    const blob = writeBlob();
    (blob.tasks as Record<string, unknown>[]).push({ id: "existing1", projectId: "p1", title: "old", status: "open", origin: "claude", requestId: "req-dup", createdAt: "x", updatedAt: "x" });
    const captured = fakeMutate(blob);
    const { audits, hooks } = captureHooks();
    const r = await call("create_growth_task", { projectId: "p1", title: "replayed", requestId: "req-dup" }, hooks);
    const payload = parsePayload(r);
    expect(payload.taskId).toBe("existing1");
    expect(payload.deduped).toBe(true);
    expect((captured.written?.tasks as unknown[]).length).toBe(1); // unchanged
    expect(audits.find((a) => a.event === "mcp_write")?.detail.deduped).toBe(true);
  });

  it("unknown projectId → -32011 Not found (uniform) + failed audit", async () => {
    fakeMutate(writeBlob());
    const { audits, hooks } = captureHooks();
    const r = (await call("create_growth_task", { projectId: "nope", title: "t" }, hooks)) as { error: { code: number; message: string } };
    expect(r.error.code).toBe(-32011);
    expect(r.error.message).toBe("Not found.");
    expect(audits.find((a) => a.event === "mcp_write")?.detail).toMatchObject({ ok: false, error: "not_found" });
  });

  it("validation failures → -32010 before any workspace access", async () => {
    h.mutateWorkspace = async () => {
      throw new Error("must not be called");
    };
    const cases: [Record<string, unknown>, string][] = [
      [{ projectId: "p1" }, "title"],
      [{ projectId: "p1", title: "" }, "title"],
      [{ projectId: "p1", title: "x".repeat(201) }, "title"],
      [{ projectId: "p1", title: "ok", dueOn: "01-08-2026" }, "dueOn"],
      [{ projectId: "p1", title: "ok", priority: "URGENT" }, "priority"],
      [{ projectId: "p1", title: "ok", bogusField: 1 }, "bogusField"],
    ];
    for (const [args, field] of cases) {
      const r = (await call("create_growth_task", args)) as { error: { code: number; message: string } };
      expect(r.error.code).toBe(-32010);
      expect(r.error.message).toContain(field);
    }
    const badType = (await call("create_project_recommendation", { projectId: "p1", title: "ok", contentType: "Poem" })) as { error: { code: number } };
    expect(badType.error.code).toBe(-32010);
  });

  it("missing write scope → -32002 and buildMcpAuditEvent yields mcp_denied with the write scope", async () => {
    const readOnly = writeGrant(READ_SCOPES_ALL, true);
    const msg = { id: 9, method: "tools/call", params: { name: "create_growth_task", arguments: { projectId: "p1", title: "t" } } };
    const r = (await handleMcpMessage(readOnly, msg)) as { error: { code: number } };
    expect(r.error.code).toBe(-32002);
    expect(buildMcpAuditEvent(msg, r)).toEqual({ event: "mcp_denied", detail: { tool: "create_growth_task", requiredScope: "milo.tasks.write" } });
  });

  it("flag off → write tools behave as unknown (-32602)", async () => {
    const grant = writeGrant([...READ_SCOPES_ALL, "milo.tasks.write"], false);
    const r = (await call("create_growth_task", { projectId: "p1", title: "t" }, undefined, grant)) as { error: { code: number } };
    expect(r.error.code).toBe(-32602);
  });

  it("workspace rev conflict → -32012", async () => {
    h.mutateWorkspace = async () => {
      throw new WorkspaceConflictError();
    };
    const { audits, hooks } = captureHooks();
    const r = (await call("create_growth_task", { projectId: "p1", title: "t" }, hooks)) as { error: { code: number; message: string } };
    expect(r.error.code).toBe(-32012);
    expect(audits.find((a) => a.event === "mcp_write")?.detail).toMatchObject({ ok: false, error: "conflict" });
  });

  it("write rate limit → -32003 with one rate_limited audit, before validation/mutation", async () => {
    h.mutateWorkspace = async () => {
      throw new Error("must not be called");
    };
    const { audits, hooks } = captureHooks({ allowed: false, shouldAudit: true });
    const r = (await call("create_growth_task", { projectId: "p1", title: "t" }, hooks)) as { error: { code: number; message: string } };
    expect(r.error.code).toBe(-32003);
    expect(r.error.message).toMatch(/rate limit/i);
    expect(audits).toEqual([{ event: "rate_limited", detail: { bucket: "write", window_start: "2026-07-10T18:00:00.000Z" } }]);
    // Subsequent over-limit calls in the same window audit nothing new.
    const again = captureHooks({ allowed: false, shouldAudit: false });
    await call("create_growth_task", { projectId: "p1", title: "t" }, again.hooks);
    expect(again.audits).toEqual([]);
  });

  it("buildMcpAuditEvent skips generic mcp_call for write-tool outcomes (mcp_write covers them)", async () => {
    const captured = fakeMutate(writeBlob());
    const { hooks } = captureHooks();
    const msg = { id: 9, method: "tools/call", params: { name: "create_growth_task", arguments: { projectId: "p1", title: "t" } } };
    const r = await handleMcpMessage(fullGrant, msg, hooks);
    expect(buildMcpAuditEvent(msg, r)).toBeNull();
    expect(captured.calls).toBe(1);
  });

  it("read tools are untouched by hooks/write plumbing (no regression)", async () => {
    h.rpc = (fn: string) => {
      if (fn === "read_workspace_bundle") return Promise.resolve({ data: null, error: null });
      if (fn === "backfill_workspace_entities") return Promise.resolve({ data: true, error: null });
      throw new Error(`unexpected rpc ${fn}`);
    };
    h.from = (table: string) => {
      expect(table).toBe("workspaces");
      const chain: Record<string, unknown> = {};
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: { data: { projects: [{ id: "p1" }] } }, error: null });
      return { select: () => chain };
    };
    const { audits, hooks } = captureHooks();
    const r = await handleMcpMessage(fullGrant, { id: 1, method: "tools/call", params: { name: "list_projects", arguments: {} } }, hooks);
    expect(JSON.parse((r as { result: { content: { text: string }[] } }).result.content[0].text)).toHaveLength(1);
    expect(audits).toEqual([]); // read path never fires write hooks
  });
});
