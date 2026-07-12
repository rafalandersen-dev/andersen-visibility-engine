/**
 * Tests for the GSC daily background sync harness — pure logic through
 * injected dependencies: interval skipping, workspace blob updates identical
 * to a manual sync, per-connection failure isolation and reconnect marking.
 */
import { describe, it, expect, vi } from "vitest";
import {
  runGscBackgroundSync,
  applyImportToWorkspace,
  applyFailureToWorkspace,
  AUTO_SYNC_MIN_INTERVAL_HOURS,
  type GscCronDeps,
} from "./gsc-cron.server";
import { MAX_IMPORTS } from "./gsc";
import type { GscImport } from "./types";
import type { WorkspaceData } from "./workspace.server";

const NOW = new Date("2026-07-12T06:00:00.000Z");

function makeImport(id: string): GscImport {
  return {
    id,
    importedAt: NOW.toISOString(),
    source: "api",
    importType: "combined",
    rows: [],
    summary: { totalClicks: 3, totalImpressions: 120, averageCtr: 2.5, averagePosition: 12.3, rowCount: 0 },
    selectedSiteUrl: "https://butelkiwodorowe.pl/",
    dateRange: { start: "2026-06-11", end: "2026-07-09", label: "28d" },
  } as unknown as GscImport;
}

function project(id: string, opts: { siteUrl?: string; lastSyncedAt?: string; imports?: GscImport[] } = {}) {
  return {
    id,
    name: `Project ${id}`,
    customField: "must-survive",
    ...(opts.siteUrl
      ? { gscOAuth: { selectedSite: { siteUrl: opts.siteUrl }, sync: opts.lastSyncedAt ? { lastSyncedAt: opts.lastSyncedAt } : {} } }
      : {}),
    ...(opts.imports ? { gscLite: { imports: opts.imports } } : {}),
  };
}

function makeDeps(workspaces: Record<string, WorkspaceData>, syncImpl?: GscCronDeps["sync"]): GscCronDeps & { stored: Record<string, WorkspaceData> } {
  const stored: Record<string, WorkspaceData> = workspaces;
  return {
    stored,
    listConnections: async () => Object.keys(workspaces),
    readWorkspace: async (userId) => (stored[userId] ? { data: structuredClone(stored[userId]) } : null),
    sync: syncImpl ?? (async () => makeImport("imp-new")),
    mutate: async (userId, mutation) => {
      const next = mutation(structuredClone(stored[userId]));
      stored[userId] = next.data;
      return { result: next.result, rev: 1 };
    },
    now: () => NOW,
  };
}

describe("runGscBackgroundSync", () => {
  it("syncs every project with a selected property and stores the import like a manual sync", async () => {
    const deps = makeDeps({ u1: { projects: [project("p1", { siteUrl: "https://butelkiwodorowe.pl/" }), project("p2", {})] } });
    const res = await runGscBackgroundSync(deps);
    expect(res).toMatchObject({ connections: 1, synced: 1, failed: 0, skippedFresh: 0 });
    const p1 = (deps.stored.u1.projects as Record<string, unknown>[])[0] as Record<string, any>;
    expect(p1.gscLite.imports).toHaveLength(1);
    expect(p1.gscLite.latestImportId).toBe("imp-new");
    expect(p1.gscOAuth.sync.lastSyncedAt).toBe(NOW.toISOString());
    expect(p1.gscOAuth.sync.lastAutoSyncedAt).toBe(NOW.toISOString());
    expect(p1.gscOAuth.status).toBe("connected");
    expect(p1.customField).toBe("must-survive");
  });

  it("skips projects synced within the minimum interval (idempotent daily runs)", async () => {
    const fresh = new Date(NOW.getTime() - (AUTO_SYNC_MIN_INTERVAL_HOURS - 1) * 3_600_000).toISOString();
    const deps = makeDeps({ u1: { projects: [project("p1", { siteUrl: "https://x.pl/", lastSyncedAt: fresh })] } });
    const res = await runGscBackgroundSync(deps);
    expect(res).toMatchObject({ synced: 0, skippedFresh: 1, failed: 0 });
  });

  it("syncs again once the interval has passed", async () => {
    const stale = new Date(NOW.getTime() - (AUTO_SYNC_MIN_INTERVAL_HOURS + 1) * 3_600_000).toISOString();
    const deps = makeDeps({ u1: { projects: [project("p1", { siteUrl: "https://x.pl/", lastSyncedAt: stale })] } });
    const res = await runGscBackgroundSync(deps);
    expect(res).toMatchObject({ synced: 1, skippedFresh: 0 });
  });

  it("caps stored imports at MAX_IMPORTS", async () => {
    const existing = Array.from({ length: MAX_IMPORTS }, (_, i) => makeImport(`old-${i}`));
    const deps = makeDeps({
      u1: { projects: [project("p1", { siteUrl: "https://x.pl/", imports: existing })] },
    });
    await runGscBackgroundSync(deps);
    const p1 = (deps.stored.u1.projects as Record<string, any>[])[0];
    expect(p1.gscLite.imports).toHaveLength(MAX_IMPORTS);
    expect(p1.gscLite.imports[0].id).toBe("imp-new");
    expect(p1.gscLite.imports.at(-1).id).toBe(`old-${MAX_IMPORTS - 2}`);
  });

  it("marks invalid_grant as reconnect-needed and stops retrying that user in-run", async () => {
    const deps = makeDeps(
      {
        u1: { projects: [project("p1", { siteUrl: "https://a.pl/" }), project("p2", { siteUrl: "https://b.pl/" })] },
      },
      async () => {
        throw new Error("expired");
      },
    );
    const res = await runGscBackgroundSync(deps);
    expect(res).toMatchObject({ failed: 1, reconnectNeeded: 1, synced: 0 });
    const p1 = (deps.stored.u1.projects as Record<string, any>[])[0];
    expect(p1.gscOAuth.status).toBe("expired");
    expect(p1.gscOAuth.sync.lastError).toMatch(/Reconnect/);
    expect(p1.gscOAuth.sync.lastAutoSyncErrorCode).toBe("expired");
    // p2 untouched — no endless retries against a dead connection.
    const p2 = (deps.stored.u1.projects as Record<string, any>[])[1];
    expect(p2.gscOAuth.sync.lastAutoSyncErrorCode).toBeUndefined();
  });

  it("isolates one customer's failure from other customers", async () => {
    const calls: string[] = [];
    const deps = makeDeps(
      {
        broken: { projects: [project("p1", { siteUrl: "https://a.pl/" })] },
        healthy: { projects: [project("p2", { siteUrl: "https://b.pl/" })] },
      },
      async ({ userId }) => {
        calls.push(userId);
        if (userId === "broken") throw new Error("api_error");
        return makeImport("imp-ok");
      },
    );
    const res = await runGscBackgroundSync(deps);
    expect(calls).toContain("healthy");
    expect(res).toMatchObject({ connections: 2, synced: 1, failed: 1, reconnectNeeded: 0 });
    const healthy = (deps.stored.healthy.projects as Record<string, any>[])[0];
    expect(healthy.gscLite.imports).toHaveLength(1);
  });

  it("survives a user whose workspace cannot be read", async () => {
    const deps = makeDeps({ u1: { projects: [project("p1", { siteUrl: "https://a.pl/" })] } });
    const failingDeps: GscCronDeps = { ...deps, readWorkspace: async () => { throw new Error("db down"); } };
    const res = await runGscBackgroundSync(failingDeps);
    expect(res.failed).toBe(1);
  });
});

describe("pure blob helpers", () => {
  it("applyImportToWorkspace leaves the blob unchanged for an unknown project", () => {
    const data: WorkspaceData = { projects: [project("p1", {})], other: "keep" };
    const out = applyImportToWorkspace(structuredClone(data), "missing", makeImport("x"));
    expect(out).toEqual(data);
  });

  it("applyFailureToWorkspace records a short error code without sensitive detail", () => {
    const data: WorkspaceData = { projects: [project("p1", { siteUrl: "https://a.pl/" })] };
    const out = applyFailureToWorkspace(data, "p1", "api_error", NOW.toISOString());
    const p1 = (out.projects as Record<string, any>[])[0];
    expect(p1.gscOAuth.sync.lastAutoSyncErrorCode).toBe("api_error");
    expect(p1.gscOAuth.status).toBeUndefined(); // only 'expired' flips status
    expect(JSON.stringify(out)).not.toMatch(/token|secret/i);
  });
});
