/**
 * Phase 1B.2 — server-side pending action operations (dark: nothing exposes
 * these yet; the MCP tools arrive in 1B.3 and the UI in 1B.4/1B.5).
 *
 * All writes go through the rev-guarded workspace write layer (mutateWorkspace)
 * with ids/timestamps minted BEFORE the mutation so conflict retries never
 * generate fresh identity (1A rule). Reads are pure and never persist; the
 * lazy-expiry sweep is persisted only on write paths (create — and resolve,
 * in 1B.5), while read paths report an EFFECTIVE status so stale items always
 * display as expired. Approval/reject/apply server functions are deliberately
 * deferred to 1B.5 (owner-UI work).
 */
import { newOpportunityRecord } from "./opportunities";
import type { PendingAction, PendingActionStatus, PendingActionType } from "./types";
import type { Opportunity, Project, ServiceItem } from "./types";
import {
  createPendingAction,
  expireStalePendingActions,
  isPendingActionExpired,
  MAX_PROJECT_SETUP_OPPORTUNITIES,
  MAX_PROJECT_SETUP_SERVICES,
  PROJECT_SETUP_PROJECT_FIELDS,
  type CreatePendingActionInput,
  type OpportunityUpdatePayload,
  type ProjectSetupProposalPayload,
} from "./pending-actions";

// Runtime mirrors of the 1A write layer's conventions (mcp.server.ts keeps its
// own copies; importing from there would be circular).
const LANGUAGES = ["Polish", "Swedish", "English", "Danish"];
const MAX_OPPORTUNITIES = 1000;

/** Uniform not-found (unknown project/opportunity/action — callers map to -32011). */
export class PendingActionNotFoundError extends Error {
  constructor() {
    super("not_found");
    this.name = "PendingActionNotFoundError";
  }
}

/** Effective status: stored status, except stale pending items read as expired. */
function effectiveStatus(a: PendingAction, nowMs: number): PendingActionStatus {
  return isPendingActionExpired(a, nowMs) ? "expired" : a.status;
}

function actionsFrom(data: Record<string, unknown>): PendingAction[] {
  return ((data.pendingActions as PendingAction[] | undefined) ?? []).filter(Boolean);
}

export interface CreatePendingActionResult {
  action: PendingAction;
  deduped: boolean;
  /** Ids flipped to expired by the lazy sweep that rode this write. */
  expiredIds: string[];
  rev: number;
}

/**
 * Create a pending action in the owner's workspace. Validates shape/size/cap
 * via the pure 1B.1 helpers, dedupes on requestId, verifies the target project
 * (and, for opportunity updates, the target opportunity) exists — unknown
 * targets throw the uniform PendingActionNotFoundError. The lazy expiry sweep
 * rides the same atomic mutation.
 */
export async function createPendingActionForWorkspace(
  userId: string,
  input: CreatePendingActionInput,
  deps?: { id?: string; nowIso?: string },
): Promise<CreatePendingActionResult> {
  const { mutateWorkspace } = await import("./workspace.server");
  const entityId = deps?.id ?? Math.random().toString(36).slice(2, 10);
  const nowIso = deps?.nowIso ?? new Date().toISOString();

  const { result, rev } = await mutateWorkspace<Omit<CreatePendingActionResult, "rev">>(userId, (data) => {
    const swept = expireStalePendingActions(actionsFrom(data), nowIso);
    const { actions, action, deduped } = createPendingAction(swept.actions, input, { id: entityId, nowIso });

    if (!deduped) {
      const projects = ((data.projects as Partial<Project>[] | undefined) ?? []).filter(Boolean);
      if (!projects.some((p) => p.id === action.projectId)) throw new PendingActionNotFoundError();
      if (action.type === "opportunity_update_proposal") {
        const payload = action.payload as unknown as OpportunityUpdatePayload;
        const opportunities = ((data.opportunities as Partial<Opportunity>[] | undefined) ?? []).filter(Boolean);
        if (!opportunities.some((o) => o.id === payload.opportunityId)) throw new PendingActionNotFoundError();
      }
    }

    return {
      data: { ...data, pendingActions: [...actions] },
      result: { action, deduped, expiredIds: swept.expiredIds },
    };
  });
  return { ...result, rev };
}

/** Bounded list item — no payload/preview bodies (get returns the full action). */
export interface PendingActionSummary {
  id: string;
  type: PendingActionType;
  projectId: string;
  title: string;
  summary: string;
  status: PendingActionStatus;
  riskLevel: PendingAction["riskLevel"];
  requiredScope: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  requestId?: string;
}

export interface ListPendingActionsFilter {
  projectId?: string;
  status?: PendingActionStatus;
  type?: PendingActionType;
  /**
   * Own-proposal visibility for MCP callers: exact match on the proposing
   * client id. An empty string matches nothing (grants without a client id
   * see no proposals). Omit entirely for owner-side (UI) listings.
   */
  proposedByClientId?: string;
}

/**
 * List pending actions (summaries, newest first). Pure read — the effective
 * status reflects lazy expiry without persisting it; filters apply to the
 * effective status.
 */
export async function listPendingActionsForWorkspace(
  userId: string,
  filter?: ListPendingActionsFilter,
  deps?: { nowMs?: number },
): Promise<PendingActionSummary[]> {
  const { readWorkspaceRow, WorkspaceNotFoundError } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) throw new WorkspaceNotFoundError();
  const nowMs = deps?.nowMs ?? Date.now();

  return actionsFrom(row.data)
    .map((a) => ({ a, status: effectiveStatus(a, nowMs) }))
    .filter(({ a, status }) => {
      if (filter?.projectId && a.projectId !== filter.projectId) return false;
      if (filter?.status && status !== filter.status) return false;
      if (filter?.type && a.type !== filter.type) return false;
      if (filter?.proposedByClientId !== undefined && a.proposedByClientId !== filter.proposedByClientId) return false;
      return true;
    })
    .sort((x, y) => Date.parse(y.a.createdAt) - Date.parse(x.a.createdAt))
    .map(({ a, status }) => ({
      id: a.id,
      type: a.type,
      projectId: a.projectId,
      title: a.title,
      summary: a.summary,
      status,
      riskLevel: a.riskLevel,
      requiredScope: a.requiredScope,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      ...(a.expiresAt ? { expiresAt: a.expiresAt } : {}),
      ...(a.requestId ? { requestId: a.requestId } : {}),
    }));
}

/** Get one pending action by id (full record, effective status). Uniform not-found. */
export async function getPendingActionForWorkspace(
  userId: string,
  actionId: string,
  deps?: { nowMs?: number },
): Promise<PendingAction> {
  const { readWorkspaceRow, WorkspaceNotFoundError } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) throw new WorkspaceNotFoundError();
  const found = actionsFrom(row.data).find((a) => a.id === actionId);
  if (!found) throw new PendingActionNotFoundError();
  const status = effectiveStatus(found, deps?.nowMs ?? Date.now());
  return status === found.status ? found : { ...found, status };
}

// ---------------------------------------------------------------------------
// Phase 1B.5 — owner-only resolution (approve & apply / reject). NEVER exposed
// via MCP: the only caller is the authenticated Milo server function, and the
// workspace row is the caller's own (owner-only by construction).
// ---------------------------------------------------------------------------

/** Non-exceptional resolve failures — fail closed, nothing is written. */
export class PendingActionResolveError extends Error {
  constructor(public readonly reason: "not_pending" | "expired" | "target_missing" | "invalid") {
    super(reason);
    this.name = "PendingActionResolveError";
  }
}

/** Counts from a project_setup_proposal apply — audit metadata only (never values). */
export interface ProjectSetupApplySummary {
  createdServices: number;
  createdOpportunities: number;
  skippedServiceDuplicates: number;
  skippedOpportunityDuplicates: number;
  skippedOpportunityOverflow: number;
}

export interface ResolvePendingActionResult {
  action: PendingAction;
  status: "applied" | "rejected";
  /** Other stale pending items flipped by the sweep that rode this write. */
  expiredIds: string[];
  rev: number;
  /** Set only when a project_setup_proposal was applied. */
  applySummary?: ProjectSetupApplySummary;
}

/**
 * Resolve one pending action in a SINGLE atomic mutation (one rev bump):
 *
 * - `approve_apply` (decision §11.5: one owner confirmation, applies
 *   immediately): re-validate the payload against current state, verify the
 *   target still exists, apply ONLY whitelisted changes (1B: merge onto the
 *   target opportunity; 1C: merge project fields + create services and
 *   opportunities), and transition pending → approved → applied with
 *   resolution metadata.
 * - `reject`: transition pending → rejected (optional owner note); target
 *   data untouched.
 *
 * Fail-closed semantics: any failure (unknown action, already resolved,
 *   expired, missing target, invalid payload) throws WITHOUT writing — no
 *   partial apply, no rev bump, and no persisted sweep. The lazy-expiry sweep
 *   is persisted only when the resolve itself succeeds; an action past its
 *   own expiresAt resolves to the `expired` error (its stored flip happens on
 *   the next successful write, and reads already display it as expired).
 */
export async function resolvePendingActionForWorkspace(
  userId: string,
  input: { actionId: string; resolution: "approve_apply" | "reject"; note?: string },
  deps?: { nowIso?: string; ids?: string[] },
): Promise<ResolvePendingActionResult> {
  const { mutateWorkspace } = await import("./workspace.server");
  const {
    validatePendingActionPayload,
    approvePendingAction,
    rejectPendingAction,
    markPendingActionApplied,
    isPendingActionExpired,
  } = await import("./pending-actions");
  const nowIso = deps?.nowIso ?? new Date().toISOString();
  // Entity ids minted BEFORE the mutation (1A rule: conflict retries re-run the
  // callback and must not generate fresh identity). The pool covers the maximum
  // a project_setup_proposal can create; assignment order is deterministic.
  const idPool =
    deps?.ids ??
    Array.from({ length: MAX_PROJECT_SETUP_SERVICES + MAX_PROJECT_SETUP_OPPORTUNITIES }, () => Math.random().toString(36).slice(2, 10));

  const { result, rev } = await mutateWorkspace<Omit<ResolvePendingActionResult, "rev">>(userId, (data) => {
    const swept = expireStalePendingActions(actionsFrom(data), nowIso);
    const list = [...swept.actions];
    const idx = list.findIndex((a) => a.id === input.actionId);
    if (idx < 0) throw new PendingActionNotFoundError();
    const action = list[idx];
    if (action.status !== "pending") {
      throw new PendingActionResolveError(swept.expiredIds.includes(action.id) ? "expired" : "not_pending");
    }
    // Belt-and-braces: the sweep should already have flipped stale items.
    if (isPendingActionExpired(action, Date.parse(nowIso))) throw new PendingActionResolveError("expired");

    if (input.resolution === "reject") {
      const rejected = rejectPendingAction(action, nowIso, input.note ? { note: input.note } : undefined);
      list[idx] = rejected;
      return {
        data: { ...data, pendingActions: list },
        result: { action: rejected, status: "rejected" as const, expiredIds: swept.expiredIds },
      };
    }

    // approve_apply — re-validate everything against CURRENT state.
    let validatedPayload: Record<string, unknown>;
    try {
      validatedPayload = validatePendingActionPayload(action.type, action.payload);
    } catch {
      throw new PendingActionResolveError("invalid");
    }

    // ---- project_setup_proposal (Phase 1C.2) ----------------------------
    // Merge whitelisted project fields + create services/opportunities in
    // THIS same mutation. Hand-written field mapping only — there is no
    // generic spread of payload data onto the project, so excluded fields
    // (name, websiteUrl, setupComplete, market/currency/appLanguage,
    // publishing/connector, GSC, billing, identity) are unreachable even
    // from a tampered stored payload (which re-validation rejects anyway).
    if (action.type === "project_setup_proposal") {
      const setup = validatedPayload as unknown as ProjectSetupProposalPayload;
      const projects = ((data.projects as Project[] | undefined) ?? []).filter(Boolean);
      const projIdx = projects.findIndex((p) => p.id === action.projectId);
      if (projIdx < 0) throw new PendingActionResolveError("target_missing");
      const project = projects[projIdx];

      let cursor = 0;
      const nextId = () => idPool[cursor++];
      const norm = (s: unknown) =>
        String(s ?? "")
          .trim()
          .toLowerCase();

      const nextProjects = [...projects];
      const f = setup.projectFields;
      if (f) {
        const merged: Project = { ...project };
        if (f.businessName !== undefined) merged.businessName = f.businessName;
        if (f.businessType !== undefined) merged.businessType = f.businessType;
        if (f.description !== undefined) merged.description = f.description;
        if (f.targetAudience !== undefined) merged.targetAudience = f.targetAudience;
        if (f.toneOfVoice !== undefined) merged.toneOfVoice = f.toneOfVoice;
        if (f.uniqueSellingPoints !== undefined) merged.uniqueSellingPoints = f.uniqueSellingPoints;
        if (f.brandNotes !== undefined) merged.brandNotes = f.brandNotes;
        if (f.mainLocation !== undefined) merged.mainLocation = f.mainLocation;
        if (f.targetLocations !== undefined) merged.targetLocations = [...f.targetLocations];
        if (f.primaryLanguage !== undefined) merged.primaryLanguage = f.primaryLanguage as Project["primaryLanguage"];
        if (f.additionalLanguages !== undefined) merged.additionalLanguages = [...f.additionalLanguages] as Project["additionalLanguages"];
        // Overwritten ONLY when explicitly present in the validated payload.
        if (f.competitorUrls !== undefined) merged.competitorUrls = [...f.competitorUrls];
        nextProjects[projIdx] = merged;
      }

      // Services: create-only, ids minted server-side, projectId forced from
      // the envelope. Dedupe case-insensitively by trimmed name against the
      // project's existing services AND earlier items in this proposal —
      // duplicates are skipped, never fatal.
      const services = ((data.services as ServiceItem[] | undefined) ?? []).filter(Boolean);
      const seenServiceNames = new Set(services.filter((s) => s.projectId === action.projectId).map((s) => norm(s.name)));
      const createdServices: ServiceItem[] = [];
      let skippedServiceDuplicates = 0;
      for (const item of setup.services ?? []) {
        const key = norm(item.name);
        if (seenServiceNames.has(key)) {
          skippedServiceDuplicates += 1;
          continue;
        }
        seenServiceNames.add(key);
        createdServices.push({
          id: nextId(),
          projectId: action.projectId,
          name: item.name,
          kind: item.kind as ServiceItem["kind"],
          description: item.description ?? "",
          targetAudience: item.targetAudience ?? "",
          locationRelevance: item.locationRelevance ?? "",
          priority: (item.priority ?? "Medium") as ServiceItem["priority"],
        });
      }

      // Opportunities: create-only with the 1A defaults, status "New"
      // (decision 3a8f7aa §12.4), source "claude", language from the target
      // project. Same dedupe discipline by trimmed title; the workspace
      // opportunity cap is respected by deterministically skipping overflow
      // items (payload order) and counting them.
      const existingOpportunities = ((data.opportunities as Opportunity[] | undefined) ?? []).filter(Boolean);
      const seenTitles = new Set(existingOpportunities.filter((o) => o.projectId === action.projectId).map((o) => norm(o.title)));
      const language = LANGUAGES.includes(String(project.primaryLanguage)) ? (project.primaryLanguage as Opportunity["language"]) : "English";
      const createdOpportunities: Opportunity[] = [];
      let skippedOpportunityDuplicates = 0;
      let skippedOpportunityOverflow = 0;
      for (const item of setup.opportunities ?? []) {
        const key = norm(item.title);
        if (seenTitles.has(key)) {
          skippedOpportunityDuplicates += 1;
          continue;
        }
        if (existingOpportunities.length + createdOpportunities.length >= MAX_OPPORTUNITIES) {
          skippedOpportunityOverflow += 1;
          continue;
        }
        seenTitles.add(key);
        // Canonical lifecycle on write; legacy labels stay read-compatible via
        // opportunityView but are never persisted again.
        createdOpportunities.push(
          newOpportunityRecord({
            id: nextId(),
            projectId: action.projectId,
            title: item.title,
            language,
            contentType: (item.contentType ?? "Blog Article") as Opportunity["contentType"],
            searchIntent: (item.searchIntent ?? "Informational") as Opportunity["searchIntent"],
            targetAudience: item.targetAudience ?? String(project.targetAudience ?? ""),
            businessValue: item.businessValue ?? "Suggested via the Claude connector",
            recommendedCta: item.recommendedCta ?? "",
            priority: (item.priority ?? "Medium") as Opportunity["priority"],
            source: "claude",
            createdAt: nowIso,
          }),
        );
      }

      const applySummary: ProjectSetupApplySummary = {
        createdServices: createdServices.length,
        createdOpportunities: createdOpportunities.length,
        skippedServiceDuplicates,
        skippedOpportunityDuplicates,
        skippedOpportunityOverflow,
      };
      // Only entities actually created — skipped duplicates/overflow never
      // appear as applied ids.
      const appliedEntityIds = [...createdServices.map((s) => s.id), ...createdOpportunities.map((o) => o.id)];
      const applied = markPendingActionApplied(approvePendingAction(action, nowIso), nowIso, { appliedEntityIds });
      if (input.note) applied.resolution = { ...applied.resolution!, note: input.note };
      list[idx] = applied;

      return {
        data: {
          ...data,
          projects: nextProjects,
          services: [...services, ...createdServices],
          opportunities: [...existingOpportunities, ...createdOpportunities],
          pendingActions: list,
        },
        result: { action: applied, status: "applied" as const, expiredIds: swept.expiredIds, applySummary },
      };
    }

    // ---- opportunity_update_proposal (Phase 1B) -------------------------
    const payload = validatedPayload as unknown as OpportunityUpdatePayload;
    const opportunities = ((data.opportunities as Opportunity[] | undefined) ?? []).filter(Boolean);
    const oppIdx = opportunities.findIndex((o) => o.id === payload.opportunityId);
    if (oppIdx < 0) throw new PendingActionResolveError("target_missing");

    // Whitelisted merge only — validatePendingActionPayload guarantees the
    // updates object contains nothing outside OPPORTUNITY_UPDATE_FIELDS and
    // that priority/contentType hold valid union members.
    const nextOpportunities = [...opportunities];
    nextOpportunities[oppIdx] = { ...opportunities[oppIdx], ...(payload.updates as Partial<Opportunity>) };

    const applied = markPendingActionApplied(approvePendingAction(action, nowIso), nowIso, {
      appliedEntityIds: [payload.opportunityId],
    });
    if (input.note) applied.resolution = { ...applied.resolution!, note: input.note };
    list[idx] = applied;

    return {
      data: { ...data, pendingActions: list, opportunities: nextOpportunities },
      result: { action: applied, status: "applied" as const, expiredIds: swept.expiredIds },
    };
  });
  return { ...result, rev };
}

/** Lifecycle audit events for owner resolution (names/ids only — never note
 * text, titles, summaries, payload values, or token material). */
export type PendingActionLifecycleEvent =
  | "pending_action_approved"
  | "pending_action_applied"
  | "pending_action_rejected"
  | "pending_action_expired";

/**
 * Names/counts-only audit metadata for a project_setup_proposal. fieldsChanged
 * intersects the raw payload keys with the project-setup whitelist (the
 * `006eaf8` failure-audit hardening applied to the new type from day one), so
 * a tampered stored payload's unknown key names can never reach a log row.
 * Values — business names, service names, opportunity titles, competitor
 * URLs — are never read.
 */
function projectSetupAuditMeta(action: PendingAction): { fieldsChanged: string[]; serviceCount: number; opportunityCount: number; competitorCount: number } {
  const p = action.payload as { projectFields?: unknown; services?: unknown; opportunities?: unknown };
  const pf = p.projectFields && typeof p.projectFields === "object" && !Array.isArray(p.projectFields) ? (p.projectFields as Record<string, unknown>) : {};
  return {
    fieldsChanged: Object.keys(pf)
      .filter((k) => (PROJECT_SETUP_PROJECT_FIELDS as readonly string[]).includes(k))
      .sort(),
    serviceCount: Array.isArray(p.services) ? p.services.length : 0,
    opportunityCount: Array.isArray(p.opportunities) ? p.opportunities.length : 0,
    competitorCount: Array.isArray(pf.competitorUrls) ? (pf.competitorUrls as unknown[]).length : 0,
  };
}

/** fieldsChanged (sorted names only) per type — 1B behavior unchanged. */
function auditFieldsChanged(action: PendingAction): string[] {
  if (action.type === "project_setup_proposal") return projectSetupAuditMeta(action).fieldsChanged;
  const updates = (action.payload as { updates?: Record<string, unknown> }).updates ?? {};
  return Object.keys(updates).sort();
}

export function buildPendingActionResolutionAudit(
  action: PendingAction,
  event: Exclude<PendingActionLifecycleEvent, "pending_action_expired">,
  opts: { ok: boolean; expiredIds?: string[]; appliedAtRev?: number; applySummary?: ProjectSetupApplySummary },
): { event: PendingActionLifecycleEvent; detail: Record<string, unknown> } {
  return {
    event,
    detail: {
      actionId: action.id,
      type: action.type,
      projectId: action.projectId,
      status: action.status,
      resolution: event.replace("pending_action_", ""),
      fieldsChanged: auditFieldsChanged(action),
      ...(action.requestId ? { requestId: action.requestId } : {}),
      ...(opts.expiredIds?.length ? { expiredIds: opts.expiredIds } : {}),
      ...(opts.appliedAtRev !== undefined ? { appliedAtRev: opts.appliedAtRev } : {}),
      // 1C: what an applied setup proposal created (ids + counts only).
      ...(action.type === "project_setup_proposal" && action.resolution?.appliedEntityIds ? { appliedEntityIds: action.resolution.appliedEntityIds } : {}),
      ...(opts.applySummary ? { ...opts.applySummary } : {}),
      source: "milo_ui",
      ok: opts.ok,
    },
  };
}

// ---------------------------------------------------------------------------
// Audit event shape (design finalized in 1B.2; persisted by the 1B.3 dispatch
// hooks alongside the other connector events).
// ---------------------------------------------------------------------------

export interface PendingActionCreatedAudit {
  event: "pending_action_created";
  detail: Record<string, unknown>;
}

/**
 * Build the pending_action_created audit event. Names and ids ONLY — titles,
 * summaries, previews, payload values, tokens/hashes/family ids never enter
 * the detail. fieldsChanged carries the proposed update FIELD NAMES, sorted
 * (1A mcp_write convention).
 */
export function buildPendingActionCreatedAudit(
  action: PendingAction,
  opts: { deduped?: boolean; ok: boolean; error?: string },
): PendingActionCreatedAudit {
  const setupMeta = action.type === "project_setup_proposal" ? projectSetupAuditMeta(action) : undefined;
  return {
    event: "pending_action_created",
    detail: {
      actionId: action.id,
      type: action.type,
      projectId: action.projectId,
      status: action.status,
      riskLevel: action.riskLevel,
      requiredScope: action.requiredScope,
      fieldsChanged: auditFieldsChanged(action),
      // 1C: setup proposals carry counts (metadata only, never values).
      ...(setupMeta ? { serviceCount: setupMeta.serviceCount, opportunityCount: setupMeta.opportunityCount, competitorCount: setupMeta.competitorCount } : {}),
      ...(action.requestId ? { requestId: action.requestId } : {}),
      ...(opts.deduped ? { deduped: true } : {}),
      ...(opts.error ? { error: opts.error } : {}),
      ok: opts.ok,
    },
  };
}
