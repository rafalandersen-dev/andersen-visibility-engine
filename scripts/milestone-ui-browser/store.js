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
export const getWorkspaceSaveContext = () => ({ userId: fixture.state.userId, epoch: 1 });
export const hasUnsavedWorkspaceChanges = () => false;
export const uid = () => crypto.randomUUID();
