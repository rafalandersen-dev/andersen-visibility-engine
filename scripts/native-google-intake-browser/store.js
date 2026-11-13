// Synthetic workspace store for the native Google intake fixture. Keeps the real store's reading
// contract (useSyncExternalStore with the selector cache and shallow equality) over in-page memory,
// plus a LIVE session epoch the fixture can retire (sign-out, same-actor re-sign-in, project switch).
// build.cjs turns every OTHER export of src/lib/store.ts into a recorded refusal.
import { useRef, useSyncExternalStore } from "react";
import { createSelectorCache } from "@/lib/selector-cache";
import { fixture, record } from "./fixture.js";

const listeners = new Set();
const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());
fixture.emit = emit;
const shallowEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a);
    return ak.length === Object.keys(b).length && ak.every((k) => Object.is(a[k], b[k]));
  }
  return false;
};
export const getState = () => fixture.state;
export const setState = (updater) => {
  fixture.state = updater(fixture.state);
  record("store.setState");
  emit();
};
export function useStore(selector) {
  const cache = useRef(null);
  if (!cache.current) cache.current = createSelectorCache(shallowEqual);
  return useSyncExternalStore(
    subscribe,
    () => cache.current.read(fixture.state, selector),
    () => cache.current.read(fixture.state, selector),
  );
}
export const getWorkspaceSaveContext = () => ({
  epoch: fixture.epoch,
  userId: fixture.state.userId,
  hydrated: fixture.state.hydrated,
});
