/**
 * Andersen Visibility Engine — global app store.
 *
 * Reactive store built on `useSyncExternalStore`. Persistence is now backed by
 * the Lovable Cloud `workspaces` table (one row per signed-in user, JSON blob).
 *
 * Lifecycle:
 *   1. On sign-in the `_authenticated` layout calls `hydrateForUser(userId)`.
 *      - Fetches `workspaces.data` for the user.
 *      - If no row exists yet, seeds the user's workspace from `mock-data` so
 *        the Free Preview / first-run demo is immediately useful.
 *   2. Every action goes through `setState`, which debounces a server upsert.
 *   3. On sign-out the layout calls `resetStore()` so the next user does not
 *      see the previous user's data while their workspace is loading.
 *
 * Project-limit enforcement (`addProject`) reads `isOwner` from the caller —
 * owner bypass logic lives in `src/lib/auth.tsx`.
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
import { supabase } from "@/integrations/supabase/client";
import { MAX_PROJECTS_PER_USER } from "./pricing";

interface State {
  projects: Project[];
  services: ServiceItem[];
  opportunities: Opportunity[];
  calendar: CalendarItem[];
  content: ContentAsset[];
  activeProjectId: string;
  /** Whether the active user's workspace has been loaded from Cloud. */
  hydrated: boolean;
  /** The user whose workspace is currently in memory (null = signed out). */
  userId: string | null;
}

const emptyState: State = {
  projects: [],
  services: [],
  opportunities: [],
  calendar: [],
  content: [],
  activeProjectId: "",
  hydrated: false,
  userId: null,
};

// SSR / first-render snapshot uses the seed demo so public-side prerender and
// the brief moment before hydration still render a coherent shell.
const ssrSnapshot: State = {
  projects: seedProjects,
  services: seedServices,
  opportunities: seedOpportunities,
  calendar: seedCalendar,
  content: seedContent,
  activeProjectId: seedProjects[0]?.id ?? "",
  hydrated: false,
  userId: null,
};

let state: State = ssrSnapshot;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

// ---- Cloud persistence (debounced) ----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 600;

function scheduleSave() {
  if (typeof window === "undefined") return;
  if (!state.hydrated || !state.userId) return;
  if (saveTimer) clearTimeout(saveTimer);
  const userId = state.userId;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const snapshot = {
      projects: state.projects,
      services: state.services,
      opportunities: state.opportunities,
      calendar: state.calendar,
      content: state.content,
      activeProjectId: state.activeProjectId,
    };
    try {
      await supabase
        .from("workspaces")
        .upsert(
          { user_id: userId, data: snapshot as never },
          { onConflict: "user_id" },
        );
    } catch (e) {

      // Silent — UI keeps in-memory state; next action will retry the save.
      console.warn("[workspace] save failed", e);
    }
  }, SAVE_DEBOUNCE_MS);
}

export const setState = (updater: (s: State) => State) => {
  state = updater(state);
  scheduleSave();
  notify();
};

export const getState = () => state;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

// ---- Hydration lifecycle ----

/**
 * Load the workspace for `userId` from Cloud, seeding from mock-data if the
 * user has no row yet. Idempotent per (userId).
 */
export async function hydrateForUser(userId: string): Promise<void> {
  if (state.userId === userId && state.hydrated) return;

  // Reset visible state to a clean loading shell scoped to this user.
  state = { ...emptyState, userId };
  notify();

  try {
    const { data: row, error } = await supabase
      .from("workspaces")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    if (row?.data && typeof row.data === "object") {
      const d = row.data as Partial<State>;
      state = {
        projects: d.projects ?? [],
        services: d.services ?? [],
        opportunities: d.opportunities ?? [],
        calendar: d.calendar ?? [],
        content: d.content ?? [],
        activeProjectId: d.activeProjectId ?? (d.projects?.[0]?.id ?? ""),
        hydrated: true,
        userId,
      };
    } else {
      // First-run: seed the workspace with the demo so the user lands on
      // something useful, then persist.
      state = {
        projects: seedProjects,
        services: seedServices,
        opportunities: seedOpportunities,
        calendar: seedCalendar,
        content: seedContent,
        activeProjectId: seedProjects[0]?.id ?? "",
        hydrated: true,
        userId,
      };
      await supabase.from("workspaces").insert({
        user_id: userId,
        data: {
          projects: state.projects,
          services: state.services,
          opportunities: state.opportunities,
          calendar: state.calendar,
          content: state.content,
          activeProjectId: state.activeProjectId,
        } as never,
      });

    }
  } catch (e) {
    console.warn("[workspace] hydrate failed, falling back to seed", e);
    state = {
      projects: seedProjects,
      services: seedServices,
      opportunities: seedOpportunities,
      calendar: seedCalendar,
      content: seedContent,
      activeProjectId: seedProjects[0]?.id ?? "",
      hydrated: true,
      userId,
    };
  }
  notify();
}

export function resetStore(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  state = ssrSnapshot;
  notify();
}

// ---- React hook ----

const shallowEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  }
  return false;
};

export function useStore<T>(selector: (s: State) => T): T {
  const cache = useRef<{ state: State | null; value: T }>({ state: null, value: undefined as unknown as T });
  const getSnap = () => {
    const cur = state;
    if (cache.current.state === cur) return cache.current.value;
    const next = selector(cur);
    if (cache.current.state !== null && shallowEqual(cache.current.value, next)) {
      cache.current = { state: cur, value: cache.current.value };
      return cache.current.value;
    }
    cache.current = { state: cur, value: next };
    return next;
  };
  const serverCache = useRef<{ done: boolean; value: T }>({ done: false, value: undefined as unknown as T });
  const getServerSnap = () => {
    if (!serverCache.current.done) {
      serverCache.current = { done: true, value: selector(ssrSnapshot) };
    }
    return serverCache.current.value;
  };
  return useSyncExternalStore(subscribe, getSnap, getServerSnap);
}

export const uid = () => Math.random().toString(36).slice(2, 10);

// --- actions ---
export const setActiveProject = (id: string) =>
  setState((s) => ({ ...s, activeProjectId: id }));

export class ProjectLimitError extends Error {
  constructor(public readonly max: number) {
    super(`Project limit reached (${max}). Upgrade your plan to add more projects.`);
    this.name = "ProjectLimitError";
  }
}

/**
 * Create a project. Non-owner accounts are capped at MAX_PROJECTS_PER_USER.
 * Owners (role = 'owner') bypass the cap — pass `isOwner: true` from the caller.
 */
export const addProject = (p: Omit<Project, "id">, opts: { isOwner: boolean }) => {
  if (!opts.isOwner && state.projects.length >= MAX_PROJECTS_PER_USER) {
    throw new ProjectLimitError(MAX_PROJECTS_PER_USER);
  }
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
