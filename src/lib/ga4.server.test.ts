/**
 * GA4 test rollout (server): every entry point fails closed outside the platform
 * owner's Synergy project, the OAuth return needs the initiating browser's
 * one-time nonce and consumes it, and storage errors are never read as "no row".
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  role: { data: true as unknown, error: null as unknown },
  ops: [] as { table: string; op: string; filters: Record<string, string> }[],
  fail: new Set<string>(),
  attempts: [] as Record<string, unknown>[],
  rows: {} as Record<string, unknown>,
}));
const ws = vi.hoisted(() => ({
  projects: [] as unknown[],
  fail: false,
}));
const google = vi.hoisted(() => ({ token: vi.fn() }));

vi.mock("@/integrations/supabase/client.server", () => {
  function chain(table: string, op: string, values?: unknown) {
    const filters: Record<string, string> = {};
    const after: Record<string, string> = {};
    const run = () => {
      db.ops.push({ table, op, filters: { ...filters } });
      if (db.fail.has(`${table}:${op}`)) return { data: null, error: { message: "boom" } };
      if (table === "ga4_oauth_attempts" && op === "insert") {
        db.attempts.push(values as Row);
        return { data: null, error: null };
      }
      if (table === "ga4_oauth_attempts" && op === "delete") {
        const hit = db.attempts.filter(
          (r) =>
            Object.entries(filters).every(([k, v]) => r[k] === v) &&
            Object.entries(after).every(([k, v]) => String(r[k]) > v),
        );
        db.attempts = db.attempts.filter((r) => !hit.includes(r));
        return { data: hit, error: null };
      }
      return { data: op === "select" ? (db.rows[table] ?? null) : null, error: null };
    };
    const c = {
      eq: (k: string, v: string) => ((filters[k] = v), c),
      gt: (k: string, v: string) => ((after[k] = v), c),
      select: () => c,
      maybeSingle: async () => run(),
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(ok, bad),
    };
    return c;
  }
  return {
    supabaseAdmin: {
      rpc: async () => db.role,
      from: (table: string) => ({
        select: () => chain(table, "select"),
        insert: (v: unknown) => chain(table, "insert", v),
        upsert: (v: unknown) => chain(table, "upsert", v),
        update: (v: unknown) => chain(table, "update", v),
        delete: () => chain(table, "delete"),
      }),
    },
  };
});
vi.mock("./workspace.server", () => ({
  readWorkspaceRow: async () => {
    if (ws.fail) throw new Error("workspace_read_failed");
    return { data: { projects: ws.projects }, rev: 1 };
  },
}));
vi.mock("./gsc-oauth.server", async (original) => ({
  ...(await original<typeof import("./gsc-oauth.server")>()),
  postToken: google.token,
}));

import {
  completeGa4Callback,
  disconnectGa4,
  getGa4DailyReport,
  ga4StateCookieFrom,
  ga4Status,
  startGa4OAuth,
  syncGa4,
} from "./ga4.server";
import { GA4_SCOPE } from "./ga4";

const OWNER = "00000000-0000-4000-8000-000000000001";
const SYNERGY = { id: "p-syn", websiteUrl: "https://www.synergymassage.se/" };
const OTHER = { id: "p-other", websiteUrl: "https://example.com" };
const ENV = {
  GOOGLE_CLIENT_ID: "client",
  GOOGLE_CLIENT_SECRET: "secret-for-tests",
  GOOGLE_OAUTH_REDIRECT_URI: "https://app.example/api/google/search-console/callback",
  GSC_TOKEN_ENCRYPTION_KEY: "test-key-that-is-definitely-longer-than-32-chars",
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  db.role = { data: true, error: null };
  db.ops = [];
  db.fail = new Set();
  db.attempts = [];
  db.rows = {};
  ws.projects = [SYNERGY, OTHER];
  ws.fail = false;
  google.token.mockReset().mockResolvedValue({
    access_token: "a",
    refresh_token: "r",
    scope: GA4_SCOPE,
    expires_in: 3600,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("test-rollout gate (fail closed)", () => {
  it("admits only the platform owner on the Synergy project", async () => {
    expect(await ga4Status(OWNER, SYNERGY.id)).toEqual({ status: "disconnected" });
  });
  it.each([
    ["not the owner role", () => (db.role = { data: false, error: null })],
    ["role lookup error", () => (db.role = { data: true, error: { message: "x" } })],
    ["workspace read error", () => (ws.fail = true)],
    ["project not in the caller's workspace", () => (ws.projects = [OTHER])],
  ])("denies on %s before touching GA4 storage", async (_, arrange) => {
    arrange();
    expect(await code(ga4Status(OWNER, SYNERGY.id))).toBe("not_available");
    expect(await code(startGa4OAuth(OWNER, SYNERGY.id))).toBe("not_available");
    expect(await code(syncGa4({ userId: OWNER, projectId: SYNERGY.id }))).toBe("not_available");
    expect(await code(disconnectGa4(OWNER, SYNERGY.id))).toBe("not_available");
    expect(await code(getGa4DailyReport(OWNER, SYNERGY.id))).toBe("not_available");
    expect(db.ops).toEqual([]);
  });
  it("denies an owned non-Synergy project", async () => {
    expect(await code(ga4Status(OWNER, OTHER.id))).toBe("not_available");
    expect(db.ops).toEqual([]);
  });
});

describe("browser-bound one-time OAuth state", () => {
  async function start() {
    const { url, nonce } = await startGa4OAuth(OWNER, SYNERGY.id);
    const q = new URL(url).searchParams;
    return { state: q.get("state")!, nonce, q };
  }

  it("requests only analytics.readonly and stores just the nonce hash", async () => {
    const { nonce, q } = await start();
    expect(q.get("scope")).toBe(GA4_SCOPE);
    expect(q.get("include_granted_scopes")).toBe("false");
    expect(q.get("state")).not.toContain(nonce);
    expect(db.attempts).toEqual([
      expect.objectContaining({ nonce_hash: sha(nonce), user_id: OWNER, project_id: SYNERGY.id }),
    ]);
  });

  it("a newer start voids the older attempt", async () => {
    const first = await start();
    await start();
    expect(await completeGa4Callback({ state: first.state, cookieNonce: first.nonce, code: "c" })).toBe(
      "error",
    );
    expect(google.token).not.toHaveBeenCalled();
  });

  it("rejects a missing or different browser cookie without consuming the attempt", async () => {
    const { state } = await start();
    expect(await completeGa4Callback({ state, code: "c" })).toBe("error");
    expect(await completeGa4Callback({ state, cookieNonce: "other", code: "c" })).toBe("error");
    expect(db.attempts).toHaveLength(1);
    expect(google.token).not.toHaveBeenCalled();
  });

  it("connects once with the matching cookie, then refuses a replay", async () => {
    const { state, nonce } = await start();
    expect(await completeGa4Callback({ state, cookieNonce: nonce, code: "c" })).toBe("connected");
    expect(db.ops).toContainEqual(expect.objectContaining({ table: "google_connections", op: "upsert" }));
    expect(await completeGa4Callback({ state, cookieNonce: nonce, code: "c" })).toBe("error");
    expect(google.token).toHaveBeenCalledTimes(1);
  });

  it("consumes the attempt on denial and on a lost rollout, without exchanging the code", async () => {
    let s = await start();
    expect(await completeGa4Callback({ state: s.state, cookieNonce: s.nonce, error: "access_denied" })).toBe(
      "denied",
    );
    s = await start();
    db.role = { data: false, error: null };
    expect(await completeGa4Callback({ state: s.state, cookieNonce: s.nonce, code: "c" })).toBe("error");
    expect(db.attempts).toEqual([]);
    expect(google.token).not.toHaveBeenCalled();
  });

  it("refuses an expired attempt", async () => {
    const { state, nonce } = await start();
    db.attempts[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await completeGa4Callback({ state, cookieNonce: nonce, code: "c" })).toBe("error");
  });

  it("reports a failed token save as an error", async () => {
    const { state, nonce } = await start();
    db.fail.add("google_connections:upsert");
    expect(await completeGa4Callback({ state, cookieNonce: nonce, code: "c" })).toBe("error");
  });

  it("reads the cookie only by its exact name", () => {
    expect(ga4StateCookieFrom("a=1; __Host-milo_ga4_oauth=abc; b=2")).toBe("abc");
    expect(ga4StateCookieFrom("x__Host-milo_ga4_oauth=abc")).toBeUndefined();
    expect(ga4StateCookieFrom(null)).toBeUndefined();
  });
});

describe("daily report read", () => {
  const snapshot = {
    source: "ga4_api",
    propertyId: "528831108",
    propertyName: "Synergy",
    timeZone: "Europe/Stockholm",
    chatgptSessions: 2,
    bookingClicks: null,
    bookingCompleted: null,
    partial: false,
    fetchedAt: "2026-11-22T05:40:01.000Z",
  };
  const row = {
    property_id: "528831108",
    period_start: "2026-10-25",
    period_end: "2026-11-21",
    snapshot,
    last_attempt_at: "2026-11-22T05:40:00+00:00",
    last_success_at: "2026-11-22T05:40:01+00:00",
    last_error: null,
  };
  beforeEach(() => {
    db.rows.ga4_project_properties = { property_id: "528831108" };
  });
  it("returns the stored snapshot with normalised timestamps", async () => {
    db.rows.ga4_daily_reports = row;
    expect(await getGa4DailyReport(OWNER, SYNERGY.id)).toEqual({
      propertyId: "528831108",
      periodStart: "2026-10-25",
      periodEnd: "2026-11-21",
      snapshot,
      lastAttemptAt: "2026-11-22T05:40:00.000Z",
      lastSuccessAt: "2026-11-22T05:40:01.000Z",
    });
  });
  it("keeps the status but drops a snapshot whose period is not 28 days", async () => {
    db.rows.ga4_daily_reports = {
      ...row,
      period_start: "2026-10-01",
      last_attempt_at: "2026-11-23T05:40:00+00:00",
      last_error: "expired",
    };
    expect(await getGa4DailyReport(OWNER, SYNERGY.id)).toEqual({
      propertyId: "528831108",
      lastAttemptAt: "2026-11-23T05:40:00.000Z",
      lastSuccessAt: "2026-11-22T05:40:01.000Z",
      lastError: "expired",
    });
  });
  it("hides a stale failure written by a run that started before the last success", async () => {
    db.rows.ga4_daily_reports = {
      ...row,
      last_attempt_at: "2026-11-22T05:39:00+00:00",
      last_error: "unavailable",
    };
    expect(await getGa4DailyReport(OWNER, SYNERGY.id)).not.toHaveProperty("lastError");
  });
  it("never surfaces a row of an earlier selection, or with no selection", async () => {
    db.rows.ga4_daily_reports = row;
    db.rows.ga4_project_properties = { property_id: "999" };
    expect(await getGa4DailyReport(OWNER, SYNERGY.id)).toBeNull();
    db.rows.ga4_project_properties = null;
    expect(await getGa4DailyReport(OWNER, SYNERGY.id)).toBeNull();
  });
  it("does not report a failed read as no report", async () => {
    db.fail.add("ga4_daily_reports:select");
    expect(await code(getGa4DailyReport(OWNER, SYNERGY.id))).toBe("failed");
    db.fail = new Set(["ga4_project_properties:select"]);
    expect(await code(getGa4DailyReport(OWNER, SYNERGY.id))).toBe("failed");
  });
});

describe("pinned daily sync", () => {
  it("rejects a changed selection before any token or Google request", async () => {
    db.rows.ga4_project_properties = { property_id: "999" };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      expect(
        await code(
          syncGa4({ userId: OWNER, projectId: SYNERGY.id, expectedPropertyId: "528831108" }),
        ),
      ).toBe("not_available");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(google.token).not.toHaveBeenCalled();
    expect(db.ops.map((o) => o.table)).not.toContain("google_connections");
  });
});

describe("storage failures are surfaced", () => {
  it("status does not report a failed read as disconnected", async () => {
    db.fail.add("google_connections:select");
    expect(await code(ga4Status(OWNER, SYNERGY.id))).toBe("failed");
  });
  it("sync does not report a failed property read as no property", async () => {
    db.fail.add("ga4_project_properties:select");
    expect(await code(syncGa4({ userId: OWNER, projectId: SYNERGY.id }))).toBe("failed");
    db.fail.clear();
    expect(await code(syncGa4({ userId: OWNER, projectId: SYNERGY.id }))).toBe("no_property");
  });
  it.each(["google_connections:update", "ga4_project_properties:delete"])(
    "disconnect fails when %s fails",
    async (step) => {
      db.fail.add(step);
      expect(await code(disconnectGa4(OWNER, SYNERGY.id))).toBe("failed");
    },
  );
  it("disconnect clears the token, project properties and pending attempts", async () => {
    expect(await code(disconnectGa4(OWNER, SYNERGY.id))).toBe("ok");
    expect(db.ops.map((o) => `${o.table}:${o.op}`)).toEqual([
      "google_connections:update",
      "ga4_project_properties:delete",
      "ga4_oauth_attempts:delete",
    ]);
  });
});
