// Synthetic workspace store for the CG-03C manual-capture fixture. Keeps the real store's reading contract
// (useSyncExternalStore with the same selector cache and shallow equality) over in-page memory, and a LIVE
// session epoch the fixture can retire (sign-out, another account, same-actor re-sign-in) exactly as
// resetStore/hydrateForUser advance it. build.cjs turns every OTHER export of src/lib/store.ts into a
// recorded refusal, so nothing can reach real persistence.
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
  record("store.setState", {});
  emit();
};
export const reloadWorkspaceForUser = async (userId) => {
  record("store.reloadWorkspaceForUser", { userId });
  return "applied";
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
const SAVED = { kind: "saved" };
export const useWorkspaceSaveStatus = () => SAVED;
export const getWorkspaceSaveStatus = () => SAVED;
export const subscribeWorkspaceSaveStatus = () => () => {};
export const getWorkspaceSaveContext = () => ({
  epoch: fixture.epoch,
  userId: fixture.state.userId,
  hydrated: fixture.state.hydrated,
});
export const hasUnsavedWorkspaceChanges = () => false;
export const saveWorkspaceNow = async () => {
  record("store.saveWorkspaceNow", {});
};
export const uid = () => Math.random().toString(36).slice(2, 10);
export const isSampleId = () => false;
export const hasSampleData = () => false;
// The real AppShell project picker calls this; the modal must make it unreachable while an entry is open.
export const setActiveProject = (id) => {
  record("store.setActiveProject", { id });
  fixture.state = { ...fixture.state, activeProjectId: id };
  emit();
};
export class ProjectLimitError extends Error {}
