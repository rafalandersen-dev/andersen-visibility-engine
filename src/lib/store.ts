/**
 * Milo Growth — global app store.
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
import { linkedAssetFor } from "./pipeline";
import { normalizeInternalPath } from "./markdown";
import type {
  Project,
  ServiceItem,
  Opportunity,
  DiscoverySuggestion,
  OpportunityLifecycleStatus,
  CalendarItem,
  ContentAsset,
  AuditResult,
  CompetitorAnalysisResult,
  AuthorityAnalysisResult,
  AuthorityOpportunity,
  AiEvaluationRun,
  AiVisibilityAnalysisResult,
  BacklinkAnalysisResult,
  LinkMarketplaceOrder,
  OutreachDraft,
  GrowthTask,
  PendingAction,
  PublishingConnectorType,
  WordPressPublishingSettings,
  ShopifyPublishingSettings,
} from "./types";
import type { BillingProfile, SubscriptionPlan } from "./billing";
import {
  seedProjects,
  seedServices,
  seedOpportunities,
  seedCalendar,
  seedContent,
} from "./mock-data";
import { supabase } from "@/integrations/supabase/client";
import { MAX_PROJECTS_PER_USER } from "./billing";
import {
  newOpportunityRecord,
  opportunityDeduplicationKey,
  opportunityView,
  restoreOpportunityRecord,
  transitionOpportunityRecord,
} from "./opportunities";

interface State {
  projects: Project[];
  services: ServiceItem[];
  opportunities: Opportunity[];
  discoverySuggestions: DiscoverySuggestion[];
  calendar: CalendarItem[];
  content: ContentAsset[];
  audits: AuditResult[];
  competitorAnalyses: CompetitorAnalysisResult[];
  authorityAnalyses: AuthorityAnalysisResult[];
  aiVisibilityAnalyses: AiVisibilityAnalysisResult[];
  /** Backlinks v1 — DataForSEO-powered link profile + gap analyses. */
  backlinkAnalyses: BacklinkAnalysisResult[];
  /** Marketplace v1 — reviewable sponsored-publication requests. */
  linkMarketplaceOrders: LinkMarketplaceOrder[];
  /** AI Outreach v1 — drafts and review queue; sending is a separate integration. */
  outreachDrafts: OutreachDraft[];
  /** Authority Builder v2 — trackable authority opportunities. */
  authorityOpportunities: AuthorityOpportunity[];
  /** AI Provider Router — internal model evaluation runs (latest 20). */
  aiEvaluationRuns: AiEvaluationRun[];
  /** Phase 1A — growth tasks (created via the Claude connector; UI follows).
   * MUST stay in the persisted snapshot: server-written tasks would otherwise
   * be dropped by the enumerated client save. */
  tasks: GrowthTask[];
  /** Phase 1B — proposals created via the Claude connector, resolved in the UI.
   * MUST stay in the persisted snapshot: server-written proposals would
   * otherwise be dropped by the enumerated client save. */
  pendingActions: PendingAction[];
  /** Billing v1 — workspace-level billing profile + subscription (optional). */
  billingProfile?: BillingProfile;
  subscription?: SubscriptionPlan;
  activeProjectId: string;
  /** Whether the active user's workspace has been loaded from Cloud. */
  hydrated: boolean;
  /** The user whose workspace is currently in memory (null = signed out). */
  userId: string | null;
  /**
   * Optimistic-concurrency counter for the user's workspaces row. Saves ECHO
   * this value; the DB trigger (workspaces_rev_guard) verifies the echo and
   * increments. NEVER stored inside the `data` JSONB blob, and rev-only local
   * updates bypass setState/scheduleSave so they can't trigger another save.
   */
  rev: number;
}

const emptyState: State = {
  projects: [],
  services: [],
  opportunities: [],
  discoverySuggestions: [],
  calendar: [],
  content: [],
  audits: [],
  competitorAnalyses: [],
  authorityAnalyses: [],
  aiVisibilityAnalyses: [],
  backlinkAnalyses: [],
  linkMarketplaceOrders: [],
  outreachDrafts: [],
  authorityOpportunities: [],
  aiEvaluationRuns: [],
  tasks: [],
  pendingActions: [],
  activeProjectId: "",
  hydrated: false,
  userId: null,
  rev: 0,
};

// SSR / first-render snapshot uses the seed demo so public-side prerender and
// the brief moment before hydration still render a coherent shell.
const ssrSnapshot: State = {
  projects: seedProjects,
  services: seedServices,
  opportunities: seedOpportunities,
  discoverySuggestions: [],
  calendar: seedCalendar,
  content: seedContent,
  audits: [],
  competitorAnalyses: [],
  authorityAnalyses: [],
  aiVisibilityAnalyses: [],
  backlinkAnalyses: [],
  linkMarketplaceOrders: [],
  outreachDrafts: [],
  authorityOpportunities: [],
  aiEvaluationRuns: [],
  tasks: [],
  pendingActions: [],
  activeProjectId: seedProjects[0]?.id ?? "",
  hydrated: false,
  userId: null,
  rev: 0,
};

let state: State = ssrSnapshot;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

// ---- Cloud persistence (debounced) ----
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 600;

// P0 fix 2026-07-25: device-local active project. The blob's activeProjectId
// is whatever ANY tab/device saved last — restoring it on hydrate (and, worse,
// on conflict rehydrate) flipped this tab's active project mid-session, and
// mutations issued right after bound to the flipped project. localStorage wins.
function activeProjectStorageKey(userId: string): string {
  return `milo.activeProject.${userId}`;
}
function readStoredActiveProject(userId: string): string {
  try {
    return window.localStorage.getItem(activeProjectStorageKey(userId)) ?? "";
  } catch {
    return "";
  }
}
function writeStoredActiveProject(userId: string, projectId: string): void {
  try {
    window.localStorage.setItem(activeProjectStorageKey(userId), projectId);
  } catch {
    /* private mode etc. — the blob value remains the fallback */
  }
}

/** True for the workspaces_rev_guard trigger's optimistic-concurrency conflict. */
function isRevConflict(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "40001" || /workspace_conflict/i.test(error.message ?? ""));
}

/** Store a DB-acknowledged rev locally. Bypasses setState/scheduleSave on purpose. */
function applyRev(rev: number) {
  state = { ...state, rev };
  notify();
}

// P0 fix 2026-07-25: conflict recovery merges instead of wiping (see
// workspace-merge.ts for the incident and the per-field contract).
// eslint-disable-next-line import/order -- grouped with the fix block
import { mergeWorkspaceSnapshots, type WorkspaceSnapshot } from "./workspace-merge";

/** Enumerated persisted fields — rev is deliberately NOT part of `data`. */
function persistedSnapshot(s: State): WorkspaceSnapshot {
  return {
    projects: s.projects,
    services: s.services,
    opportunities: s.opportunities,
    discoverySuggestions: s.discoverySuggestions,
    calendar: s.calendar,
    content: s.content,
    audits: s.audits,
    competitorAnalyses: s.competitorAnalyses,
    authorityAnalyses: s.authorityAnalyses,
    aiVisibilityAnalyses: s.aiVisibilityAnalyses,
    backlinkAnalyses: s.backlinkAnalyses,
    linkMarketplaceOrders: s.linkMarketplaceOrders,
    outreachDrafts: s.outreachDrafts,
    authorityOpportunities: s.authorityOpportunities,
    aiEvaluationRuns: s.aiEvaluationRuns,
    tasks: s.tasks,
    pendingActions: s.pendingActions,
    billingProfile: s.billingProfile,
    subscription: s.subscription,
    activeProjectId: s.activeProjectId,
  };
}

/** Build a full hydrated State from a fetched workspaces row (hydrate + conflict rehydrate). */
function stateFromRow(userId: string, d: Partial<State>, rev: number): State {
  return {
    projects: d.projects ?? [],
    services: d.services ?? [],
    opportunities: d.opportunities ?? [],
    discoverySuggestions: d.discoverySuggestions ?? [],
    calendar: d.calendar ?? [],
    content: d.content ?? [],
    audits: d.audits ?? [],
    competitorAnalyses: d.competitorAnalyses ?? [],
    authorityAnalyses: d.authorityAnalyses ?? [],
    aiVisibilityAnalyses: d.aiVisibilityAnalyses ?? [],
    backlinkAnalyses: d.backlinkAnalyses ?? [],
    linkMarketplaceOrders: d.linkMarketplaceOrders ?? [],
    outreachDrafts: d.outreachDrafts ?? [],
    authorityOpportunities: d.authorityOpportunities ?? [],
    aiEvaluationRuns: d.aiEvaluationRuns ?? [],
    tasks: d.tasks ?? [],
    pendingActions: d.pendingActions ?? [],
    billingProfile: d.billingProfile,
    subscription: d.subscription,
    activeProjectId: (() => {
      const stored = typeof window === "undefined" ? "" : readStoredActiveProject(userId);
      const projects = d.projects ?? [];
      if (stored && projects.some((p) => p.id === stored)) return stored;
      return d.activeProjectId ?? projects[0]?.id ?? "";
    })(),
    hydrated: true,
    userId,
    rev,
  };
}

/**
 * Conflict recovery (P0 fix 2026-07-25): MERGE and retry, never wipe.
 *
 * The previous "server wins" recovery replaced the whole local state —
 * silently discarding every unsaved local edit (and flipping the active
 * project). Server-side writers bump the rev constantly, so a stale tab
 * could lose every subsequent create with no error. Now: fetch the fresh
 * row, merge the local snapshot over it per entity (workspace-merge.ts),
 * and retry the save ONCE with the fresh rev. Any failure past that is
 * LOUD — local state is kept and the user sees an error, never a no-op.
 *
 * Returns the merged snapshot + fresh rev on success, or null when the
 * fresh row could not be read (caller keeps local state and surfaces it).
 */
async function mergeWithServerRow(
  userId: string,
  localSnapshot: WorkspaceSnapshot,
): Promise<{ merged: WorkspaceSnapshot; rev: number } | null> {
  const { data: row, error } = await supabase
    .from("workspaces")
    .select("data,rev")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  const r = row as { data?: unknown; rev?: number } | null;
  if (!r?.data || typeof r.data !== "object") return null;
  return {
    merged: mergeWorkspaceSnapshots(localSnapshot, r.data as WorkspaceSnapshot),
    rev: Number(r.rev ?? 0),
  };
}

export async function saveWorkspaceNow(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!state.hydrated || !state.userId) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const userId = state.userId;
  // Echo the rev this snapshot is based on; the DB trigger does the increment.
  const revAtSnapshot = state.rev;
  const snapshot = persistedSnapshot(state);
  const attempt = (data: WorkspaceSnapshot, rev: number) =>
    supabase
      .from("workspaces")
      .upsert({ user_id: userId, data, rev } as never, { onConflict: "user_id" })
      .select("rev")
      .single();

  let { data: saved, error } = await attempt(snapshot as WorkspaceSnapshot, revAtSnapshot);
  if (error && isRevConflict(error)) {
    // Another writer bumped the row. Merge our snapshot over theirs and retry
    // once with the fresh rev — creates/edits survive, nothing is wiped.
    const fresh = await mergeWithServerRow(userId, snapshot as WorkspaceSnapshot);
    if (!fresh) {
      const { toast } = await import("sonner");
      toast.error("Could not sync your workspace — your changes are kept here. Retrying…");
      scheduleSave(); // bounded by the debounce; each retry re-reads a fresh rev
      return;
    }
    ({ data: saved, error } = await attempt(fresh.merged, fresh.rev));
    if (error && isRevConflict(error)) {
      // Two conflicts in one save = very busy row. Keep local, retry soon, be loud.
      const { toast } = await import("sonner");
      toast.error("Workspace is being updated elsewhere — retrying your save…");
      scheduleSave();
      return;
    }
    if (!error && state.userId === userId) {
      // Fold the server-side entities we just learned about into the LIVE
      // state, with the live state winning per id (the user may have kept
      // typing while the retry ran).
      const liveSnapshot = persistedSnapshot(state);
      const liveMerged = mergeWorkspaceSnapshots(liveSnapshot, fresh.merged);
      state = stateFromRow(userId, liveMerged as Partial<State>, state.rev);
      notify();
      const { toast } = await import("sonner");
      toast.info("Workspace was updated elsewhere — your changes were merged and saved.");
    }
  }
  if (error) throw error; // project-cap + all other errors keep their existing paths
  const newRev = Number((saved as { rev?: number } | null)?.rev ?? revAtSnapshot + 1);
  if (state.userId === userId) applyRev(newRev);
}

function scheduleSave() {
  if (typeof window === "undefined") return;
  if (!state.hydrated || !state.userId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveWorkspaceNow();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/Project limit reached/i.test(message)) {
        const { toast } = await import("sonner");
        toast.error(message);
      } else {
        console.warn("[workspace] save failed", e);
      }
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
      .select("data,rev")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    const r = row as { data?: unknown; rev?: number } | null;
    if (r?.data && typeof r.data === "object") {
      state = stateFromRow(userId, r.data as Partial<State>, Number(r.rev ?? 0));
    } else {
      // First-run: authenticated users start with an EMPTY workspace.
      // Demo seed data is only used for the public landing preview (ssrSnapshot).
      const { data: inserted } = await supabase
        .from("workspaces")
        .insert({
          user_id: userId,
          data: {
            projects: [],
            services: [],
            opportunities: [],
            discoverySuggestions: [],
            calendar: [],
            content: [],
            activeProjectId: "",
          } as never,
        })
        .select("rev")
        .single();
      state = {
        projects: [],
        services: [],
        opportunities: [],
        discoverySuggestions: [],
        calendar: [],
        content: [],
        audits: [],
        competitorAnalyses: [],
        authorityAnalyses: [],
        aiVisibilityAnalyses: [],
        backlinkAnalyses: [],
        linkMarketplaceOrders: [],
        outreachDrafts: [],
        authorityOpportunities: [],
        aiEvaluationRuns: [],
        tasks: [],
        pendingActions: [],
        activeProjectId: "",
        hydrated: true,
        userId,
        rev: Number((inserted as { rev?: number } | null)?.rev ?? 0),
      };
    }
  } catch (e) {
    console.warn("[workspace] hydrate failed, falling back to empty", e);
    state = {
      projects: [],
      services: [],
      opportunities: [],
      discoverySuggestions: [],
      calendar: [],
      content: [],
      audits: [],
      competitorAnalyses: [],
      authorityAnalyses: [],
      aiVisibilityAnalyses: [],
      backlinkAnalyses: [],
      linkMarketplaceOrders: [],
      outreachDrafts: [],
      authorityOpportunities: [],
      aiEvaluationRuns: [],
      tasks: [],
      pendingActions: [],
      activeProjectId: "",
      hydrated: true,
      userId,
      rev: 0,
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

/**
 * Re-fetch the current user's workspace row and replace state IN PLACE (no
 * loading-shell reset, no save). Unlike hydrateForUser, this has no
 * already-hydrated early-return — it is for reflecting a SERVER-side mutation
 * the client didn't make locally (e.g. owner resolution of a pending action)
 * so the UI shows the new server state + rev immediately. A fresh state object
 * (and fresh collection arrays via stateFromRow) drives useStore re-renders.
 * Never throws; a failed reload simply leaves the current state untouched.
 */
export async function reloadWorkspaceForUser(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data: row } = await supabase
      .from("workspaces")
      .select("data,rev")
      .eq("user_id", userId)
      .maybeSingle();
    const r = row as { data?: unknown; rev?: number } | null;
    // Guard against a user switch mid-flight: only apply if still the same user.
    if (r?.data && typeof r.data === "object" && state.userId === userId) {
      state = stateFromRow(userId, r.data as Partial<State>, Number(r.rev ?? 0));
      notify();
    }
  } catch (e) {
    console.warn("[workspace] reload failed", e);
  }
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
      if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
        return false;
    }
    return true;
  }
  return false;
};

export function useStore<T>(selector: (s: State) => T): T {
  const cache = useRef<{ state: State | null; value: T }>({
    state: null,
    value: undefined as unknown as T,
  });
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
  const serverCache = useRef<{ done: boolean; value: T }>({
    done: false,
    value: undefined as unknown as T,
  });
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
  setState((s) => {
    if (s.userId) writeStoredActiveProject(s.userId, id);
    return { ...s, activeProjectId: id };
  });

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
  setState((s) => {
    if (s.userId) writeStoredActiveProject(s.userId, id);
    return { ...s, projects: [...s.projects, { ...p, id }], activeProjectId: id };
  });
  return id;
};

export const updateProject = (id: string, patch: Partial<Project>) =>
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));

/**
 * Record that the user has explicitly approved one exact internal path for a
 * project (link-safety USER_APPROVED state). Stored in the project JSONB as
 * `approvedInternalPaths` — no migration. Deliberately per-path: there is no
 * "approve all" action, and an already-approved path is a no-op.
 */
export const approveProjectInternalPath = (projectId: string, path: string) => {
  const normalized = normalizeInternalPath(path);
  if (!normalized.startsWith("/")) return;
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (p.id !== projectId) return p;
      const current = p.approvedInternalPaths ?? [];
      if (current.includes(normalized)) return p;
      return { ...p, approvedInternalPaths: [...current, normalized] };
    }),
  }));
};

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
    opportunities: s.opportunities.map((o) =>
      o.id === id
        ? {
            ...opportunityView(
              o,
              s.content.find((asset) =>
                o.currentContentAssetId
                  ? asset.id === o.currentContentAssetId
                  : asset.opportunityId === o.id,
              ),
            ),
            ...patch,
            updatedAt: patch.updatedAt ?? new Date().toISOString(),
            version: patch.version ?? (o.version ?? 1) + 1,
          }
        : o,
    ),
  }));

export const addOpportunities = (items: Opportunity[]) =>
  setState((s) => ({
    ...s,
    opportunities: [...s.opportunities, ...items.map((item) => newOpportunityRecord(item))],
  }));

export const addOpportunity = (
  item: Omit<Opportunity, "id" | "status"> & { id?: string; status?: Opportunity["status"] },
) => {
  const opportunity = newOpportunityRecord({ ...item, id: item.id ?? uid() });
  setState((s) => ({ ...s, opportunities: [...s.opportunities, opportunity] }));
  return opportunity;
};

/** Store a fresh discovery run without silently turning suggestions into work. */
export const replaceDiscoverySuggestions = (
  projectId: string,
  suggestions: DiscoverySuggestion[],
) =>
  setState((s) => ({
    ...s,
    discoverySuggestions: [
      ...s.discoverySuggestions.filter(
        (item) => item.projectId !== projectId || item.status === "accepted",
      ),
      ...suggestions,
    ],
  }));

/**
 * Accept selected suggestions atomically. The destination is always the
 * canonical Plan `captured` stage and existing active records are deduplicated.
 */
export const acceptDiscoverySuggestions = (ids: string[]): Opportunity[] => {
  const acceptedIds = new Set(ids);
  const created: Opportunity[] = [];
  setState((s) => {
    const existingKeys = new Set(
      s.opportunities
        .filter((opportunity) => !opportunity.deletedAt)
        .map(opportunityDeduplicationKey),
    );
    const acceptedBySuggestion = new Map<string, string>();

    for (const suggestion of s.discoverySuggestions) {
      if (!acceptedIds.has(suggestion.id) || suggestion.status !== "suggested") continue;
      if (existingKeys.has(suggestion.deduplicationKey)) continue;
      const {
        status: _suggestionStatus,
        deduplicationKey: _deduplicationKey,
        generatedAt,
        acceptedOpportunityId: _acceptedOpportunityId,
        ...base
      } = suggestion;
      const opportunity = newOpportunityRecord({
        ...base,
        id: uid(),
        status: "captured",
        createdAt: generatedAt,
      });
      created.push(opportunity);
      existingKeys.add(suggestion.deduplicationKey);
      acceptedBySuggestion.set(suggestion.id, opportunity.id);
    }

    return {
      ...s,
      opportunities: [...s.opportunities, ...created],
      discoverySuggestions: s.discoverySuggestions.map((suggestion) => {
        if (!acceptedIds.has(suggestion.id) || suggestion.status !== "suggested") return suggestion;
        return {
          ...suggestion,
          status: "accepted" as const,
          acceptedOpportunityId:
            acceptedBySuggestion.get(suggestion.id) ??
            s.opportunities.find(
              (opportunity) =>
                opportunityDeduplicationKey(opportunity) === suggestion.deduplicationKey,
            )?.id,
        };
      }),
    };
  });
  return created;
};

export const dismissDiscoverySuggestion = (id: string) =>
  setState((s) => ({
    ...s,
    discoverySuggestions: s.discoverySuggestions.map((suggestion) =>
      suggestion.id === id ? { ...suggestion, status: "dismissed" as const } : suggestion,
    ),
  }));

export const undoAcceptedDiscoverySuggestions = (opportunityIds: string[]) => {
  const ids = new Set(opportunityIds);
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.filter((opportunity) => !ids.has(opportunity.id)),
    discoverySuggestions: s.discoverySuggestions.map((suggestion) =>
      suggestion.acceptedOpportunityId && ids.has(suggestion.acceptedOpportunityId)
        ? { ...suggestion, status: "suggested" as const, acceptedOpportunityId: undefined }
        : suggestion,
    ),
  }));
};

export const transitionOpportunity = (
  id: string,
  to: OpportunityLifecycleStatus,
  fields: Partial<Opportunity> = {},
): Opportunity => {
  let updated: Opportunity | undefined;
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.map((opportunity) => {
      if (opportunity.id !== id) return opportunity;
      // The SAME resolver the board and Home use. Its own inline find picked the
      // first asset by opportunityId (ignoring sourceOpportunityId and armed
      // precedence), so a drag validated against the board's chosen asset could
      // be re-validated here against a different one and throw on a move the board
      // itself invited.
      const linkedAsset = linkedAssetFor(opportunity, s.content);
      updated = transitionOpportunityRecord(opportunity, to, fields, linkedAsset);
      return updated;
    }),
  }));
  if (!updated) throw new Error("Opportunity not found.");
  return updated;
};

export const archiveOpportunity = (id: string) => transitionOpportunity(id, "archived");

export const restoreOpportunity = (id: string): Opportunity => {
  let restored: Opportunity | undefined;
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.map((opportunity) => {
      if (opportunity.id !== id) return opportunity;
      restored = restoreOpportunityRecord(opportunity);
      return restored;
    }),
  }));
  if (!restored) throw new Error("Opportunity not found.");
  return restored;
};

/** Recoverable delete marker. A cleanup job may purge it after 30 days. */
export const deleteOpportunityRecoverably = (id: string): Opportunity => {
  let deleted: Opportunity | undefined;
  const now = new Date().toISOString();
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.map((opportunity) => {
      if (opportunity.id !== id) return opportunity;
      const current = opportunityView(opportunity);
      if (current.status !== "archived") {
        throw new Error("Archive this opportunity before deleting it.");
      }
      deleted = {
        ...current,
        deletedAt: now,
        updatedAt: now,
        version: (current.version ?? 1) + 1,
      };
      return deleted;
    }),
  }));
  if (!deleted) throw new Error("Opportunity not found.");
  return deleted;
};

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

/** Edit only the planned (publish) date of a calendar item. Does not touch
 *  topic/type/intent/CTA/status/content linkage. */
export const updateCalendarItemDate = (id: string, plannedDate: string) =>
  setState((s) => ({
    ...s,
    calendar: s.calendar.map((c) => (c.id === id ? { ...c, plannedDate } : c)),
  }));

/** Remove a single calendar item. Linked content assets are NOT deleted. */
export const deleteCalendarItem = (id: string) =>
  setState((s) => ({ ...s, calendar: s.calendar.filter((c) => c.id !== id) }));

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

/** Permanently remove a content asset. Source opportunity and calendar item
 *  are left untouched. */
export const deleteContentAsset = (id: string) =>
  setState((s) => ({ ...s, content: s.content.filter((c) => c.id !== id) }));

// ---- Publishing v1 (Lovable / custom website connector) ----

type ProjectPublishingSettings = Partial<
  Pick<
    Project,
    | "publishingPlatform"
    | "publishEndpoint"
    | "publishSecret"
    | "defaultPublishMode"
    | "defaultDestinationType"
    | "livePublishEndpoint"
    | "publishMode"
  >
>;

/** Merge publishing settings into a project (leaves all other project fields intact). */
export const updateProjectPublishingSettings = (
  projectId: string,
  settings: ProjectPublishingSettings,
) =>
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id === projectId ? { ...p, ...settings } : p)),
  }));

/** Set the project's connector type and/or WordPress settings (merges wordpress fields). */
export const updateProjectConnector = (
  projectId: string,
  settings: {
    connectorType?: PublishingConnectorType;
    wordpress?: Partial<WordPressPublishingSettings>;
    shopify?: Partial<ShopifyPublishingSettings>;
  },
) =>
  setState((s) => ({
    ...s,
    projects: s.projects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            connectorType: settings.connectorType ?? p.connectorType,
            wordpress: settings.wordpress ? { ...p.wordpress, ...settings.wordpress } : p.wordpress,
            shopify: settings.shopify ? { ...p.shopify, ...settings.shopify } : p.shopify,
          }
        : p,
    ),
  }));

/** Mark a content asset as successfully sent to the website as a draft. */
export const markContentAssetSent = (
  assetId: string,
  data: {
    publishDestinationType: ContentAsset["publishDestinationType"];
    publishSlug: string;
    publishedDraftUrl?: string;
    publishExternalId?: string;
    lastPublishedAt: string;
    publishPlatform?: ContentAsset["publishPlatform"];
    wordpressPostId?: number;
    wordpressPostType?: ContentAsset["wordpressPostType"];
    shopify?: Partial<
      Pick<
        ContentAsset,
        | "shopifyArticleId"
        | "shopifyArticleGid"
        | "shopifyBlogId"
        | "shopifyBlogGid"
        | "shopifyHandle"
        | "shopifyStatus"
      >
    >;
  },
) =>
  setState((s) => ({
    ...s,
    content: s.content.map((c) =>
      c.id === assetId
        ? {
            ...c,
            publishStatus: "sent" as const,
            publishDestinationType: data.publishDestinationType,
            publishSlug: data.publishSlug,
            publishedDraftUrl: data.publishedDraftUrl,
            publishExternalId: data.publishExternalId ?? c.publishExternalId,
            lastPublishedAt: data.lastPublishedAt,
            lastPublishError: undefined,
            publishPlatform: data.publishPlatform ?? c.publishPlatform,
            wordpressPostId: data.wordpressPostId ?? c.wordpressPostId,
            wordpressPostType: data.wordpressPostType ?? c.wordpressPostType,
            ...(data.shopify ?? {}),
          }
        : c,
    ),
  }));

/** Mark a content asset's publish attempt as failed (keeps all content intact). */
export const markContentAssetPublishFailed = (
  assetId: string,
  error: string,
  attemptedAt: string,
) =>
  setState((s) => ({
    ...s,
    content: s.content.map((c) =>
      c.id === assetId
        ? {
            ...c,
            publishStatus: "failed" as const,
            lastPublishError: error,
            lastPublishedAt: attemptedAt,
          }
        : c,
    ),
  }));

/** Reset a content asset's publish status back to "not sent". */
export const resetContentAssetPublishStatus = (assetId: string) =>
  setState((s) => ({
    ...s,
    content: s.content.map((c) =>
      c.id === assetId
        ? { ...c, publishStatus: "notSent" as const, lastPublishError: undefined }
        : c,
    ),
  }));

// ---- Publishing v1.1 (live publishing) ----

/** Mark a content asset as published live on the connected website. */
export const markContentAssetPublishedLive = (
  assetId: string,
  data: {
    liveUrl: string;
    livePublishedAt: string;
    publishExternalId?: string;
    publishPlatform?: ContentAsset["publishPlatform"];
    wordpressPostId?: number;
    wordpressPostType?: ContentAsset["wordpressPostType"];
    shopify?: Partial<
      Pick<
        ContentAsset,
        | "shopifyArticleId"
        | "shopifyArticleGid"
        | "shopifyBlogId"
        | "shopifyBlogGid"
        | "shopifyHandle"
        | "shopifyStatus"
      >
    >;
  },
) =>
  setState((s) => ({
    ...s,
    content: s.content.map((c) =>
      c.id === assetId
        ? {
            ...c,
            livePublishStatus: "published" as const,
            liveUrl: data.liveUrl,
            livePublishedAt: data.livePublishedAt,
            livePublishError: undefined,
            autoPublishError: undefined,
            publishExternalId: data.publishExternalId ?? c.publishExternalId,
            publishPlatform: data.publishPlatform ?? c.publishPlatform,
            wordpressPostId: data.wordpressPostId ?? c.wordpressPostId,
            wordpressPostType: data.wordpressPostType ?? c.wordpressPostType,
            ...(data.shopify ?? {}),
            // A published asset is implicitly "sent" too (covers create-and-publish).
            publishStatus: c.publishStatus === "notSent" ? ("sent" as const) : c.publishStatus,
          }
        : c,
    ),
  }));

/** Mark a content asset's live-publish attempt as failed (content + draft state preserved). */
export const markContentAssetLivePublishFailed = (
  assetId: string,
  error: string,
  attemptedAt: string,
  opts?: { auto?: boolean },
) =>
  setState((s) => ({
    ...s,
    content: s.content.map((c) =>
      c.id === assetId
        ? {
            ...c,
            livePublishStatus: "failed" as const,
            livePublishError: error,
            livePublishedAt: attemptedAt,
            ...(opts?.auto ? { autoPublishAttemptedAt: attemptedAt, autoPublishError: error } : {}),
          }
        : c,
    ),
  }));

// ---- Site Audit ----

/** Store the latest audit for a project (one audit per project — replaces any prior). */
export const upsertAudit = (audit: AuditResult) =>
  setState((s) => ({
    ...s,
    audits: [...s.audits.filter((a) => a.projectId !== audit.projectId), audit],
  }));

/** Mark finding ids as already converted into Opportunities (dedup). */
export const markFindingsConverted = (auditId: string, findingIds: string[]) =>
  setState((s) => ({
    ...s,
    audits: s.audits.map((a) =>
      a.id === auditId
        ? {
            ...a,
            convertedFindingIds: Array.from(new Set([...a.convertedFindingIds, ...findingIds])),
          }
        : a,
    ),
  }));

// ---- Competitor Gap ----

/** Store the latest competitor analysis for a project (one per project — replaces any prior). */
export const upsertCompetitorAnalysis = (analysis: CompetitorAnalysisResult) =>
  setState((s) => ({
    ...s,
    competitorAnalyses: [
      ...s.competitorAnalyses.filter((a) => a.projectId !== analysis.projectId),
      analysis,
    ],
  }));

/** Mark gap ids as already converted into Opportunities (dedup). */
export const markGapsConverted = (analysisId: string, gapIds: string[]) =>
  setState((s) => ({
    ...s,
    competitorAnalyses: s.competitorAnalyses.map((a) =>
      a.id === analysisId
        ? { ...a, convertedGapIds: Array.from(new Set([...a.convertedGapIds, ...gapIds])) }
        : a,
    ),
  }));

// ---- Authority ----

/** Store the latest authority analysis for a project (one per project — replaces any prior). */
export const upsertAuthorityAnalysis = (analysis: AuthorityAnalysisResult) =>
  setState((s) => ({
    ...s,
    authorityAnalyses: [
      ...s.authorityAnalyses.filter((a) => a.projectId !== analysis.projectId),
      analysis,
    ],
  }));

/** Mark authority item ids as already converted into Opportunities (dedup). */
export const markAuthorityItemsConverted = (analysisId: string, itemIds: string[]) =>
  setState((s) => ({
    ...s,
    authorityAnalyses: s.authorityAnalyses.map((a) =>
      a.id === analysisId
        ? { ...a, convertedItemIds: Array.from(new Set([...a.convertedItemIds, ...itemIds])) }
        : a,
    ),
  }));

// ---- Authority Builder v2 ----

export const addAuthorityOpportunities = (items: AuthorityOpportunity[]) =>
  setState((s) => ({ ...s, authorityOpportunities: [...items, ...s.authorityOpportunities] }));

export const updateAuthorityOpportunity = (id: string, patch: Partial<AuthorityOpportunity>) =>
  setState((s) => ({
    ...s,
    authorityOpportunities: s.authorityOpportunities.map((a) =>
      a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a,
    ),
  }));

export const removeAuthorityOpportunity = (id: string) =>
  setState((s) => ({
    ...s,
    authorityOpportunities: s.authorityOpportunities.filter((a) => a.id !== id),
  }));

// ---- AI evaluation runs (latest 20) ----

export const addAiEvaluationRun = (run: AiEvaluationRun) =>
  setState((s) => ({ ...s, aiEvaluationRuns: [run, ...s.aiEvaluationRuns].slice(0, 20) }));

export const updateAiEvaluationRun = (id: string, patch: Partial<AiEvaluationRun>) =>
  setState((s) => ({
    ...s,
    aiEvaluationRuns: s.aiEvaluationRuns.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  }));

// ---- Billing (workspace-level) ----

export const setBillingProfile = (profile: BillingProfile) =>
  setState((s) => ({ ...s, billingProfile: profile }));

export const setSubscription = (sub: SubscriptionPlan | undefined) =>
  setState((s) => ({ ...s, subscription: sub }));

// ---- AI Visibility ----

/** Store the latest AI Visibility analysis for a project (one per project — replaces any prior). */
export const upsertAiVisibilityAnalysis = (analysis: AiVisibilityAnalysisResult) =>
  setState((s) => ({
    ...s,
    aiVisibilityAnalyses: [
      ...s.aiVisibilityAnalyses.filter((a) => a.projectId !== analysis.projectId),
      analysis,
    ],
  }));

// ---- Backlinks v1 ----

/** Store the latest backlink analysis for a project (one per project — replaces any prior). */
export const upsertBacklinkAnalysis = (analysis: BacklinkAnalysisResult) =>
  setState((s) => ({
    ...s,
    backlinkAnalyses: [
      ...s.backlinkAnalyses.filter((a) => a.projectId !== analysis.projectId),
      analysis,
    ],
  }));

/** Mark backlink recommendation ids as already converted into Opportunities (dedup). */
export const markBacklinkRecommendationsConverted = (
  analysisId: string,
  recommendationIds: string[],
) =>
  setState((s) => ({
    ...s,
    backlinkAnalyses: s.backlinkAnalyses.map((a) =>
      a.id === analysisId
        ? {
            ...a,
            convertedRecommendationIds: Array.from(
              new Set([...a.convertedRecommendationIds, ...recommendationIds]),
            ),
          }
        : a,
    ),
  }));

// ---- Sponsored publication marketplace v1 ----

export const addLinkMarketplaceOrder = (order: LinkMarketplaceOrder) =>
  setState((s) => ({ ...s, linkMarketplaceOrders: [...s.linkMarketplaceOrders, order] }));

export const updateLinkMarketplaceOrder = (id: string, patch: Partial<LinkMarketplaceOrder>) =>
  setState((s) => ({
    ...s,
    linkMarketplaceOrders: s.linkMarketplaceOrders.map((order) =>
      order.id === id ? { ...order, ...patch, updatedAt: new Date().toISOString() } : order,
    ),
  }));

// ---- AI Outreach v1 ----

export const addOutreachDraft = (draft: OutreachDraft) =>
  setState((s) => ({ ...s, outreachDrafts: [...s.outreachDrafts, draft] }));

export const updateOutreachDraft = (id: string, patch: Partial<OutreachDraft>) =>
  setState((s) => ({
    ...s,
    outreachDrafts: s.outreachDrafts.map((draft) =>
      draft.id === id ? { ...draft, ...patch, updatedAt: new Date().toISOString() } : draft,
    ),
  }));

/** Mark visibility gap ids as already converted into Opportunities (dedup). */
export const markVisibilityGapsConverted = (analysisId: string, gapIds: string[]) =>
  setState((s) => ({
    ...s,
    aiVisibilityAnalyses: s.aiVisibilityAnalyses.map((a) =>
      a.id === analysisId
        ? { ...a, convertedGapIds: Array.from(new Set([...a.convertedGapIds, ...gapIds])) }
        : a,
    ),
  }));
