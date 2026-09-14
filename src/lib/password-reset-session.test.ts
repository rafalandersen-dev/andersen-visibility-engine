import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { observePasswordResetSession } from "./password-reset-session";
const session = { user: { id: "synthetic" } };
function source() {
  let event: (name: string, session: unknown | null) => void = () => {};
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn((callback: typeof event) => {
      event = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  return { auth, unsubscribe, emit: (name: string, value: unknown | null) => event(name, value) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("accepts an existing session and cancels the delayed check", async () => {
  const s = source(),
    update = vi.fn();
  s.auth.getSession.mockResolvedValue({ data: { session } });
  const stop = observePasswordResetSession(s.auth, update);
  await vi.advanceTimersByTimeAsync(8000);
  expect(update.mock.calls).toEqual([["checking"], ["ready"]]);
  expect(s.auth.getSession).toHaveBeenCalledOnce();
  stop();
});
it("waits eight seconds and rechecks before declaring a missing session invalid", async () => {
  const s = source(),
    update = vi.fn();
  const stop = observePasswordResetSession(s.auth, update);
  await vi.advanceTimersByTimeAsync(7999);
  expect(update.mock.calls).toEqual([["checking"]]);
  await vi.advanceTimersByTimeAsync(1);
  expect(update).toHaveBeenLastCalledWith("invalid");
  expect(s.auth.getSession).toHaveBeenCalledTimes(2);
  stop();
});
it("contains initial lookup rejection and accepts a later recovery event", async () => {
  const s = source(),
    update = vi.fn();
  s.auth.getSession.mockRejectedValueOnce(new Error("synthetic transport failure"));
  const stop = observePasswordResetSession(s.auth, update);
  await vi.advanceTimersByTimeAsync(1);
  s.emit("PASSWORD_RECOVERY", session);
  await vi.advanceTimersByTimeAsync(8000);
  expect(update.mock.calls).toEqual([["checking"], ["ready"]]);
  stop();
});
it("revokes readiness on sign-out and ignores a stale successful lookup", async () => {
  const s = source(),
    update = vi.fn();
  let resolve!: (value: { data: { session: unknown } }) => void;
  s.auth.getSession.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const stop = observePasswordResetSession(s.auth, update);
  s.emit("SIGNED_IN", session);
  s.emit("SIGNED_OUT", null);
  resolve({ data: { session } });
  await vi.advanceTimersByTimeAsync(8000);
  expect(update.mock.calls).toEqual([["checking"], ["ready"], ["invalid"]]);
  stop();
});
it("does not let a stale final check override a recovery event", async () => {
  const s = source(),
    update = vi.fn();
  let resolve!: (value: { data: { session: null } }) => void;
  s.auth.getSession.mockResolvedValueOnce({ data: { session: null } }).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const stop = observePasswordResetSession(s.auth, update);
  await vi.advanceTimersByTimeAsync(8000);
  s.emit("PASSWORD_RECOVERY", session);
  resolve({ data: { session: null } });
  await vi.advanceTimersByTimeAsync(1);
  expect(update.mock.calls).toEqual([["checking"], ["ready"]]);
  stop();
});
it("ignores callbacks and late lookups after cleanup", async () => {
  const s = source(),
    update = vi.fn();
  let resolve!: (value: { data: { session: unknown } }) => void;
  s.auth.getSession.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const stop = observePasswordResetSession(s.auth, update);
  stop();
  resolve({ data: { session } });
  s.emit("SIGNED_IN", session);
  await vi.advanceTimersByTimeAsync(8000);
  expect(update.mock.calls).toEqual([["checking"]]);
  expect(s.unsubscribe).toHaveBeenCalledOnce();
  expect(s.auth.getSession).toHaveBeenCalledOnce();
});
it("requires a session on a recovery event and contains final lookup rejection", async () => {
  const s = source(),
    update = vi.fn();
  s.auth.getSession.mockRejectedValue(new Error("synthetic failure"));
  const stop = observePasswordResetSession(s.auth, update);
  s.emit("PASSWORD_RECOVERY", null);
  await vi.advanceTimersByTimeAsync(8000);
  expect(update.mock.calls).toEqual([["checking"], ["invalid"]]);
  stop();
});

it("also cancels the timer if subscription immediately reports a session", async () => {
  const s = source(),
    update = vi.fn();
  s.auth.onAuthStateChange.mockImplementation((callback) => {
    callback("SIGNED_IN", session);
    return { data: { subscription: { unsubscribe: s.unsubscribe } } };
  });
  const stop = observePasswordResetSession(s.auth, update);
  await vi.advanceTimersByTimeAsync(8000);
  expect(update.mock.calls).toEqual([["checking"], ["ready"]]);
  expect(s.auth.getSession).toHaveBeenCalledOnce();
  stop();
});
