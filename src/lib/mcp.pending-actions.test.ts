/**
 * Phase 1B.3 — dark-gated pending-action MCP tools. Drives handleMcpMessage
 * with synthetic grants over an in-memory workspace row (workspace.server
 * mocked at the module boundary; hooks capture audits + rate-limit calls).
 * Covers the visibility matrix, the create/list/get behavior, error mapping
 * (-32602/-32002/-32010/-32011/-32013/-32003) and audit redaction.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PendingAction } from "./types";

const h = vi.hoisted(() => ({
  row: null as { data: Record<string, unknown>; rev: number } | null,
  writeLimit: { allowed: true, shouldAudit: false, windowStartIso: "2026-07-11T00:00:00.000Z", retryAfterSec: 60 },
  writeLimitCalls: 0,
  events: [] as { event: string; detail: Record<string, unknown> }[],
}));

vi.mock("./workspace.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace.server")>();
  return {
    ...actual,
    readWorkspaceRow: async () => (h.row ? { data: h.row.data, rev: h.row.rev } : null),
    mutateWorkspace: async (_userId: string, mutate: (data: Record<string, unknown>) => { data: Record<string, unknown>; result: unknown }) => {
      if (!h.row) throw new actual.WorkspaceNotFoundError();
      const next = mutate(structuredClone(h.row.data));
      h.row = { data: next.data, rev: h.row.rev + 1 };
      return { result: next.result, rev: h.row.rev };
    },
  };
});

import { handleMcpMessage, buildMcpAuditEvent, PENDING_TOOL_NAMES, TOOL_SCOPES, type McpGrant, type McpHooks } from "./mcp.server";

const READS = ["milo.projects.read", "milo.content.read", "milo.insights.read", "milo.authority.read"];
const WRITES = ["milo.tasks.write", "milo.projects.write"];
const PROPOSE = "milo.actions.propose";

const grantOf = (scopes: string[] | null, writeEnabled: boolean, clientId?: string): McpGrant => ({
  userId: "owner1",
  scopes,
  writeEnabled,
  ...(clientId ? { clientId } : {}),
});

const hooks: McpHooks = {
  checkWriteLimit: async () => {
    h.writeLimitCalls += 1;
    return h.writeLimit;
  },
  audit: async (event, detail) => {
    h.events.push({ event, detail });
  },
};

const rpc = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 1, method, params });
const call = (grant: McpGrant, name: string, args: Record<string, unknown> = {}) =>
  handleMcpMessage(grant, rpc("tools/call", { name, arguments: args }) as never, hooks);
const listTools = async (grant: McpGrant): Promise<{ name: string; annotations?: Record<string, boolean> }[]> => {
  const res = (await handleMcpMessage(grant, rpc("tools/list") as never, hooks)) as { result: { tools: { name: string; annotations?: Record<string, boolean> }[] } };
  return res.result.tools;
};
const errOf = (res: unknown) => (res as { error?: { code: number; message: string } }).error;
const payloadOf = (res: unknown) => JSON.parse((res as { result: { content: { text: string }[] } }).result.content[0].text);

const validArgs = () => ({
  type: "opportunity_update_proposal",
  projectId: "synergy",
  title: "Sharpen the comparison opportunity",
  summary: "Claude suggests a clearer title for one opportunity.",
  payload: { opportunityId: "o1", updates: { title: "Massage vs physio", priority: "High" } },
  preview: "- title → Massage vs physio",
  requestId: "propose-req-1",
});

beforeEach(() => {
  h.row = {
    data: {
      projects: [{ id: "synergy", businessName: "Synergy Massage" }],
      opportunities: [{ id: "o1", projectId: "synergy", title: "Original", businessValue: "Original value" }],
      pendingActions: [],
    },
    rev: 11,
  };
  h.writeLimit = { allowed: true, shouldAudit: false, windowStartIso: "2026-07-11T00:00:00.000Z", retryAfterSec: 60 };
  h.writeLimitCalls = 0;
  h.events = [];
});

describe("visibility matrix", () => {
  it("flag off: 8 read tools only; pending tools are unknown (-32602) even with the scope", async () => {
    const g = grantOf([...READS, ...WRITES, PROPOSE], false, "client_A");
    const tools = await listTools(g);
    expect(tools).toHaveLength(8);
    expect(tools.every((t) => !PENDING_TOOL_NAMES.includes(t.name as never))).toBe(true);
    for (const name of PENDING_TOOL_NAMES) {
      const res = await call(g, name, validArgs());
      expect(errOf(res)?.code).toBe(-32602);
    }
  });

  it("flag on + read-only token: no pending tools; direct call → -32002", async () => {
    const g = grantOf(READS, true, "client_A");
    expect(await listTools(g)).toHaveLength(8);
    expect(errOf(await call(g, "create_pending_action", validArgs()))?.code).toBe(-32002);
  });

  it("flag on + direct-write-only token: 10 tools, pending absent", async () => {
    const g = grantOf([...READS, ...WRITES], true, "client_A");
    const names = (await listTools(g)).map((t) => t.name);
    expect(names).toHaveLength(10);
    expect(names).toContain("create_growth_task");
    for (const p of PENDING_TOOL_NAMES) expect(names).not.toContain(p);
    expect(errOf(await call(g, "list_pending_actions"))?.code).toBe(-32002);
  });

  it("flag on + propose-only token: 11 tools, direct writes absent", async () => {
    const g = grantOf([...READS, PROPOSE], true, "client_A");
    const tools = await listTools(g);
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(11);
    for (const p of PENDING_TOOL_NAMES) expect(names).toContain(p);
    expect(names).not.toContain("create_growth_task");
    expect(names).not.toContain("create_project_recommendation");
    // Annotations per spec.
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    expect(byName.create_pending_action).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(byName.list_pending_actions).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    expect(byName.get_pending_action).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
  });

  it("flag on + write+propose token: 13 tools", async () => {
    const g = grantOf([...READS, ...WRITES, PROPOSE], true, "client_A");
    expect(await listTools(g)).toHaveLength(13);
  });

  it("legacy developer token (null scopes) never sees or calls pending tools", async () => {
    const g = grantOf(null, true);
    expect(await listTools(g)).toHaveLength(8);
    expect(errOf(await call(g, "create_pending_action", validArgs()))?.code).toBe(-32002);
  });
});

describe("create_pending_action", () => {
  const g = () => grantOf([...READS, PROPOSE], true, "client_A");

  it("creates one pending action with attribution, derived risk, and rev", async () => {
    const res = await call(g(), "create_pending_action", validArgs());
    const p = payloadOf(res);
    expect(p.type).toBe("opportunity_update_proposal");
    expect(p.projectId).toBe("synergy");
    expect(p.status).toBe("pending");
    expect(p.riskLevel).toBe("medium");
    expect(p.requiredScope).toBe(PROPOSE);
    expect(p.requestId).toBe("propose-req-1");
    expect(p.deduped).toBe(false);
    expect(p.rev).toBe(12);
    const stored = (h.row!.data.pendingActions as PendingAction[])[0];
    expect(stored.id).toBe(p.actionId);
    expect(stored.source).toBe("claude");
    expect(stored.proposedByClientId).toBe("client_A");
    expect(h.writeLimitCalls).toBe(1); // create rides the write bucket
  });

  it("requestId replay dedupes: same actionId, deduped:true, one stored row, rev still bumps", async () => {
    const first = payloadOf(await call(g(), "create_pending_action", validArgs()));
    const replay = payloadOf(await call(g(), "create_pending_action", validArgs()));
    expect(replay.deduped).toBe(true);
    expect(replay.actionId).toBe(first.actionId);
    expect(replay.rev).toBe(13);
    expect(h.row!.data.pendingActions as PendingAction[]).toHaveLength(1);
  });

  it("derives a bounded preview when omitted", async () => {
    const args = { ...validArgs(), requestId: "propose-req-2" } as Record<string, unknown>;
    delete args.preview;
    const p = payloadOf(await call(g(), "create_pending_action", args));
    const stored = (h.row!.data.pendingActions as PendingAction[]).find((a) => a.id === p.actionId)!;
    expect(stored.preview).toContain("Update opportunity o1");
    expect(stored.preview).toContain("title → Massage vs physio");
    expect(stored.preview.length).toBeLessThanOrEqual(4096);
  });

  it("rejects unknown fields at every level with -32010", async () => {
    expect(errOf(await call(g(), "create_pending_action", { ...validArgs(), riskLevel: "low" }))?.code).toBe(-32010);
    expect(errOf(await call(g(), "create_pending_action", { ...validArgs(), payload: { opportunityId: "o1", updates: { title: "t" }, mode: "force" } }))?.code).toBe(-32010);
    for (const bad of [{ publish: true }, { delete: true }, { settings: {} }, { billing: "pro" }]) {
      const res = await call(g(), "create_pending_action", { ...validArgs(), payload: { opportunityId: "o1", updates: bad } });
      expect(errOf(res)?.code).toBe(-32010);
    }
  });

  it("enforces preview size (-32010) and the 200 cap (-32013)", async () => {
    expect(errOf(await call(g(), "create_pending_action", { ...validArgs(), preview: "p".repeat(5000) }))?.code).toBe(-32010);
    const stub = (i: number): PendingAction => ({
      id: `s${i}`, type: "opportunity_update_proposal", projectId: "synergy", title: "t", summary: "s",
      status: "pending", source: "claude", createdAt: "2099-01-01T00:00:00.000Z", updatedAt: "2099-01-01T00:00:00.000Z",
      expiresAt: "2099-02-01T00:00:00.000Z", requiredScope: PROPOSE,
      payload: { opportunityId: "o1", updates: { title: "x" } }, preview: "p", riskLevel: "medium",
    });
    h.row!.data.pendingActions = Array.from({ length: 200 }, (_, i) => stub(i));
    const res = await call(g(), "create_pending_action", { ...validArgs(), requestId: "fresh" });
    expect(errOf(res)?.code).toBe(-32013);
    expect(h.events.at(-1)).toMatchObject({ event: "pending_action_created", detail: { ok: false, error: "cap" } });
  });

  it("maps unknown project/opportunity to uniform -32011", async () => {
    expect(errOf(await call(g(), "create_pending_action", { ...validArgs(), projectId: "ghost" }))?.code).toBe(-32011);
    const res = await call(g(), "create_pending_action", { ...validArgs(), payload: { opportunityId: "ghost", updates: { title: "t" } } });
    expect(errOf(res)?.code).toBe(-32011);
    expect((h.row!.data.pendingActions as PendingAction[])).toHaveLength(0);
  });

  it("maps the write rate bucket to -32003 (and audits when the limiter says so)", async () => {
    h.writeLimit = { allowed: false, shouldAudit: true, windowStartIso: "2026-07-11T00:00:00.000Z", retryAfterSec: 30 };
    const res = await call(g(), "create_pending_action", validArgs());
    expect(errOf(res)?.code).toBe(-32003);
    expect(h.events[0]).toMatchObject({ event: "rate_limited", detail: { bucket: "write" } });
  });
});

describe("list/get — own-proposal visibility", () => {
  const gA = () => grantOf([...READS, PROPOSE], true, "client_A");

  beforeEach(async () => {
    await call(gA(), "create_pending_action", validArgs());
    await call(gA(), "create_pending_action", { ...validArgs(), requestId: "propose-req-2", summary: "Second proposal." });
    // A foreign client's proposal sits in the same workspace.
    (h.row!.data.pendingActions as PendingAction[]).push({
      id: "foreign1", type: "opportunity_update_proposal", projectId: "synergy", title: "Foreign", summary: "s",
      status: "pending", source: "claude", createdAt: "2099-01-01T00:00:00.000Z", updatedAt: "2099-01-01T00:00:00.000Z",
      requiredScope: PROPOSE, proposedByClientId: "client_B",
      payload: { opportunityId: "o1", updates: { title: "x" } }, preview: "p", riskLevel: "medium",
    });
  });

  it("list returns only this client's proposals as bounded summaries", async () => {
    const out = payloadOf(await call(gA(), "list_pending_actions"));
    expect(out.count).toBe(2);
    expect(out.actions.map((a: { id: string }) => a.id).sort()).not.toContain("foreign1");
    for (const a of out.actions) {
      expect(a).not.toHaveProperty("payload");
      expect(a).not.toHaveProperty("preview");
      expect(a.requiredScope).toBe(PROPOSE);
      expect(a.status).toBe("pending");
    }
  });

  it("filters by projectId/status/type and bounds limit", async () => {
    expect(payloadOf(await call(gA(), "list_pending_actions", { projectId: "synergy" })).count).toBe(2);
    expect(payloadOf(await call(gA(), "list_pending_actions", { projectId: "other" })).count).toBe(0);
    expect(payloadOf(await call(gA(), "list_pending_actions", { status: "applied" })).count).toBe(0);
    expect(payloadOf(await call(gA(), "list_pending_actions", { type: "opportunity_update_proposal" })).count).toBe(2);
    expect(payloadOf(await call(gA(), "list_pending_actions", { limit: 1 })).count).toBe(1);
    expect(errOf(await call(gA(), "list_pending_actions", { limit: 0 }))?.code).toBe(-32010);
    expect(errOf(await call(gA(), "list_pending_actions", { status: "bogus" }))?.code).toBe(-32010);
    expect(errOf(await call(gA(), "list_pending_actions", { evil: 1 }))?.code).toBe(-32010);
  });

  it("a propose grant without a clientId sees nothing", async () => {
    const out = payloadOf(await call(grantOf([...READS, PROPOSE], true), "list_pending_actions"));
    expect(out.count).toBe(0);
  });

  it("get returns own full action; foreign or missing ids are uniformly not found", async () => {
    const list = payloadOf(await call(gA(), "list_pending_actions"));
    const own = list.actions[0].id;
    const full = payloadOf(await call(gA(), "get_pending_action", { actionId: own }));
    expect(full.payload).toBeTruthy();
    expect(full.preview).toBeTruthy();
    expect(full.proposedByClientId).toBe("client_A");
    expect(errOf(await call(gA(), "get_pending_action", { actionId: "foreign1" }))?.code).toBe(-32011);
    expect(errOf(await call(gA(), "get_pending_action", { actionId: "ghost" }))?.code).toBe(-32011);
    expect(errOf(await call(gA(), "get_pending_action", { actionId: "x", evil: 1 }))?.code).toBe(-32010);
  });

  it("list/get never invoke the write rate bucket", async () => {
    const before = h.writeLimitCalls;
    await call(gA(), "list_pending_actions");
    await call(gA(), "get_pending_action", { actionId: "ghost" });
    expect(h.writeLimitCalls).toBe(before);
  });
});

describe("audit", () => {
  const g = () => grantOf([...READS, PROPOSE], true, "client_A");

  it("create persists pending_action_created with safe fields only; content never leaks", async () => {
    await call(g(), "create_pending_action", validArgs());
    const created = h.events.find((e) => e.event === "pending_action_created")!;
    expect(Object.keys(created.detail).sort()).toEqual(
      ["actionId", "fieldsChanged", "ok", "projectId", "requestId", "requiredScope", "riskLevel", "status", "type"].sort(),
    );
    expect(created.detail.fieldsChanged).toEqual(["priority", "title"]);
    const s = JSON.stringify(h.events);
    expect(s).not.toContain("Sharpen the comparison opportunity");
    expect(s).not.toContain("Claude suggests a clearer title");
    expect(s).not.toContain("Massage vs physio");
    expect(s).not.toMatch(/milo_at_|milo_rt_|hash|secret|family/i);
  });

  it("failure audit never echoes caller-supplied unknown update keys in fieldsChanged (follow-up B)", async () => {
    // Each malformed call: known + unknown update keys mixed. The failure audit
    // must drop every unknown key AND never contain any value.
    // Distinctive key names + values so probes can't collide with legitimate
    // audit content (e.g. "propose" in the scope/type).
    const cases: { updates: Record<string, unknown>; expectFields: string[]; badTokens: string[] }[] = [
      { updates: { seoXKey: "seoXVal" }, expectFields: [], badTokens: ["seoXKey", "seoXVal"] }, // the exact §13 nuance
      { updates: { publishXKey: true }, expectFields: [], badTokens: ["publishXKey"] },
      { updates: { deleteXKey: true }, expectFields: [], badTokens: ["deleteXKey"] },
      { updates: { settingsXKey: {} }, expectFields: [], badTokens: ["settingsXKey"] },
      { updates: { billingXKey: "billingXVal" }, expectFields: [], badTokens: ["billingXKey", "billingXVal"] },
      { updates: { recommendedCta: "leakXCtaVal", publishNowXKey: true }, expectFields: ["recommendedCta"], badTokens: ["leakXCtaVal", "publishNowXKey"] }, // known name survives, its VALUE and the unknown key are dropped
    ];
    for (const c of cases) {
      h.events = [];
      const res = await call(g(), "create_pending_action", { ...validArgs(), payload: { opportunityId: "o1", updates: c.updates } });
      expect(errOf(res)?.code).toBe(-32010); // response unchanged
      const failure = h.events.find((e) => e.event === "pending_action_created");
      expect(failure, "failure row must be audited").toBeTruthy();
      expect(failure!.detail.ok).toBe(false);
      expect(failure!.detail.error).toBe("validation");
      expect(failure!.detail.fieldsChanged).toEqual(c.expectFields);
      const s = JSON.stringify(h.events);
      for (const bad of c.badTokens) {
        expect(s, `audit must not contain "${bad}"`).not.toContain(bad);
      }
    }
  });

  it("no double-logging: create is excluded from mcp_call; list/get keep mcp_call; denials carry the propose scope", async () => {
    const createMsg = rpc("tools/call", { name: "create_pending_action", arguments: validArgs() });
    const okRes = await call(g(), "create_pending_action", { ...validArgs(), requestId: "audit-req" });
    expect(buildMcpAuditEvent(createMsg as never, okRes)).toBeNull();

    const listMsg = rpc("tools/call", { name: "list_pending_actions", arguments: {} });
    const listRes = await call(g(), "list_pending_actions");
    expect(buildMcpAuditEvent(listMsg as never, listRes)).toEqual({ event: "mcp_call", detail: { method: "tools/call", tool: "list_pending_actions", ok: true } });

    const denyRes = await call(grantOf(READS, true, "client_A"), "get_pending_action", { actionId: "x" });
    const denyMsg = rpc("tools/call", { name: "get_pending_action", arguments: { actionId: "x" } });
    expect(buildMcpAuditEvent(denyMsg as never, denyRes)).toEqual({ event: "mcp_denied", detail: { tool: "get_pending_action", requiredScope: TOOL_SCOPES.get_pending_action } });
  });
});
