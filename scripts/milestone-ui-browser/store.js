import { useRef, useSyncExternalStore } from "react";
import { fixture, record } from "./fixture.js";
const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = () => listeners.forEach((fn) => fn());
export const getState = () => fixture.state;
export const setState = (fn) => {
  fixture.state = fn(fixture.state);
  emit();
};
const shallowEqual = (a, b) =>
  Object.is(a, b) ||
  (a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.is(a[k], b[k])));
export const useStore = (selector) => {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const selected = selector(state);
  const ref = useRef(selected);
  if (!shallowEqual(ref.current, selected)) ref.current = selected;
  return ref.current;
};
export const saveWorkspaceNow = async () => {
  record("saveWorkspaceNow", {});
  if (fixture.failSave) throw Error("Synthetic save refusal");
  fixture.saved = structuredClone(fixture.state);
  emit();
};
export const updateProject = (id, patch) => {
  record("updateProject", { id, patch });
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
};
export const updateProjectPublishingSettings = updateProject;
export const updateProjectConnector = updateProject;
export class ProjectLimitError extends Error {}
export const addProject = (p) => {
  const id = "fixture-new-" + Date.now();
  record("addProject", { id });
  setState((s) => ({ ...s, projects: [...s.projects, { ...p, id }], activeProjectId: id }));
  return id;
};
export const upsertContent = (a) => {
  record("upsertContent", { id: a.id, status: a.status, title: a.title });
  setState((s) => ({
    ...s,
    content: s.content.some((x) => x.id === a.id)
      ? s.content.map((x) => (x.id === a.id ? a : x))
      : [...s.content, a],
  }));
};
export const deleteContentAsset = (id) => {
  record("deleteContentAsset", { id });
  setState((s) => ({ ...s, content: s.content.filter((x) => x.id !== id) }));
};
export const updateOpportunity = (id, patch) => {
  record("updateOpportunity", { id, patch });
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.map((x) => (x.id === id ? { ...x, ...patch } : x)),
  }));
};
export const approveProjectInternalPath = (id, path) =>
  updateProject(id, {
    approvedInternalPaths: [
      ...getState().projects.find((p) => p.id === id).approvedInternalPaths,
      path,
    ],
  });
export const setActiveProject = (id) => setState((s) => ({ ...s, activeProjectId: id }));
export const reloadWorkspaceForUser = async () => {
  record("reloadWorkspaceForUser", {});
  if (fixture.failRead) return "unavailable";
  return "applied";
};
export const useWorkspaceSaveStatus = () => ({ kind: fixture.failSave ? "error" : "saved" });
export const getWorkspaceSaveStatus = () => ({ kind: fixture.failSave ? "error" : "saved" });
// The editor's Save goes through confirmWorkspaceSave -> runDiscoverySave, which
// reads this context and refuses to report success unless the workspace is
// hydrated for a known user. Synthetic memory is always "hydrated" (there is
// nothing to fetch), and the epoch never changes because this fixture has no
// sign-out/re-hydration; without `hydrated` every fixture save classified as
// "notReady" and no save in the fixture could ever confirm.
export const getWorkspaceSaveContext = () => ({
  userId: fixture.state.userId,
  epoch: 1,
  hydrated: true,
});
// Diffed against the synthetic baseline that saveWorkspaceNow/reset records, not
// a constant: the "a newer edit landed while this save was in flight" guard is
// the one confirmWorkspaceSave exists for, and a hardcoded false would bypass it
// and let the fixture claim a success the real store would withhold.
export const hasUnsavedWorkspaceChanges = () =>
  JSON.stringify(fixture.saved) !== JSON.stringify(fixture.state);
export const uid = () => crypto.randomUUID();
