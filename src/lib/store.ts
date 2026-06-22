/**
 * Andersen Visibility Engine — global app store.
 *
 * Tiny reactive store built on `useSyncExternalStore` + `localStorage`. No
 * external state library on purpose — the MVP is a clickable shell and we
 * want zero hidden magic for reviewers.
 *
 * Data model lives in ./types. Seed data lives in ./mock-data. Mock AI
 * generators in ./mock-ai call the action helpers below (e.g.
 * `replaceNewOpportunities`, `upsertContent`) to mutate the store.
 *
 * Project context: every entity carries a `projectId`. The UI reads
 * `activeProjectId` and filters client-side. When real persistence lands,
 * swap the body of `setState` / initial hydration for an API call — the
 * action surface and selectors stay the same.
 */
import { useRef, useSyncExternalStore } from "react";
import type {
  Project,
  ServiceItem,
  Opportunity,
  CalendarItem,
  ContentAsset,
} from "./types";
import {
  seedProjects,
  seedServices,
  seedOpportunities,
  seedCalendar,
  seedContent,
} from "./mock-data";

interface State {
  projects: Project[];
  services: ServiceItem[];
  opportunities: Opportunity[];
  calendar: CalendarItem[];
  content: ContentAsset[];
  activeProjectId: string;
}

const STORAGE_KEY = "ave-store-v1";

const initialState: State = {
  projects: seedProjects,
  services: seedServices,
  opportunities: seedOpportunities,
  calendar: seedCalendar,
  content: seedContent,
  activeProjectId: "synergy",
};

let state: State = initialState;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...initialState, ...JSON.parse(raw) };
  } catch {}
}

const persist = () => {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
};

export const setState = (updater: (s: State) => State) => {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
};

export const getState = () => state;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(initialState),
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10);

// --- actions ---
export const setActiveProject = (id: string) =>
  setState((s) => ({ ...s, activeProjectId: id }));

export const addProject = (p: Omit<Project, "id">) => {
  const id = uid();
  setState((s) => ({ ...s, projects: [...s.projects, { ...p, id }], activeProjectId: id }));
  return id;
};

export const updateProject = (id: string, patch: Partial<Project>) =>
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));

export const addService = (item: Omit<ServiceItem, "id">) =>
  setState((s) => ({ ...s, services: [...s.services, { ...item, id: uid() }] }));

export const updateService = (id: string, patch: Partial<ServiceItem>) =>
  setState((s) => ({
    ...s,
    services: s.services.map((x) => (x.id === id ? { ...x, ...patch } : x)),
  }));

export const deleteService = (id: string) =>
  setState((s) => ({ ...s, services: s.services.filter((x) => x.id !== id) }));

export const updateOpportunity = (id: string, patch: Partial<Opportunity>) =>
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.map((o) => (o.id === id ? { ...o, ...patch } : o)),
  }));

export const addOpportunities = (items: Opportunity[]) =>
  setState((s) => ({ ...s, opportunities: [...s.opportunities, ...items] }));

// Replace project's "New" opportunities (preserve briefed/drafting/linked/discarded)
export const replaceNewOpportunities = (projectId: string, items: Opportunity[]) =>
  setState((s) => ({
    ...s,
    opportunities: [
      ...s.opportunities.filter((o) => o.projectId !== projectId || o.status !== "New"),
      ...items,
    ],
  }));

export const addCalendarItems = (items: CalendarItem[]) =>
  setState((s) => ({ ...s, calendar: [...s.calendar, ...items] }));

// Replace project's planned calendar items (preserve In Progress / Done)
export const replacePlannedCalendar = (projectId: string, items: CalendarItem[]) =>
  setState((s) => ({
    ...s,
    calendar: [
      ...s.calendar.filter((c) => c.projectId !== projectId || c.status !== "Planned"),
      ...items,
    ],
  }));

export const updateCalendarItem = (id: string, patch: Partial<CalendarItem>) =>
  setState((s) => ({
    ...s,
    calendar: s.calendar.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }));

export const upsertContent = (asset: ContentAsset) =>
  setState((s) => {
    const exists = s.content.some((c) => c.id === asset.id);
    return {
      ...s,
      content: exists
        ? s.content.map((c) => (c.id === asset.id ? asset : c))
        : [...s.content, asset],
    };
  });
