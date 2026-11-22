// Synthetic workspace store for the native Google intake fixture. Keeps the real store's reading
// contract (useSyncExternalStore with the selector cache and shallow equality) over in-page memory,
// plus a LIVE session epoch the fixture can retire (sign-out, same-actor re-sign-in, project switch).
// build.cjs turns every OTHER export of src/lib/store.ts into a recorded refusal.
//
// The store machinery is exported as `createWorkspaceStore(fixture)` so a sibling fixture (the
// native-findings browser fixture) binds the SAME subscription contract to its own fixture singleton
// instead of copying it; this module keeps its own top-level exports (so the build's export scanner
// still sees them) bound to THIS folder's fixture.
import { useRef, useSyncExternalStore } from "react";
import { createSelectorCache } from "@/lib/selector-cache";
import { fixture, record } from "./fixture.js";

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

// Bind the real store reading contract to a given fixture singleton. The fixture carries `.state`; this
// attaches the live notification source (`fixture.emit`/`fixture.subscribe`) so BOTH the store and a
// reactive auth can observe the same session changes.
export function createWorkspaceStore(fx, { recordFn } = {}) {
  const listeners = new Set();
  const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
  const emit = () => listeners.forEach((fn) => fn());
  fx.emit = emit;
  fx.subscribe = subscribe;
  const getState = () => fx.state;
  const setState = (updater) => {
    fx.state = updater(fx.state);
    recordFn?.("store.setState");
    emit();
  };
  function useStore(selector) {
    const cache = useRef(null);
    if (!cache.current) cache.current = createSelectorCache(shallowEqual);
    return useSyncExternalStore(
      subscribe,
      () => cache.current.read(fx.state, selector),
      () => cache.current.read(fx.state, selector),
    );
  }
  const getWorkspaceSaveContext = () => ({
    epoch: fx.epoch,
    userId: fx.state.userId,
    hydrated: fx.state.hydrated,
  });
  return { subscribe, getState, setState, useStore, getWorkspaceSaveContext };
}

const store = createWorkspaceStore(fixture, { recordFn: record });
export const getState = store.getState;
export const setState = store.setState;
export const useStore = store.useStore;
export const getWorkspaceSaveContext = store.getWorkspaceSaveContext;
