/**
 * AY — producer session ownership registry, against the REAL store session context (fake entity
 * backend). Entries are bound to user+epoch+operation: an old finally never clears a newer
 * session's work, a new user is never blocked by an old key, counts are per current session, and
 * a closing session admits no new work.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { hydrateForUser, resetStore } from "./store";
import {
  beginProducerWork,
  getPendingProducerWork,
  acquireClosingLease,
  isSessionAuthPending,
  isSessionClosing,
  ProducerSessionError,
  resetProducerSessionsForTests,
  rethrowSessionError,
  runOwnedProducer,
  subscribePendingProducerWork,
} from "./producer-session";

const DOC = {
  projects: [{ id: "p1", name: "P" }],
  content: [],
  opportunities: [],
  activeProjectId: "p1",
};

beforeEach(async () => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  h.backend = makeEntityBackend();
  h.backend.state.doc = structuredClone(DOC);
  h.backend.state.rev = 1;
  resetStore();
  resetProducerSessionsForTests();
  await hydrateForUser("user1");
});
afterEach(() => vi.unstubAllGlobals());

describe("beginProducerWork", () => {
  it("captures user+epoch, counts per kind for the current session, releases only its own entry", () => {
    const seen: number[] = [];
    const off = subscribePendingProducerWork(() => seen.push(getPendingProducerWork().unretained));
    const a = beginProducerWork("meta:c1", "unretained");
    const b = beginProducerWork("content:o1:article", "retained");
    expect(a.userId).toBe("user1");
    expect(getPendingProducerWork()).toMatchObject({ unretained: 1, retained: 1, external: 0 });
    expect(getPendingProducerWork().operations.sort()).toEqual(["content:o1:article", "meta:c1"]);
    a.release();
    a.release(); // idempotent
    expect(getPendingProducerWork()).toMatchObject({ unretained: 0, retained: 1 });
    b.release();
    expect(seen).toEqual([1, 1, 0, 0]);
    off();
  });

  it("refuses a duplicate operation in the SAME session only", () => {
    beginProducerWork("meta:c1", "unretained");
    expect(() => beginProducerWork("meta:c1", "unretained")).toThrow(/Already generating/);
    expect(() => beginProducerWork("faq:c1", "unretained")).not.toThrow();
  });

  it("not hydrated / no user → not_ready", () => {
    resetStore();
    expect(() => beginProducerWork("meta:c1", "unretained")).toThrow(ProducerSessionError);
    try {
      beginProducerWork("meta:c1", "unretained");
    } catch (e) {
      expect((e as ProducerSessionError).code).toBe("not_ready");
      expect((e as ProducerSessionError).key).toBe("shell.producer.notReady");
    }
  });

  it("old finally does not clear a new session's work; a new user is not blocked by an old key", async () => {
    const old = beginProducerWork("meta:c1", "unretained");
    resetStore();
    await hydrateForUser("user2"); // new session, same operation id
    expect(getPendingProducerWork().unretained).toBe(0); // the old entry is invisible here
    const fresh = beginProducerWork("meta:c1", "unretained"); // not blocked
    expect(getPendingProducerWork().unretained).toBe(1);
    old.release(); // the old session's finally
    expect(getPendingProducerWork().unretained).toBe(1); // still the new session's entry
    expect(old.isCurrent()).toBe(false);
    expect(() => old.check()).toThrow(ProducerSessionError);
    fresh.release();
    expect(getPendingProducerWork().unretained).toBe(0);
  });

  it("same user, new epoch: the old session is stale even though the user id matches", async () => {
    const old = beginProducerWork("meta:c1", "unretained");
    resetStore();
    await hydrateForUser("user1");
    expect(old.isCurrent()).toBe(false);
    expect(getPendingProducerWork().unretained).toBe(0);
  });

  it("closing lease admits no new work until released; other sessions are unaffected", async () => {
    const lease = acquireClosingLease();
    expect(isSessionClosing()).toBe(true);
    expect(() => beginProducerWork("meta:c1", "unretained")).toThrow(/Sign-out is in progress/);
    resetStore();
    await hydrateForUser("user2");
    expect(isSessionClosing()).toBe(false); // the lease belonged to the old session
    expect(() => beginProducerWork("meta:c1", "unretained")).not.toThrow();
    lease.release();
  });

  it("AZ: only the owner releases a lease; an old lease's release cannot clear a newer session's lease", async () => {
    const old = acquireClosingLease();
    resetStore();
    await hydrateForUser("user2");
    const fresh = acquireClosingLease();
    expect(isSessionClosing()).toBe(true);
    old.release(); // the old flow's cleanup
    expect(fresh.isActive()).toBe(true);
    expect(isSessionClosing()).toBe(true); // user2's admission block survives
    expect(() => beginProducerWork("new-ai", "unretained")).toThrow(/Sign-out is in progress/);
    fresh.release();
    expect(isSessionClosing()).toBe(false);
    fresh.release(); // idempotent
    expect(() => beginProducerWork("new-ai", "unretained")).not.toThrow();
  });
});

describe("runOwnedProducer / rethrowSessionError", () => {
  it("releases on success and on failure; a stale session inside fn throws the typed error", async () => {
    await expect(runOwnedProducer("x", "unretained", async () => 1)).resolves.toBe(1);
    expect(getPendingProducerWork().unretained).toBe(0);
    await expect(
      runOwnedProducer("x", "unretained", async (s) => {
        resetStore();
        await hydrateForUser("user1");
        s.check();
        return 2;
      }),
    ).rejects.toMatchObject({ code: "stale_session" });
    expect(getPendingProducerWork().unretained).toBe(0);
  });

  it("rethrowSessionError keeps fallbacks for ordinary errors but never swallows a session retirement", () => {
    expect(rethrowSessionError(new Error("sitemap unreachable"))).toBeNull();
    expect(() => rethrowSessionError(new ProducerSessionError("stale_session"))).toThrow(
      ProducerSessionError,
    );
  });
});

describe("BA — overlapping leases of the same session", () => {
  it("two attempts of one session each keep their own lease; releasing one leaves the other's barrier", () => {
    const a = acquireClosingLease();
    const b = acquireClosingLease();
    a.markIssued();
    expect(isSessionClosing()).toBe(true);
    expect(isSessionAuthPending()).toBe(true);
    b.release(); // the later attempt's Stay
    expect(a.isActive()).toBe(true);
    expect(isSessionClosing()).toBe(true);
    expect(isSessionAuthPending()).toBe(true);
    expect(() => beginProducerWork("x", "unretained")).toThrow(/Sign-out is in progress/);
    a.release();
    expect(isSessionClosing()).toBe(false);
    expect(isSessionAuthPending()).toBe(false);
  });

  it("an issued lease of an OLD session never blocks or shows as pending for a new session", async () => {
    const old = acquireClosingLease();
    old.markIssued();
    resetStore();
    await hydrateForUser("user1");
    expect(isSessionClosing()).toBe(false);
    expect(isSessionAuthPending()).toBe(false);
    old.release();
  });
});
