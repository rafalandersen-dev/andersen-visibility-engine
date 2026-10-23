/**
 * CX — an explicitly requested draft created on the server after the tab loaded
 * (23 October 2026).
 *
 * Live repro: the owner kept /app/setup open while the weekly cron created the
 * Saturday draft. The approval notification opened /app/editor?id=<draft>, but the
 * client still held the earlier 53-item workspace, so the editor showed "No asset
 * selected" until a full browser reload. Recovery reuses reloadWorkspaceForUser:
 * one bounded read per request, never over unsaved local changes, and a draft that
 * fresh server truth still lacks stays generically missing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";
import { recoverRequestedAsset, requestedAssetStatus } from "./requested-asset";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
  bundleReads: 0,
  /** When set, the next bundle read returns this instead of the fake backend. */
  nextRead: null as null | (() => unknown),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "read_workspace_bundle") {
        h.bundleReads += 1;
        const next = h.nextRead;
        h.nextRead = null;
        if (next) return next();
      }
      return h.backend.rpc(fn, args);
    },
  },
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import {
  getState,
  hydrateForUser,
  reloadWorkspaceForUser,
  resetStore,
  WORKSPACE_RELOAD_TIMEOUT_MS,
  setActiveProject,
  upsertContent,
} from "./store";
import type { ContentAsset } from "./types";

const WEEKLY = "5bba0646-518a-4051-ac5b-215b76194727";
const asset = (id: string, projectId = "synergy", title = `Draft ${id}`) =>
  ({
    id,
    projectId,
    title,
    status: "Draft",
    body: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  }) as unknown as ContentAsset;
const existing = Array.from({ length: 53 }, (_, i) => asset(`existing-${i}`));

const seedServer = (rev: number, content: ContentAsset[]) => {
  h.backend.state.doc = {
    projects: [{ id: "synergy", businessName: "Synergy" }],
    content,
    activeProjectId: "synergy",
  };
  h.backend.state.rev = rev;
};
const has = (id: string) => getState().content.some((c) => c.id === id);
const recover = (id: string, userId = "owner") =>
  recoverRequestedAsset(id, { userId, reload: reloadWorkspaceForUser, has });

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  h.bundleReads = 0;
  h.nextRead = null;
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CX requested draft created in the background after the workspace loaded", () => {
  it("a clean stale workspace reads once and then shows the background-created draft", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    expect(getState().content).toHaveLength(53);
    const reads = h.bundleReads;

    // Background weekly content stage saves the 54th draft on the server.
    seedServer(41, [...existing, asset(WEEKLY, "synergy", "Saturday weekly draft")]);
    expect(has(WEEKLY)).toBe(false); // the reproduced stale snapshot

    expect(await recover(WEEKLY)).toBe("present");
    expect(h.bundleReads).toBe(reads + 1); // exactly one bounded read
    expect(getState().content).toHaveLength(54);
    expect(getState().content.find((c) => c.id === WEEKLY)?.title).toBe("Saturday weekly draft");
    expect(getState().rev).toBe(41);
  });

  it("the notification's Open (same active project) keeps the workspace clean and recovers", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    seedServer(41, [...existing, asset(WEEKLY)]);
    setActiveProject("synergy"); // Open task: setActiveProject(item.project_id), then navigate
    expect(await recover(WEEKLY)).toBe("present");
  });

  it("an asset already present never triggers a read", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    const reads = h.bundleReads;
    expect(await recover("existing-7")).toBe("present");
    expect(h.bundleReads).toBe(reads);
  });

  it("fresh server truth without the draft is generically missing, with one read and no leak", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    const reads = h.bundleReads;
    // Removed, revoked or never this account's: the account bundle does not contain it.
    expect(await recover("not-this-accounts-draft")).toBe("missing");
    expect(h.bundleReads).toBe(reads + 1);
    expect(getState().content).toHaveLength(53);
  });

  it("unsaved local edits are never overwritten: no read, edit kept, status unsaved", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    const reads = h.bundleReads;
    upsertContent({ ...existing[3], title: "Owner's unsaved title" });
    seedServer(41, [...existing, asset(WEEKLY)]);

    expect(await recover(WEEKLY)).toBe("unsaved");
    expect(h.bundleReads).toBe(reads); // refused before any read
    expect(has(WEEKLY)).toBe(false);
    expect(getState().content.find((c) => c.id === "existing-3")?.title).toBe(
      "Owner's unsaved title",
    );
    expect(getState().rev).toBe(40);
  });

  it("an edit made while the read is in flight wins: the bundle is discarded", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    seedServer(41, [...existing, asset(WEEKLY)]);

    const pending = recover(WEEKLY);
    upsertContent({ ...existing[5], title: "Typed during the read" }); // before the read resolves
    expect(await pending).toBe("unsaved");
    expect(has(WEEKLY)).toBe(false);
    expect(getState().content.find((c) => c.id === "existing-5")?.title).toBe(
      "Typed during the read",
    );
    expect(getState().rev).toBe(40);
  });

  it("a failed read is bounded and leaves the workspace untouched", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    const reads = h.bundleReads;
    seedServer(41, [...existing, asset(WEEKLY)]);
    h.backend.state.errors.read = { message: "unavailable" };

    expect(await recover(WEEKLY)).toBe("unavailable");
    expect(h.bundleReads).toBe(reads + 1); // one attempt, no automatic repeat
    expect(getState().content).toHaveLength(53);
    expect(getState().rev).toBe(40);

    // Only an explicit retry reads again; it then succeeds.
    h.backend.state.errors = {};
    expect(await recover(WEEKLY)).toBe("present");
    expect(h.bundleReads).toBe(reads + 2);
  });

  it("another signed-in user's request never reads or applies (account isolation)", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    const reads = h.bundleReads;
    seedServer(41, [...existing, asset(WEEKLY)]);
    expect(await recover(WEEKLY, "someone-else")).toBe("unavailable");
    expect(h.bundleReads).toBe(reads);
    expect(has(WEEKLY)).toBe(false);
  });
});

describe("CX reload deadline (stalled network)", () => {
  /** A held read: resolves only when the test releases it. */
  const held = () => {
    let release!: (value: unknown) => void;
    const promise = new Promise((resolve) => (release = resolve));
    return { promise, release };
  };
  const serverBundle = async () =>
    ((await h.backend.rpc("read_workspace_bundle", { p_user_id: "owner" })) as { data: unknown })
      .data;

  it("a stalled read ends unavailable at the deadline and its late response never applies", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    seedServer(41, [...existing, asset(WEEKLY)]);
    const stalled = held();
    h.nextRead = () => stalled.promise;
    vi.useFakeTimers();

    const pending = recover(WEEKLY);
    await vi.advanceTimersByTimeAsync(WORKSPACE_RELOAD_TIMEOUT_MS - 1);
    let settled: string | undefined;
    void pending.then((s) => (settled = s));
    await Promise.resolve();
    expect(settled).toBeUndefined(); // still within the deadline
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("unavailable");

    // The network answers late with the new draft: nothing may change.
    stalled.release({ data: await serverBundle(), error: null });
    await vi.runAllTimersAsync();
    expect(has(WEEKLY)).toBe(false);
    expect(getState().content).toHaveLength(53);
    expect(getState().rev).toBe(40);
    vi.useRealTimers();

    // Only an explicit retry reads again.
    expect(await recover(WEEKLY)).toBe("present");
    expect(getState().rev).toBe(41);
  });

  it("aborts the client request at the deadline when the client supports abort", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    const stalled = held();
    let signal: AbortSignal | undefined;
    h.nextRead = () =>
      Object.assign(stalled.promise, {
        abortSignal(s: AbortSignal) {
          signal = s;
          return stalled.promise;
        },
      });
    vi.useFakeTimers();
    const pending = reloadWorkspaceForUser("owner");
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(WORKSPACE_RELOAD_TIMEOUT_MS);
    expect(await pending).toBe("unavailable");
    expect(signal?.aborted).toBe(true);
  });

  it("a timely read clears its own deadline timer", async () => {
    seedServer(40, existing);
    await hydrateForUser("owner");
    seedServer(41, [...existing, asset(WEEKLY)]);
    const set = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    expect(await reloadWorkspaceForUser("owner")).toBe("applied");
    const deadline = set.mock.calls.findIndex((c) => c[1] === WORKSPACE_RELOAD_TIMEOUT_MS);
    expect(deadline).toBeGreaterThanOrEqual(0);
    expect(clear).toHaveBeenCalledWith(set.mock.results[deadline].value);
    set.mockRestore();
    clear.mockRestore();
  });
});

describe("CX requested-asset status mapping", () => {
  it.each([
    ["applied", true, "present"],
    ["applied", false, "missing"],
    ["unsaved", false, "unsaved"],
    ["unavailable", false, "unavailable"],
    ["skipped", false, "unavailable"],
  ] as const)("reload %s, found %s → %s", (result, found, status) => {
    expect(requestedAssetStatus(result, found)).toBe(status);
  });

  it("calls the reload at most once per recovery attempt", async () => {
    const reload = vi.fn().mockResolvedValue("applied");
    expect(await recoverRequestedAsset("a", { userId: "u", reload, has: () => false })).toBe(
      "missing",
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith("u");
  });
});
