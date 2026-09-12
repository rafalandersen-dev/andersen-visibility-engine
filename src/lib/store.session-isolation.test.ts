import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";

const h = vi.hoisted(() => ({ rpc: vi.fn(), legacy: vi.fn(), entitlement: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.legacy }) }) }),
  },
}));
vi.mock("./entitlements.functions", () => ({ getMyEntitlementFn: h.entitlement }));
import {
  getState,
  hydrateForUser,
  refreshEntitlement,
  reloadWorkspaceForUser,
  resetStore,
  saveWorkspaceNow,
  setState,
} from "./store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
type Response = { data: unknown; error: unknown };
async function bundle(id: string): Promise<Response> {
  const backend = makeEntityBackend();
  backend.state.doc = { projects: [{ id, businessName: id }], activeProjectId: id };
  return backend.rpc("read_workspace_bundle", {});
}
const free = { entitlement: { planId: "freePreview" } };
const paid = { entitlement: { planId: "agency", status: "active" } };

beforeEach(() => {
  vi.stubGlobal("window", globalThis);
  vi.resetAllMocks();
  resetStore();
  h.entitlement.mockResolvedValue(free);
});
afterEach(() => {
  resetStore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("workspace session isolation", () => {
  it.each(["success", "error", "rejection"])(
    "ignores old-account hydration %s after a switch",
    async (outcome) => {
      const old = deferred<Response>();
      h.rpc.mockReturnValueOnce(old.promise).mockResolvedValueOnce(await bundle("new"));
      const loading = hydrateForUser("old");
      await hydrateForUser("new");
      const current = getState();
      if (outcome === "rejection") old.reject(new Error("late failure"));
      else
        old.resolve(
          outcome === "success"
            ? await bundle("old")
            : { data: null, error: { message: "late failure" } },
        );
      await loading;
      expect(getState()).toBe(current);
      expect(h.entitlement).toHaveBeenCalledTimes(1);
      h.rpc.mockClear();
      await saveWorkspaceNow();
      expect(h.rpc).not.toHaveBeenCalled(); // Stale read did not replace the diff baseline.
    },
  );

  it("does not restore a workspace after sign-out", async () => {
    const old = deferred<Response>();
    h.rpc.mockReturnValueOnce(old.promise);
    const loading = hydrateForUser("old");
    resetStore();
    const signedOut = getState();
    old.resolve(await bundle("old"));
    await loading;
    expect(getState()).toBe(signedOut);
    expect(h.entitlement).not.toHaveBeenCalled();
  });

  it("keeps the newer hydration attempt for the same account", async () => {
    const old = deferred<Response>();
    h.rpc.mockReturnValueOnce(old.promise).mockResolvedValueOnce(await bundle("newer"));
    const loading = hydrateForUser("owner");
    await hydrateForUser("owner");
    old.resolve(await bundle("older"));
    await loading;
    expect(getState().activeProjectId).toBe("newer");
  });

  it("does not backfill an obsolete legacy response", async () => {
    const legacy = deferred<Response>();
    h.rpc.mockResolvedValueOnce({ data: null, error: null });
    h.legacy.mockReturnValueOnce(legacy.promise);
    const loading = hydrateForUser("old");
    await vi.waitFor(() => expect(h.legacy).toHaveBeenCalled());
    resetStore();
    legacy.resolve({ data: { data: { projects: [{ id: "old" }] } }, error: null });
    await loading;
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(getState().hydrated).toBe(false);
  });

  it("ignores a backfill completion after sign-out", async () => {
    const backfill = deferred<Response>();
    h.rpc.mockResolvedValueOnce({ data: null, error: null }).mockReturnValueOnce(backfill.promise);
    h.legacy.mockResolvedValue({ data: { data: {} }, error: null });
    const loading = hydrateForUser("old");
    await vi.waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));
    resetStore();
    const signedOut = getState();
    backfill.resolve({ data: true, error: null });
    await loading;
    expect(getState()).toBe(signedOut);
  });

  it("ignores an old reload after signing back into the same account", async () => {
    h.rpc.mockResolvedValueOnce(await bundle("initial"));
    await hydrateForUser("owner");
    const old = deferred<Response>();
    h.rpc.mockReturnValueOnce(old.promise);
    const reloading = reloadWorkspaceForUser("owner");
    resetStore();
    h.rpc.mockResolvedValueOnce(await bundle("new"));
    await hydrateForUser("owner");
    old.resolve(await bundle("stale"));
    await reloading;
    expect(getState().activeProjectId).toBe("new");
  });

  it.each(["success", "rejection"])(
    "ignores obsolete entitlement %s without changing the new account",
    async (outcome) => {
      h.rpc.mockResolvedValueOnce(await bundle("old"));
      await hydrateForUser("old");
      const old = deferred<typeof paid>();
      h.entitlement.mockReturnValueOnce(old.promise);
      const refreshing = refreshEntitlement();
      await vi.waitFor(() => expect(h.entitlement).toHaveBeenCalledTimes(2));
      resetStore();
      h.rpc.mockResolvedValueOnce(await bundle("new"));
      h.entitlement.mockResolvedValueOnce(paid);
      await hydrateForUser("new");
      const current = getState();
      if (outcome === "rejection") old.reject(new Error("late failure"));
      else old.resolve(paid);
      await refreshing;
      expect(getState()).toBe(current);
      expect(getState().subscription?.planId).toBe("agency");
    },
  );
});

describe("workspace save session isolation", () => {
  beforeEach(() => vi.useFakeTimers());

  async function startSave() {
    h.rpc.mockResolvedValueOnce(await bundle("initial"));
    await hydrateForUser("owner");
    setState((s) => ({ ...s, activeProjectId: "edited" }));
    const response = deferred<Response>();
    h.rpc.mockReturnValueOnce(response.promise);
    const result = saveWorkspaceNow().then(
      () => "saved",
      (error: Error) => error.message,
    );
    await vi.waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));
    return { response, result };
  }

  it("rejects queued old-session saves without writing the new account's edits", async () => {
    const { response, result } = await startSave();
    const queued = saveWorkspaceNow().then(
      () => "saved",
      (error: Error) => error.message,
    );
    resetStore();
    h.rpc.mockResolvedValueOnce(await bundle("new"));
    await hydrateForUser("new-owner");
    setState((s) => ({ ...s, activeProjectId: "new-edit" }));
    response.resolve({ data: 2, error: null });
    expect(await result).toContain("workspace session changed");
    expect(await queued).toContain("workspace session changed");
    expect(h.rpc).toHaveBeenCalledTimes(3);
    h.rpc.mockResolvedValueOnce({ data: 3, error: null });
    await saveWorkspaceNow();
    expect(h.rpc).toHaveBeenLastCalledWith(
      "apply_workspace_entity_batch",
      expect.objectContaining({
        p_user_id: "new-owner",
        p_meta: expect.objectContaining({ activeProjectId: "new-edit" }),
      }),
    );
  });

  it("keeps the new same-account baseline and revision after an old write succeeds", async () => {
    const { response, result } = await startSave();
    resetStore();
    h.rpc.mockResolvedValueOnce(await bundle("new"));
    await hydrateForUser("owner");
    const current = getState();
    response.resolve({ data: 99, error: null });
    expect(await result).toContain("workspace session changed");
    expect(getState()).toBe(current);
    h.rpc.mockClear();
    await saveWorkspaceNow();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not start legacy backfill from an obsolete save response", async () => {
    const { response, result } = await startSave();
    resetStore();
    response.resolve({ data: null, error: { message: "workspace_not_migrated" } });
    expect(await result).toContain("workspace session changed");
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])(
    "does not advance state or retry after obsolete backfill created=%s",
    async (created) => {
      const { response, result } = await startSave();
      const backfill = deferred<Response>();
      h.rpc.mockReturnValueOnce(backfill.promise);
      response.resolve({ data: null, error: { message: "workspace_not_migrated" } });
      await vi.waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(3));
      resetStore();
      h.rpc.mockResolvedValueOnce(await bundle("new"));
      await hydrateForUser("owner");
      const current = getState();
      backfill.resolve({ data: created, error: null });
      expect(await result).toContain("workspace session changed");
      expect(getState()).toBe(current);
      expect(h.rpc).toHaveBeenCalledTimes(4);
      h.rpc.mockClear();
      await saveWorkspaceNow();
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );
});
