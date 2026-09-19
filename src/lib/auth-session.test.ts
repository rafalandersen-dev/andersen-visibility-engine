import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { observeAuthSession, type AuthSessionSnapshot } from "./auth-session";

const session = (id: string) => ({ user: { id } }) as Session;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function fixture(syncEvent?: Session) {
  const initial = deferred<{ data: { session: Session | null }; error?: unknown }>();
  let event!: (event: string, value: Session | null) => void;
  const unsubscribe = vi.fn();
  const source = {
    getSession: vi.fn(() => initial.promise),
    onAuthStateChange: vi.fn((callback: typeof event) => {
      event = callback;
      if (syncEvent) callback("SIGNED_IN", syncEvent);
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  const roles = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(false);
  const updates: AuthSessionSnapshot[] = [];
  const observer = observeAuthSession(source, roles, (snapshot) => updates.push(snapshot));
  return {
    initial,
    roles,
    updates,
    observer,
    unsubscribe,
    event: (value: Session | null) => event(value ? "SIGNED_IN" : "SIGNED_OUT", value),
    last: () => updates.at(-1)!,
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("loads the initial account when no later event supersedes it", async () => {
  const h = fixture();
  h.roles.mockResolvedValueOnce(true);
  h.initial.resolve({ data: { session: session("initial") } });
  await Promise.resolve();
  expect(h.last()).toMatchObject({
    loading: false,
    session: { user: { id: "initial" } },
    isOwner: false,
    roleLoaded: false,
  });
  await vi.runOnlyPendingTimersAsync();
  expect(h.roles).toHaveBeenCalledExactlyOnceWith("initial");
  expect(h.last()).toMatchObject({ isOwner: true, roleLoaded: true });
  h.observer.dispose();
});

it("defers role requests outside auth callbacks and does not keep session loading behind them", async () => {
  const h = fixture();
  const role = deferred<boolean>();
  h.roles.mockReturnValueOnce(role.promise);
  h.event(session("owner"));
  expect(h.roles).not.toHaveBeenCalled();
  expect(h.last()).toMatchObject({ loading: false, isOwner: false, roleLoaded: false });
  await vi.runOnlyPendingTimersAsync();
  expect(h.roles).toHaveBeenCalledWith("owner");
  role.resolve(true);
  await role.promise;
  expect(h.last()).toMatchObject({ isOwner: true, roleLoaded: true });
  h.observer.dispose();
});

it.each(["success", "rejection"])(
  "a late initial session %s cannot overwrite a newer auth event",
  async (outcome) => {
    const h = fixture();
    h.event(session("current"));
    if (outcome === "success") h.initial.resolve({ data: { session: session("old") } });
    else h.initial.reject(new Error("unavailable"));
    await Promise.resolve();
    expect(h.last().session?.user.id).toBe("current");
    await vi.runOnlyPendingTimersAsync();
    expect(h.roles).toHaveBeenCalledExactlyOnceWith("current");
    h.observer.dispose();
  },
);

it("a synchronous subscription event also supersedes the initial read", async () => {
  const h = fixture(session("current"));
  h.initial.resolve({ data: { session: session("old") } });
  await Promise.resolve();
  expect(h.last().session?.user.id).toBe("current");
  h.observer.dispose();
});

it.each(["success", "rejection"])(
  "an old role %s cannot modify another account",
  async (outcome) => {
    const h = fixture(),
      old = deferred<boolean>();
    h.roles.mockReturnValueOnce(old.promise).mockResolvedValueOnce(false);
    h.event(session("old"));
    await vi.runOnlyPendingTimersAsync();
    h.event(session("current"));
    expect(h.last()).toMatchObject({ isOwner: false, roleLoaded: false });
    await vi.runOnlyPendingTimersAsync();
    const before = h.updates.length;
    if (outcome === "success") old.resolve(true);
    else old.reject(new Error("old role failed"));
    await Promise.resolve();
    expect(h.updates).toHaveLength(before);
    expect(h.last()).toMatchObject({
      session: { user: { id: "current" } },
      isOwner: false,
      roleLoaded: true,
    });
    h.observer.dispose();
  },
);

it("a confirmed owner role is immediately removed when another account arrives", async () => {
  const h = fixture();
  h.roles.mockResolvedValueOnce(true);
  h.event(session("owner"));
  await vi.runOnlyPendingTimersAsync();
  expect(h.last().isOwner).toBe(true);
  h.event(session("member"));
  expect(h.last()).toMatchObject({
    session: { user: { id: "member" } },
    isOwner: false,
    roleLoaded: false,
  });
  h.observer.dispose();
});

it("sign-out invalidates an old role even after signing back into the same account", async () => {
  const h = fixture(),
    old = deferred<boolean>();
  h.roles.mockReturnValueOnce(old.promise).mockResolvedValueOnce(false);
  h.event(session("same"));
  await vi.runOnlyPendingTimersAsync();
  h.event(null);
  expect(h.last()).toEqual({ loading: false, session: null, isOwner: false, roleLoaded: true });
  h.event(session("same"));
  await vi.runOnlyPendingTimersAsync();
  old.resolve(true);
  await old.promise;
  expect(h.last()).toMatchObject({ isOwner: false, roleLoaded: true });
  h.observer.dispose();
});

it("only the newest explicit role refresh can settle role state, and failure remains unknown", async () => {
  const h = fixture(),
    old = deferred<boolean>();
  h.event(session("current"));
  await vi.runOnlyPendingTimersAsync();
  h.roles.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error("role failed"));
  const first = h.observer.refreshRole();
  await h.observer.refreshRole();
  old.resolve(true);
  await first;
  expect(h.last()).toMatchObject({ isOwner: false, roleLoaded: false });
  h.observer.dispose();
});

it.each(["resolved-error", "rejection"])(
  "a failed initial session %s finishes without granting a session",
  async (outcome) => {
    const h = fixture();
    if (outcome === "resolved-error")
      h.initial.resolve({ data: { session: session("untrusted") }, error: new Error("invalid") });
    else h.initial.reject(new Error("unavailable"));
    await Promise.resolve();
    expect(h.last()).toEqual({ loading: false, session: null, isOwner: false, roleLoaded: true });
    expect(h.roles).not.toHaveBeenCalled();
    h.observer.dispose();
  },
);

it("disposal cancels deferred role dispatch and suppresses a late initial response", async () => {
  const h = fixture();
  h.event(session("current"));
  h.observer.dispose();
  const count = h.updates.length;
  h.initial.resolve({ data: { session: session("old") } });
  await vi.runOnlyPendingTimersAsync();
  await h.observer.refreshRole();
  h.event(session("late"));
  expect(h.updates).toHaveLength(count);
  expect(h.roles).not.toHaveBeenCalled();
  expect(h.unsubscribe).toHaveBeenCalledOnce();
});

it("a role already in flight cannot publish after disposal", async () => {
  const h = fixture(),
    role = deferred<boolean>();
  h.roles.mockReturnValueOnce(role.promise);
  h.event(session("current"));
  await vi.runOnlyPendingTimersAsync();
  h.observer.dispose();
  const count = h.updates.length;
  role.resolve(true);
  await role.promise;
  expect(h.updates).toHaveLength(count);
});
