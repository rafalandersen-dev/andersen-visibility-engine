// Synthetic workspace store for the CG-02A task-continuity fixture. It keeps the real
// store's reading contract (useSyncExternalStore with the same selector cache and
// shallow equality, so filtered selectors behave exactly as in the app) over in-page
// memory. Every write is recorded for the report; build.cjs turns every OTHER export of
// src/lib/store.ts into a recorded refusal, so a route can never reach real persistence.
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
  epoch: 1,
  userId: fixture.state.userId,
  hydrated: fixture.state.hydrated,
});
export const hasUnsavedWorkspaceChanges = () => false;
export const saveWorkspaceNow = async () => {
  record("store.saveWorkspaceNow", {});
};
// The requested-asset recovery may ask for one bounded reload; the fixture answers
// with "applied" (fresh truth, nothing new) so an absent id stays "missing".
export const reloadWorkspaceForUser = async (userId) => {
  record("store.reloadWorkspaceForUser", { userId });
  return "applied";
};
export const uid = () => Math.random().toString(36).slice(2, 10);
export const isSampleId = () => false;
export const hasSampleData = () => false;
export const setActiveProject = (id) => {
  record("store.setActiveProject", { id });
  fixture.state = { ...fixture.state, activeProjectId: id };
  emit();
};
// The editor's explicit Delete confirmation is the one write the fixture performs (in memory), so
// the R1 deletion journeys run through the real dialog. Every call is recorded with its check step.
export const deleteContentAsset = (id) => {
  record("store.deleteContentAsset", { id });
  fixture.state = { ...fixture.state, content: fixture.state.content.filter((c) => c.id !== id) };
  fixture.onDelete?.(id);
  emit();
};
// Other writes a route could make from an explicit control. Navigation must never call them;
// the report lists every call, and the scripted check asserts none happened.
const write = (name) => (id, patch) => {
  record("store." + name, { id, patch });
  throw Error(`Fixture refuses store.${name}: navigation must not write.`);
};
export const upsertContent = write("upsertContent");
export const updateOpportunity = write("updateOpportunity");
export const transitionOpportunity = write("transitionOpportunity");
export const archiveOpportunity = write("archiveOpportunity");
export const restoreOpportunity = write("restoreOpportunity");
export const addOpportunity = write("addOpportunity");
export const clearSampleData = write("clearSampleData");
export class ProjectLimitError extends Error {}
