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
import type { AgencyBranding, BillingProfile, SubscriptionPlan } from "./billing";
import {
  seedProjects,
  seedServices,
  seedOpportunities,
  seedCalendar,
  seedContent,
} from "./mock-data";
import { supabase } from "@/integrations/supabase/client";
import {
  MAX_PROJECTS_PER_USER,
  MARKET_CURRENCY,
  getPlanLimitsFor,
  isActivePaid,
  planPrice,
} from "./billing";
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
  /** Agency white-label branding (persisted via meta extras; agency plan only). */
  agencyBranding?: AgencyBranding;
  activeProjectId: string;
  /** Whether the active user's workspace has been loaded from Cloud. */
  hydrated: boolean;
  /**
   * The last hydrate attempt FAILED (2026-07-25 outage lesson): a backend blip
   * must read as "couldn't load", never as "you have no workspace" — the old
   * empty-with-hydrated:true fallback dumped real users into the onboarding
   * wizard as if their data were gone. Never persisted.
   */
  hydrationFailed: boolean;
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
  hydrationFailed: false,
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
  hydrationFailed: false,
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

/** Store a DB-acknowledged rev locally. Bypasses setState/scheduleSave on purpose. */
function applyRev(rev: number) {
  state = { ...state, rev };
  notify();
}

// P0 fix 2026-07-25: conflict recovery merges instead of wiping (see
// workspace-merge.ts for the incident and the per-field contract).
// eslint-disable-next-line import/order -- grouped with the fix block
import { type WorkspaceSnapshot } from "./workspace-merge";
import {
  assembleWorkspaceDoc,
  diffWorkspaceDocs,
  splitWorkspaceDoc,
  type WorkspaceBundle,
} from "./workspace-entities";

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
    // `subscription` is deliberately NOT persisted: entitlements live in the
    // service-role-only public.entitlements table and are mirrored into state
    // read-only by refreshEntitlement(). Saving it here would be a no-op
    // anyway (apply_workspace_entity_batch strips it), but leaving it out
    // makes the read-only contract explicit.
    agencyBranding: s.agencyBranding,
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
    // Legacy value in the blob is ignored — refreshEntitlement() supplies it.
    subscription: undefined,
    agencyBranding: d.agencyBranding,
    activeProjectId: (() => {
      const stored = typeof window === "undefined" ? "" : readStoredActiveProject(userId);
      const projects = d.projects ?? [];
      if (stored && projects.some((p) => p.id === stored)) return stored;
      return d.activeProjectId ?? projects[0]?.id ?? "";
    })(),
    hydrated: true,
    hydrationFailed: false,
    userId,
    rev,
  };
}

/**
 * Per-entity persistence (scale migration 2026-07-26).
 *
 * A save no longer uploads the whole workspace doc (169-801 kB): it DIFFS the
 * current snapshot against the last doc known to be in the DB and sends only
 * the changed entities through ONE atomic RPC (~2 kB). Consequences:
 *  - rev conflicts are gone client-side (no whole-doc precondition); per-entity
 *    recency is arbitrated by the DB's newer-wins trigger, so a stale tab
 *    still cannot clobber a cron's publish outcome (the 2026-07-23 incident
 *    class stays fixed, now at the row level).
 *  - the 2026-07-25 outage class (800 kB upsert storms) is structurally gone.
 *
 * `lastSavedDoc` is the diff baseline: the doc as READ from the server (set on
 * hydrate/reload) or as last successfully saved. Never persisted.
 */
let lastSavedDoc: WorkspaceSnapshot | null = null;

// Review M3 (2026-07-25): saves are SERIALIZED. Overlapping saves could diff
// against the same baseline and double-apply; chaining guarantees each save
// snapshots AFTER the previous one advanced the baseline.
let saveChain: Promise<void> = Promise.resolve();

export function saveWorkspaceNow(): Promise<void> {
  const next = saveChain.then(() => saveWorkspaceUnchained());
  // Keep the chain alive through failures; callers still see the rejection.
  saveChain = next.catch(() => undefined);
  return next;
}

async function saveWorkspaceUnchained(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!state.hydrated || !state.userId) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const userId = state.userId;
  const snapshot = persistedSnapshot(state);
  const diff = diffWorkspaceDocs(
    (lastSavedDoc ?? {}) as Record<string, unknown>,
    snapshot as Record<string, unknown>,
  );
  if (diff.isEmpty) return;

  const applyBatch = () =>
    supabase.rpc(
      "apply_workspace_entity_batch" as never,
      {
        p_user_id: userId,
        p_upserts: diff.upserts,
        p_deletes: diff.deletes,
        p_meta: diff.meta,
        p_expected_rev: null,
      } as never,
    );

  let { data: newRev, error } = await applyBatch();
  if (error && /workspace_not_migrated/i.test(error.message ?? "")) {
    // Extremely rare: hydrate's lazy backfill failed earlier. Backfill from
    // the full local snapshot, then retry the batch once.
    const { entities, meta } = splitWorkspaceDoc(snapshot as Record<string, unknown>);
    const { data: created, error: backfillError } = await supabase.rpc(
      "backfill_workspace_entities" as never,
      {
        p_user_id: userId,
        p_entities: entities,
        p_meta: meta,
      } as never,
    );
    if (backfillError) throw error;
    if (created) {
      // OUR backfill created the meta row — it persisted the full snapshot.
      if (state.userId === userId) lastSavedDoc = snapshot;
      return;
    }
    // Review MEDIUM-1: created=false means a CONCURRENT actor migrated the
    // user between our failed batch and the backfill — which then no-opped
    // (ON CONFLICT DO NOTHING). Advancing the baseline here would silently
    // discard every local edit. Retry the batch against the now-existing
    // meta row instead, and fall through to the shared confirm/throw path.
    ({ data: newRev, error } = await applyBatch());
  }
  if (error) throw error; // project-cap + all other errors keep their existing paths
  if (state.userId === userId) {
    lastSavedDoc = snapshot; // baseline advances only after a confirmed write
    applyRev(Number(newRev ?? state.rev + 1));
  }
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

/** State change that must NOT trigger a workspace save (server-owned data). */
const setStateNoSave = (updater: (s: State) => State) => {
  state = updater(state);
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
    // Per-entity read: ONE RPC returns {meta, entities}; null = not migrated.
    const { data: bundleRaw, error } = await supabase.rpc(
      "read_workspace_bundle" as never,
      {
        p_user_id: userId,
      } as never,
    );
    if (error) throw error;

    if (bundleRaw) {
      const bundle = bundleRaw as unknown as WorkspaceBundle;
      const doc = assembleWorkspaceDoc(bundle);
      state = stateFromRow(userId, doc as Partial<State>, Number(bundle.meta.rev ?? 0));
      lastSavedDoc = doc as WorkspaceSnapshot; // diff baseline = the doc as stored
    } else {
      // Legacy blob (pre-migration) or first-run. Either way the backfill RPC
      // creates the entity rows + meta marker; the blob is never written again.
      const { data: row, error: rowError } = await supabase
        .from("workspaces")
        .select("data,rev")
        .eq("user_id", userId)
        .maybeSingle();
      if (rowError) throw rowError;

      const r = row as { data?: unknown } | null;
      const doc = r?.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
      const { entities, meta } = splitWorkspaceDoc(doc);
      const { error: backfillError } = await supabase.rpc(
        "backfill_workspace_entities" as never,
        {
          p_user_id: userId,
          p_entities: entities,
          p_meta: meta,
        } as never,
      );
      // A failed backfill for a user WITH data is non-fatal for this session
      // (the blob copy just rendered); the save path retries the backfill.
      // For a FIRST-RUN user it must fail loudly — otherwise saves have no
      // meta row to write against and the wizard's work would be lost.
      if (backfillError && !r?.data) throw backfillError;
      if (backfillError) {
        console.warn("[workspace] lazy backfill failed — will retry on save", backfillError);
      }
      state = stateFromRow(userId, doc as Partial<State>, 0);
      lastSavedDoc = doc as WorkspaceSnapshot;
    }
  } catch (e) {
    // 2026-07-25 outage lesson: NEVER present a load failure as an empty
    // workspace. Fail loudly instead: the authenticated layout renders a
    // retry screen while hydrationFailed is set, saves stay disabled
    // (hydrated:false), and the onboarding guard stays inert.
    console.warn("[workspace] hydrate failed — showing retry screen", e);
    state = { ...emptyState, hydrationFailed: true, userId };
    lastSavedDoc = null;
  }
  notify();
  // Entitlement is server-owned; mirror it in after the workspace loads.
  await refreshEntitlement();
}

export function resetStore(): void {
  lastSavedDoc = null; // diff baseline is per signed-in user

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
    const { data: bundleRaw } = await supabase.rpc(
      "read_workspace_bundle" as never,
      {
        p_user_id: userId,
      } as never,
    );
    // Guard against a user switch mid-flight: only apply if still the same user.
    if (bundleRaw && state.userId === userId) {
      const bundle = bundleRaw as unknown as WorkspaceBundle;
      const doc = assembleWorkspaceDoc(bundle);
      state = stateFromRow(userId, doc as Partial<State>, Number(bundle.meta.rev ?? 0));
      lastSavedDoc = doc as WorkspaceSnapshot; // fresh server truth = fresh baseline
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

// --- sample (demo) data ---------------------------------------------------
// Rows that originate from `mock-data` are illustrative, not the user's own
// data. They keep their stable seed IDs forever, so identity is enough to tell
// them apart — no extra flag has to be persisted.
const SAMPLE_IDS: ReadonlySet<string> = new Set<string>([
  ...seedProjects.map((p) => p.id),
  ...seedServices.map((s) => s.id),
  ...seedOpportunities.map((o) => o.id),
  ...seedCalendar.map((c) => c.id),
  ...seedContent.map((c) => c.id),
]);

/** True when a row came from the seeded demo workspace rather than the user. */
export const isSampleId = (id: string | undefined | null): boolean =>
  Boolean(id) && SAMPLE_IDS.has(id as string);

/** Whether any seeded demo row is still present in the workspace. */
export const hasSampleData = (s: State): boolean =>
  s.projects.some((p) => isSampleId(p.id)) ||
  s.services.some((x) => isSampleId(x.id)) ||
  s.opportunities.some((x) => isSampleId(x.id)) ||
  s.calendar.some((x) => isSampleId(x.id)) ||
  s.content.some((x) => isSampleId(x.id));

/** One-click removal of every seeded demo row, keeping the user's own work. */
export const clearSampleData = () =>
  setState((s) => {
    const sampleProjectIds = new Set(s.projects.filter((p) => isSampleId(p.id)).map((p) => p.id));
    const keep = <T extends { id: string; projectId?: string }>(rows: T[]) =>
      rows.filter((r) => !isSampleId(r.id) && !(r.projectId && sampleProjectIds.has(r.projectId)));
    const projects = s.projects.filter((p) => !isSampleId(p.id));
    const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
      ? s.activeProjectId
      : (projects[0]?.id ?? "");
    if (s.userId) writeStoredActiveProject(s.userId, activeProjectId);
    return {
      ...s,
      projects,
      services: keep(s.services),
      opportunities: keep(s.opportunities),
      calendar: keep(s.calendar),
      content: keep(s.content),
      activeProjectId,
    };
  });

// --- actions ---
export const setActiveProject = (id: string) =>
  setState((s) => {
    if (s.userId) writeStoredActiveProject(s.userId, id);
    return { ...s, activeProjectId: id };
  });

export const setAgencyBranding = (branding: AgencyBranding | undefined) =>
  setState((s) => ({ ...s, agencyBranding: branding }));

export class ProjectLimitError extends Error {
  constructor(public readonly max: number) {
    super(`Project limit reached (${max}). Upgrade your plan to add more projects.`);
    this.name = "ProjectLimitError";
  }
}

/**
 * Create a project. Non-owner accounts are capped at their PLAN's maxProjects
 * (Agency = 15; everyone else effectively MAX_PROJECTS_PER_USER — the plan
 * must be ACTIVE PAID, since `subscription` is client-writable state and the
 * DB-side cap trigger re-checks the same rule server-side). Owners bypass.
 */
export const addProject = (p: Omit<Project, "id">, opts: { isOwner: boolean }) => {
  const planCap =
    isActivePaid(state.subscription) && getPlanLimitsFor(state.subscription).maxProjects > 0
      ? getPlanLimitsFor(state.subscription).maxProjects
      : MAX_PROJECTS_PER_USER;
  const cap = Math.max(planCap, MAX_PROJECTS_PER_USER);
  if (!opts.isOwner && state.projects.length >= cap) {
    throw new ProjectLimitError(cap);
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

/**
 * Mirror the AUTHORITATIVE entitlement (public.entitlements, service-role
 * write only) into client state for display and soft UI gating. There is no
 * client-side setter: the browser cannot grant itself a plan, and anything
 * unreadable resolves to Free Preview.
 */
export async function refreshEntitlement(): Promise<void> {
  try {
    const { getMyEntitlementFn } = await import("./entitlements.functions");
    const { entitlement } = await getMyEntitlementFn();
    const paid = entitlement.planId !== "freePreview";
    const market = state.billingProfile?.billingMarket ?? "Other";
    setStateNoSave((s) => ({
      ...s,
      subscription: paid
        ? {
            planId: entitlement.planId,
            status: entitlement.status,
            billingMarket: market,
            currency: MARKET_CURRENCY[market],
            priceMonthly: planPrice(market, entitlement.planId),
            paddleCustomerId: entitlement.providerCustomerId,
            paddleSubscriptionId: entitlement.providerSubscriptionId,
            currentPeriodEnd: entitlement.currentPeriodEnd,
            cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
            updatedAt: entitlement.updatedAt,
          }
        : undefined,
    }));
  } catch {
    // Fail closed: no entitlement data means Free Preview.
    setStateNoSave((s) => ({ ...s, subscription: undefined }));
  }
}

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
