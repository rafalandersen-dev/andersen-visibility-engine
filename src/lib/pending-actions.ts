/**
 * Phase 1B.1 — pending actions (proposals) validation + pure lifecycle helpers.
 *
 * Claude proposes; the owner disposes. This module is deliberately INERT and
 * pure (no DB, no MCP, no OAuth imports): 1B.2+ wire it into the server write
 * layer, the MCP dispatch, and the UI. Everything here operates on plain
 * values so the callers (and tests) control ids and clocks.
 *
 * Design source: docs/CLAUDE-PHASE-1B-PENDING-ACTIONS-BLUEPRINT.md (§2–§3,
 * §6–§7, decisions §11). First implementation ships exactly one type:
 * opportunity_update_proposal — Claude suggests edits to an existing
 * opportunity, the owner approves in the Milo UI, apply merges only
 * whitelisted fields. No publish, no delete, no settings, no billing.
 */
import type {
  PendingAction,
  PendingActionRiskLevel,
  PendingActionStatus,
  PendingActionType,
} from "./types";

// ---- constants ----

/** The write-class scope that governs proposing (weaker than milo.*.write). */
export const MILO_ACTIONS_PROPOSE_SCOPE = "milo.actions.propose";

export const PENDING_ACTIONS_CAP = 200;
export const MAX_PENDING_ACTION_PAYLOAD_BYTES = 16 * 1024;
export const MAX_PENDING_ACTION_PREVIEW_BYTES = 4 * 1024;
/** Lazy expiry horizon (decision §11.6): 14 days, no cron. */
export const PENDING_ACTION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Types Claude may CREATE. Deliberately narrower than the PendingActionType
 * union while a type is schema-only: project_setup_proposal (1C.1) has a
 * validator below but stays uncreatable — createPendingAction rejects it —
 * until the apply branch (1C.2) and MCP exposure (1C.3) land.
 */
export const PENDING_ACTION_TYPES = ["opportunity_update_proposal"] as const;

/** The ONLY fields an opportunity_update_proposal may touch. */
export const OPPORTUNITY_UPDATE_FIELDS = ["title", "businessValue", "priority", "contentType", "recommendedCta"] as const;
export type OpportunityUpdateField = (typeof OPPORTUNITY_UPDATE_FIELDS)[number];

// ---- Phase 1C project_setup_proposal whitelists + caps (blueprint §3.2) ----
// Project identity/ops fields (name, websiteUrl, setupComplete, market,
// currency, publishing/connector, GSC, billing…) are NOT listed here, so they
// fail closed as unknown fields at validation — inexpressible by construction.
export const PROJECT_SETUP_PROJECT_FIELDS = [
  "businessName",
  "businessType",
  "description",
  "targetAudience",
  "toneOfVoice",
  "uniqueSellingPoints",
  "brandNotes",
  "mainLocation",
  "targetLocations",
  "primaryLanguage",
  "additionalLanguages",
  "competitorUrls",
] as const;
export const PROJECT_SETUP_SERVICE_FIELDS = ["name", "kind", "description", "targetAudience", "locationRelevance", "priority"] as const;
export const PROJECT_SETUP_OPPORTUNITY_FIELDS = ["title", "contentType", "searchIntent", "targetAudience", "businessValue", "recommendedCta", "priority"] as const;
export const MAX_PROJECT_SETUP_SERVICES = 10;
export const MAX_PROJECT_SETUP_OPPORTUNITIES = 10;
export const MAX_PROJECT_SETUP_TARGET_LOCATIONS = 10;
export const MAX_PROJECT_SETUP_ADDITIONAL_LANGUAGES = 3;
export const MAX_PROJECT_SETUP_COMPETITOR_URLS = 5;

// Runtime mirrors of erased unions (same values as the 1A write tools).
const PRIORITIES = ["High", "Medium", "Low"];
const CONTENT_TYPES = ["Landing Page", "Service Page", "Blog Article", "Guide", "FAQ Page", "Comparison", "Location Page"];
const LANGUAGES = ["Polish", "Swedish", "English", "Danish"];
const SEARCH_INTENTS = ["Informational", "Commercial", "Transactional", "Navigational"];
const SERVICE_KINDS = ["Service", "Product"];

/** riskLevel is DERIVED from the type — callers never supply it. */
const RISK_BY_TYPE: Record<PendingActionType, PendingActionRiskLevel> = {
  opportunity_update_proposal: "medium", // mutates existing owner data on apply
  project_setup_proposal: "medium", // overwrites project fields on apply (decision 3a8f7aa §12.7)
};

export function derivePendingActionRisk(type: PendingActionType): PendingActionRiskLevel {
  return RISK_BY_TYPE[type];
}

// ---- errors ----

/** Invalid shape/field/size — callers map this to -32010. */
export class PendingActionValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "PendingActionValidationError";
  }
}

/** pendingActions[] is full — callers map this to -32013. */
export class PendingActionCapError extends Error {
  constructor() {
    super(`pending actions limit reached (${PENDING_ACTIONS_CAP})`);
    this.name = "PendingActionCapError";
  }
}

/** Disallowed status transition — resolve paths fail closed on these. */
export class PendingActionTransitionError extends Error {
  constructor(from: PendingActionStatus, to: PendingActionStatus) {
    super(`invalid pending action transition: ${from} -> ${to}`);
    this.name = "PendingActionTransitionError";
  }
}

// ---- validation ----

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Bounded trimmed string (1A style). Throws PendingActionValidationError. */
function str(field: string, v: unknown, min: number, max: number, required: boolean): string | undefined {
  if (v === undefined || v === null) {
    if (required) throw new PendingActionValidationError(field, "is required");
    return undefined;
  }
  if (typeof v !== "string") throw new PendingActionValidationError(field, "must be a string");
  const t = v.trim();
  if (t.length < min) throw new PendingActionValidationError(field, `must be at least ${min} character(s)`);
  if (t.length > max) throw new PendingActionValidationError(field, `must be at most ${max} characters`);
  return t;
}

export interface OpportunityUpdatePayload {
  opportunityId: string;
  updates: Partial<Record<OpportunityUpdateField, string>>;
}

/** Phase 1C — composite setup proposal payload (blueprint §3.2, all groups optional, ≥1 required). */
export interface ProjectSetupProposalPayload {
  projectFields?: {
    businessName?: string;
    businessType?: string;
    description?: string;
    targetAudience?: string;
    toneOfVoice?: string;
    uniqueSellingPoints?: string;
    brandNotes?: string;
    mainLocation?: string;
    targetLocations?: string[];
    primaryLanguage?: string;
    additionalLanguages?: string[];
    competitorUrls?: string[];
  };
  services?: Array<{
    name: string;
    kind: string;
    description?: string;
    targetAudience?: string;
    locationRelevance?: string;
    priority?: string;
  }>;
  opportunities?: Array<{
    title: string;
    contentType?: string;
    searchIntent?: string;
    targetAudience?: string;
    businessValue?: string;
    recommendedCta?: string;
    priority?: string;
  }>;
}

/**
 * Strict per-type payload validation. Unknown keys are rejected at every
 * level, so publish/delete/settings/billing-shaped payloads fail closed as
 * unknown fields. The serialized-size cap is checked FIRST (defense in depth
 * against oversized blobs, independent of field bounds).
 */
export function validatePendingActionPayload(type: PendingActionType, payload: unknown): Record<string, unknown> {
  if (!isPlainObject(payload)) throw new PendingActionValidationError("payload", "must be an object");
  if (utf8Bytes(JSON.stringify(payload)) > MAX_PENDING_ACTION_PAYLOAD_BYTES) {
    throw new PendingActionValidationError("payload", `must be at most ${MAX_PENDING_ACTION_PAYLOAD_BYTES} bytes`);
  }

  if (type === "project_setup_proposal") return validateProjectSetupPayload(payload) as unknown as Record<string, unknown>;
  if (type !== "opportunity_update_proposal") throw new PendingActionValidationError("type", "unknown pending action type");

  for (const k of Object.keys(payload)) {
    if (k !== "opportunityId" && k !== "updates") throw new PendingActionValidationError(`payload.${k}`, "unknown field");
  }
  const opportunityId = str("payload.opportunityId", payload.opportunityId, 1, 100, true)!;
  const rawUpdates = payload.updates;
  if (!isPlainObject(rawUpdates)) throw new PendingActionValidationError("payload.updates", "must be an object");
  const keys = Object.keys(rawUpdates);
  if (keys.length === 0) throw new PendingActionValidationError("payload.updates", "must contain at least one field");
  for (const k of keys) {
    if (!(OPPORTUNITY_UPDATE_FIELDS as readonly string[]).includes(k)) {
      throw new PendingActionValidationError(`payload.updates.${k}`, "unknown field");
    }
  }

  const updates: Partial<Record<OpportunityUpdateField, string>> = {};
  const title = str("payload.updates.title", rawUpdates.title, 1, 200, false);
  if (title !== undefined) updates.title = title;
  const businessValue = str("payload.updates.businessValue", rawUpdates.businessValue, 1, 2000, false);
  if (businessValue !== undefined) updates.businessValue = businessValue;
  const recommendedCta = str("payload.updates.recommendedCta", rawUpdates.recommendedCta, 1, 200, false);
  if (recommendedCta !== undefined) updates.recommendedCta = recommendedCta;
  const priority = str("payload.updates.priority", rawUpdates.priority, 1, 10, false);
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) throw new PendingActionValidationError("payload.updates.priority", "must be High, Medium or Low");
    updates.priority = priority;
  }
  const contentType = str("payload.updates.contentType", rawUpdates.contentType, 1, 40, false);
  if (contentType !== undefined) {
    if (!CONTENT_TYPES.includes(contentType)) throw new PendingActionValidationError("payload.updates.contentType", "must be a valid Milo content type");
    updates.contentType = contentType;
  }

  const validated: OpportunityUpdatePayload = { opportunityId, updates };
  return validated as unknown as Record<string, unknown>;
}

/** Bounded string array: rejects empties, enforces per-item bounds, caps length. */
function strArray(field: string, v: unknown, itemMin: number, itemMax: number, maxItems: number): string[] {
  if (!Array.isArray(v)) throw new PendingActionValidationError(field, "must be an array");
  if (v.length === 0) throw new PendingActionValidationError(field, "must contain at least one item");
  if (v.length > maxItems) throw new PendingActionValidationError(field, `must contain at most ${maxItems} items`);
  return v.map((item, i) => str(`${field}[${i}]`, item, itemMin, itemMax, true)!);
}

/** Enum-mirror check for an already-bounded string. */
function oneOf(field: string, v: string, allowed: readonly string[], label: string): string {
  if (!allowed.includes(v)) throw new PendingActionValidationError(field, `must be one of: ${label}`);
  return v;
}

/** https-only URL (blueprint §3.2): parseable, https protocol, non-empty host. */
function httpsUrl(field: string, v: string): string {
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new PendingActionValidationError(field, "must be a valid https URL");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) {
    throw new PendingActionValidationError(field, "must be a valid https URL");
  }
  return v;
}

/**
 * Phase 1C — project_setup_proposal payload validation (blueprint §3.2,
 * decisions 3a8f7aa §12). Same fail-closed discipline as the 1B validator:
 * unknown keys rejected recursively at every level (project identity/ops
 * fields are simply not whitelisted, so name/websiteUrl/setupComplete/
 * publishing/GSC/billing-shaped payloads all die here), string bounds and
 * array caps enforced, enum-backed fields checked against runtime mirrors.
 * competitorUrls/additionalLanguages are deduplicated, order-preserving.
 * NOTE: validation only — apply semantics (defaults, dedupe against existing
 * entities, status "New", setupComplete untouched) land in 1C.2.
 */
export function validateProjectSetupPayload(payload: Record<string, unknown>): ProjectSetupProposalPayload {
  for (const k of Object.keys(payload)) {
    if (k !== "projectFields" && k !== "services" && k !== "opportunities") {
      throw new PendingActionValidationError(`payload.${k}`, "unknown field");
    }
  }

  const validated: ProjectSetupProposalPayload = {};

  if (payload.projectFields !== undefined) {
    const raw = payload.projectFields;
    if (!isPlainObject(raw)) throw new PendingActionValidationError("payload.projectFields", "must be an object");
    if (Object.keys(raw).length === 0) throw new PendingActionValidationError("payload.projectFields", "must contain at least one field");
    for (const k of Object.keys(raw)) {
      if (!(PROJECT_SETUP_PROJECT_FIELDS as readonly string[]).includes(k)) {
        throw new PendingActionValidationError(`payload.projectFields.${k}`, "unknown field");
      }
    }
    const f: NonNullable<ProjectSetupProposalPayload["projectFields"]> = {};
    const businessName = str("payload.projectFields.businessName", raw.businessName, 1, 200, false);
    if (businessName !== undefined) f.businessName = businessName;
    const businessType = str("payload.projectFields.businessType", raw.businessType, 1, 200, false);
    if (businessType !== undefined) f.businessType = businessType;
    const description = str("payload.projectFields.description", raw.description, 1, 2000, false);
    if (description !== undefined) f.description = description;
    const targetAudience = str("payload.projectFields.targetAudience", raw.targetAudience, 1, 500, false);
    if (targetAudience !== undefined) f.targetAudience = targetAudience;
    const toneOfVoice = str("payload.projectFields.toneOfVoice", raw.toneOfVoice, 1, 500, false);
    if (toneOfVoice !== undefined) f.toneOfVoice = toneOfVoice;
    const uniqueSellingPoints = str("payload.projectFields.uniqueSellingPoints", raw.uniqueSellingPoints, 1, 1000, false);
    if (uniqueSellingPoints !== undefined) f.uniqueSellingPoints = uniqueSellingPoints;
    const brandNotes = str("payload.projectFields.brandNotes", raw.brandNotes, 1, 1000, false);
    if (brandNotes !== undefined) f.brandNotes = brandNotes;
    const mainLocation = str("payload.projectFields.mainLocation", raw.mainLocation, 1, 120, false);
    if (mainLocation !== undefined) f.mainLocation = mainLocation;
    if (raw.targetLocations !== undefined) {
      f.targetLocations = strArray("payload.projectFields.targetLocations", raw.targetLocations, 1, 120, MAX_PROJECT_SETUP_TARGET_LOCATIONS);
    }
    const primaryLanguage = str("payload.projectFields.primaryLanguage", raw.primaryLanguage, 1, 40, false);
    if (primaryLanguage !== undefined) {
      f.primaryLanguage = oneOf("payload.projectFields.primaryLanguage", primaryLanguage, LANGUAGES, "Polish, Swedish, English or Danish");
    }
    if (raw.additionalLanguages !== undefined) {
      const langs = strArray("payload.projectFields.additionalLanguages", raw.additionalLanguages, 1, 40, MAX_PROJECT_SETUP_ADDITIONAL_LANGUAGES).map(
        (l, i) => oneOf(`payload.projectFields.additionalLanguages[${i}]`, l, LANGUAGES, "Polish, Swedish, English or Danish"),
      );
      f.additionalLanguages = [...new Set(langs)];
    }
    if (raw.competitorUrls !== undefined) {
      const urls = strArray("payload.projectFields.competitorUrls", raw.competitorUrls, 1, 300, MAX_PROJECT_SETUP_COMPETITOR_URLS).map((u, i) =>
        httpsUrl(`payload.projectFields.competitorUrls[${i}]`, u),
      );
      f.competitorUrls = [...new Set(urls)];
    }
    validated.projectFields = f;
  }

  if (payload.services !== undefined) {
    const raw = payload.services;
    if (!Array.isArray(raw)) throw new PendingActionValidationError("payload.services", "must be an array");
    if (raw.length === 0) throw new PendingActionValidationError("payload.services", "must contain at least one item");
    if (raw.length > MAX_PROJECT_SETUP_SERVICES) {
      throw new PendingActionValidationError("payload.services", `must contain at most ${MAX_PROJECT_SETUP_SERVICES} items`);
    }
    validated.services = raw.map((item, i) => {
      const field = `payload.services[${i}]`;
      if (!isPlainObject(item)) throw new PendingActionValidationError(field, "must be an object");
      for (const k of Object.keys(item)) {
        if (!(PROJECT_SETUP_SERVICE_FIELDS as readonly string[]).includes(k)) {
          throw new PendingActionValidationError(`${field}.${k}`, "unknown field");
        }
      }
      const s: NonNullable<ProjectSetupProposalPayload["services"]>[number] = {
        name: str(`${field}.name`, item.name, 1, 120, true)!,
        kind: oneOf(`${field}.kind`, str(`${field}.kind`, item.kind, 1, 20, true)!, SERVICE_KINDS, "Service or Product"),
      };
      const description = str(`${field}.description`, item.description, 1, 400, false);
      if (description !== undefined) s.description = description;
      const targetAudience = str(`${field}.targetAudience`, item.targetAudience, 1, 200, false);
      if (targetAudience !== undefined) s.targetAudience = targetAudience;
      const locationRelevance = str(`${field}.locationRelevance`, item.locationRelevance, 1, 120, false);
      if (locationRelevance !== undefined) s.locationRelevance = locationRelevance;
      const priority = str(`${field}.priority`, item.priority, 1, 10, false);
      if (priority !== undefined) s.priority = oneOf(`${field}.priority`, priority, PRIORITIES, "High, Medium or Low");
      return s;
    });
  }

  if (payload.opportunities !== undefined) {
    const raw = payload.opportunities;
    if (!Array.isArray(raw)) throw new PendingActionValidationError("payload.opportunities", "must be an array");
    if (raw.length === 0) throw new PendingActionValidationError("payload.opportunities", "must contain at least one item");
    if (raw.length > MAX_PROJECT_SETUP_OPPORTUNITIES) {
      throw new PendingActionValidationError("payload.opportunities", `must contain at most ${MAX_PROJECT_SETUP_OPPORTUNITIES} items`);
    }
    validated.opportunities = raw.map((item, i) => {
      const field = `payload.opportunities[${i}]`;
      if (!isPlainObject(item)) throw new PendingActionValidationError(field, "must be an object");
      for (const k of Object.keys(item)) {
        if (!(PROJECT_SETUP_OPPORTUNITY_FIELDS as readonly string[]).includes(k)) {
          throw new PendingActionValidationError(`${field}.${k}`, "unknown field");
        }
      }
      const o: NonNullable<ProjectSetupProposalPayload["opportunities"]>[number] = {
        title: str(`${field}.title`, item.title, 1, 200, true)!,
      };
      const contentType = str(`${field}.contentType`, item.contentType, 1, 40, false);
      if (contentType !== undefined) o.contentType = oneOf(`${field}.contentType`, contentType, CONTENT_TYPES, "a valid Milo content type");
      const searchIntent = str(`${field}.searchIntent`, item.searchIntent, 1, 20, false);
      if (searchIntent !== undefined) {
        o.searchIntent = oneOf(`${field}.searchIntent`, searchIntent, SEARCH_INTENTS, "Informational, Commercial, Transactional or Navigational");
      }
      const targetAudience = str(`${field}.targetAudience`, item.targetAudience, 1, 200, false);
      if (targetAudience !== undefined) o.targetAudience = targetAudience;
      const businessValue = str(`${field}.businessValue`, item.businessValue, 1, 500, false);
      if (businessValue !== undefined) o.businessValue = businessValue;
      const recommendedCta = str(`${field}.recommendedCta`, item.recommendedCta, 1, 200, false);
      if (recommendedCta !== undefined) o.recommendedCta = recommendedCta;
      const priority = str(`${field}.priority`, item.priority, 1, 10, false);
      if (priority !== undefined) o.priority = oneOf(`${field}.priority`, priority, PRIORITIES, "High, Medium or Low");
      return o;
    });
  }

  if (!validated.projectFields && !validated.services && !validated.opportunities) {
    throw new PendingActionValidationError("payload", "must contain at least one of projectFields, services or opportunities");
  }

  return validated;
}

/** Caller-suppliable creation input. riskLevel/status/source are NOT here — derived. */
export interface CreatePendingActionInput {
  type: PendingActionType;
  projectId: string;
  title: string;
  summary: string;
  payload: unknown;
  preview: string;
  requestId?: string;
  proposedByClientId?: string;
}

const CREATE_INPUT_FIELDS = ["type", "projectId", "title", "summary", "payload", "preview", "requestId", "proposedByClientId"];

// ---- lifecycle ----

/** Allowed transitions (blueprint §6): approve→apply happens in one mutation,
 * modeled as two hops; approved→rejected is the apply-validation-failure path. */
const TRANSITIONS: Record<PendingActionStatus, readonly PendingActionStatus[]> = {
  pending: ["approved", "rejected", "expired"],
  approved: ["applied", "rejected"],
  rejected: [],
  applied: [],
  expired: [],
};

export function canTransitionPendingAction(from: PendingActionStatus, to: PendingActionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

function transition(action: PendingAction, to: PendingActionStatus, nowIso: string, resolution?: Partial<PendingAction["resolution"]>): PendingAction {
  if (!canTransitionPendingAction(action.status, to)) throw new PendingActionTransitionError(action.status, to);
  return {
    ...action,
    status: to,
    updatedAt: nowIso,
    ...(resolution ? { resolution: { resolvedAt: nowIso, resolvedBy: "owner" as const, ...action.resolution, ...resolution } } : {}),
  };
}

export function findPendingActionByRequestId(actions: readonly PendingAction[], requestId: string): PendingAction | undefined {
  return actions.find((a) => a.requestId === requestId);
}

/**
 * Create a pending action (pure). Ids and timestamps are supplied by the
 * caller (minted BEFORE any retried mutation, per the 1A rule). requestId
 * dedupe returns the existing action untouched with deduped:true.
 */
export function createPendingAction(
  existing: readonly PendingAction[],
  input: CreatePendingActionInput,
  deps: { id: string; nowIso: string },
): { actions: PendingAction[]; action: PendingAction; deduped: boolean } {
  for (const k of Object.keys(input as unknown as Record<string, unknown>)) {
    if (!CREATE_INPUT_FIELDS.includes(k)) throw new PendingActionValidationError(k, "unknown field");
  }
  if (!(PENDING_ACTION_TYPES as readonly string[]).includes(input.type)) {
    throw new PendingActionValidationError("type", "unknown pending action type");
  }

  const requestId = str("requestId", input.requestId, 1, 100, false);
  if (requestId) {
    const found = findPendingActionByRequestId(existing, requestId);
    if (found) return { actions: [...existing], action: found, deduped: true };
  }

  if (existing.length >= PENDING_ACTIONS_CAP) throw new PendingActionCapError();

  const projectId = str("projectId", input.projectId, 1, 100, true)!;
  const title = str("title", input.title, 1, 200, true)!;
  const summary = str("summary", input.summary, 1, 500, true)!;
  const preview = str("preview", input.preview, 1, MAX_PENDING_ACTION_PREVIEW_BYTES, true)!;
  if (utf8Bytes(preview) > MAX_PENDING_ACTION_PREVIEW_BYTES) {
    throw new PendingActionValidationError("preview", `must be at most ${MAX_PENDING_ACTION_PREVIEW_BYTES} bytes`);
  }
  const proposedByClientId = str("proposedByClientId", input.proposedByClientId, 1, 200, false);
  const payload = validatePendingActionPayload(input.type, input.payload);

  const action: PendingAction = {
    id: deps.id,
    type: input.type,
    projectId,
    title,
    summary,
    status: "pending",
    source: "claude",
    createdAt: deps.nowIso,
    updatedAt: deps.nowIso,
    expiresAt: new Date(Date.parse(deps.nowIso) + PENDING_ACTION_TTL_MS).toISOString(),
    ...(requestId ? { requestId } : {}),
    ...(proposedByClientId ? { proposedByClientId } : {}),
    requiredScope: MILO_ACTIONS_PROPOSE_SCOPE,
    payload,
    preview,
    riskLevel: derivePendingActionRisk(input.type),
  };
  return { actions: [...existing, action], action, deduped: false };
}

/** pending → approved (owner, Milo UI only). Callers must expire stale items first. */
export function approvePendingAction(action: PendingAction, nowIso: string): PendingAction {
  return transition(action, "approved", nowIso, {});
}

/** pending/approved → rejected. `error` is the machine reason for apply-time failures. */
export function rejectPendingAction(action: PendingAction, nowIso: string, opts?: { note?: string; error?: string }): PendingAction {
  const note = str("note", opts?.note, 1, 500, false);
  return transition(action, "rejected", nowIso, {
    ...(note ? { note } : {}),
    ...(opts?.error ? { error: opts.error } : {}),
  });
}

/** approved → applied, recording what landed (and, when known, at which rev —
 * the resolve path can't know the post-mutation rev inside the pure mutation,
 * so the authoritative rev lives in the audit event instead). */
export function markPendingActionApplied(action: PendingAction, nowIso: string, applied: { appliedEntityIds: string[]; appliedAtRev?: number }): PendingAction {
  return transition(action, "applied", nowIso, applied);
}

/** True when a still-pending action is past its expiry horizon. */
export function isPendingActionExpired(action: PendingAction, nowMs: number): boolean {
  return action.status === "pending" && !!action.expiresAt && Date.parse(action.expiresAt) < nowMs;
}

/**
 * Lazy expiry sweep (no cron): flip stale pending items to expired. Returns
 * the same array identity when nothing changed so callers can skip a save.
 */
export function expireStalePendingActions(actions: readonly PendingAction[], nowIso: string): { actions: readonly PendingAction[]; expiredIds: string[] } {
  const nowMs = Date.parse(nowIso);
  const expiredIds: string[] = [];
  const next = actions.map((a) => {
    if (!isPendingActionExpired(a, nowMs)) return a;
    expiredIds.push(a.id);
    return transition(a, "expired", nowIso);
  });
  return expiredIds.length ? { actions: next, expiredIds } : { actions, expiredIds };
}
