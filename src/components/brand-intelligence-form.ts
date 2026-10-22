import {
  applyOwnerBrandEdits,
  normalizeOwnerField,
  ownerBrandFieldValue,
  parseOwnerListText,
  withOwnerFieldValue,
  sameOwnerValue,
  OwnerBrandEditError,
  type OwnerAttempt,
  type OwnerBrandField,
} from "@/lib/brand-owner-edits";
import type {
  BrandIntelligence,
  BrandInternalLink,
  BrandMarketLanguageRule,
  BrandOffer,
  Project,
} from "@/lib/types";

export type BrandForm = {
  tone: string;
  styleNotes: string;
  wordsToUse: string;
  wordsToAvoid: string;
  allowedClaims: string;
  forbiddenClaims: string;
  requiredCaveats: string;
  primaryOffers: BrandOffer[];
  secondaryOffers: BrandOffer[];
  proofPoints: string;
  credentials: string;
  testimonialsNotes: string;
  trustSignals: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  ctaStyleNotes: string;
  internalLinks: BrandInternalLink[];
  marketLanguageRules: BrandMarketLanguageRule[];
  avoid: string;
};

// Stored lists are shown one per line; see parseOwnerListText for parsing.
const fromArr = (a: unknown): string => (Array.isArray(a) ? a.join("\n") : "");
const text = (v: unknown) => (typeof v === "string" ? v : "");

export function toBrandForm(b: BrandIntelligence | undefined): BrandForm {
  return {
    tone: text(b?.voice?.tone),
    styleNotes: text(b?.voice?.styleNotes),
    wordsToUse: fromArr(b?.voice?.wordsToUse),
    wordsToAvoid: fromArr(b?.voice?.wordsToAvoid),
    allowedClaims: fromArr(b?.claims?.allowedClaims),
    forbiddenClaims: fromArr(b?.claims?.forbiddenClaims),
    requiredCaveats: fromArr(b?.claims?.requiredCaveats),
    primaryOffers: b?.offers?.primaryOffers ?? [],
    secondaryOffers: b?.offers?.secondaryOffers ?? [],
    proofPoints: fromArr(b?.proof?.proofPoints),
    credentials: fromArr(b?.proof?.credentials),
    testimonialsNotes: text(b?.proof?.testimonialsNotes),
    trustSignals: fromArr(b?.proof?.trustSignals),
    primaryCtaLabel: text(b?.ctas?.primaryCtaLabel),
    primaryCtaUrl: text(b?.ctas?.primaryCtaUrl),
    secondaryCtaLabel: text(b?.ctas?.secondaryCtaLabel),
    secondaryCtaUrl: text(b?.ctas?.secondaryCtaUrl),
    ctaStyleNotes: text(b?.ctas?.ctaStyleNotes),
    internalLinks: b?.internalLinks ?? [],
    marketLanguageRules: b?.marketLanguageRules ?? [],
    avoid: fromArr(b?.avoid),
  };
}

/**
 * The form's requested profile. List text is parsed exactly once here, against the
 * stored entries of the given references (see `parseOwnerListText`); offer/link/rule
 * rows keep their stored metadata. Only the owner-edit merge decides what is saved.
 */
export function buildBrandFromForm(
  f: BrandForm,
  ...references: (BrandIntelligence | undefined)[]
): BrandIntelligence {
  const n = <T>(field: OwnerBrandField, v: unknown) => normalizeOwnerField(field, v) as T;
  // Entries already stored in any reference (baseline, current) are never re-split.
  const list = (field: OwnerBrandField, value: string) =>
    parseOwnerListText(
      value,
      references.flatMap((ref) => {
        const stored = ownerBrandFieldValue(ref, field);
        return Array.isArray(stored) ? stored : [];
      }),
    );
  return {
    voice: {
      tone: n("voice.tone", f.tone),
      styleNotes: n("voice.styleNotes", f.styleNotes),
      wordsToUse: list("voice.wordsToUse", f.wordsToUse),
      wordsToAvoid: list("voice.wordsToAvoid", f.wordsToAvoid),
    },
    claims: {
      allowedClaims: list("claims.allowedClaims", f.allowedClaims),
      forbiddenClaims: list("claims.forbiddenClaims", f.forbiddenClaims),
      requiredCaveats: list("claims.requiredCaveats", f.requiredCaveats),
    },
    offers: {
      primaryOffers: n("offers.primaryOffers", f.primaryOffers),
      secondaryOffers: n("offers.secondaryOffers", f.secondaryOffers),
    },
    proof: {
      proofPoints: list("proof.proofPoints", f.proofPoints),
      credentials: list("proof.credentials", f.credentials),
      testimonialsNotes: n("proof.testimonialsNotes", f.testimonialsNotes),
      trustSignals: list("proof.trustSignals", f.trustSignals),
    },
    ctas: {
      primaryCtaLabel: n("ctas.primaryCtaLabel", f.primaryCtaLabel),
      primaryCtaUrl: n("ctas.primaryCtaUrl", f.primaryCtaUrl),
      secondaryCtaLabel: n("ctas.secondaryCtaLabel", f.secondaryCtaLabel),
      secondaryCtaUrl: n("ctas.secondaryCtaUrl", f.secondaryCtaUrl),
      ctaStyleNotes: n("ctas.ctaStyleNotes", f.ctaStyleNotes),
    },
    internalLinks: n("internalLinks", f.internalLinks),
    marketLanguageRules: n("marketLanguageRules", f.marketLanguageRules),
    avoid: list("avoid", f.avoid),
  };
}

/** i18n label key for each canonical field, used in validation messages. */
export const OWNER_FIELD_LABEL_KEYS: Record<OwnerBrandField, string> = {
  "voice.tone": "brand.voice.tone",
  "voice.styleNotes": "brand.voice.styleNotes",
  "voice.wordsToUse": "brand.voice.wordsToUse",
  "voice.wordsToAvoid": "brand.voice.wordsToAvoid",
  "claims.allowedClaims": "brand.claims.allowed",
  "claims.forbiddenClaims": "brand.claims.forbidden",
  "claims.requiredCaveats": "brand.claims.caveats",
  "offers.primaryOffers": "brand.offers.primary",
  "offers.secondaryOffers": "brand.offers.secondary",
  "proof.proofPoints": "brand.proof.points",
  "proof.credentials": "brand.proof.credentials",
  "proof.testimonialsNotes": "brand.proof.testimonials",
  "proof.trustSignals": "brand.proof.trustSignals",
  "ctas.primaryCtaLabel": "brand.cta.primaryLabel",
  "ctas.primaryCtaUrl": "brand.cta.primaryUrl",
  "ctas.secondaryCtaLabel": "brand.cta.secondaryLabel",
  "ctas.secondaryCtaUrl": "brand.cta.secondaryUrl",
  "ctas.ctaStyleNotes": "brand.cta.styleNotes",
  internalLinks: "brand.section.links",
  marketLanguageRules: "brand.section.rules",
  avoid: "brand.section.avoid",
};

export type BrandSaveDeps = {
  getProject: (id: string) => Project | undefined;
  /** Workspace hydrated with a signed-in user; otherwise a save would not be written. */
  isReady: () => boolean;
  /** Identifies the signed-in workspace session (epoch + user); a change means the
   * save cannot be confirmed and nothing may be written into the new session. */
  sessionKey: () => string | null;
  /** The workspace holds changes not yet confirmed by the backend. */
  hasUnsavedChanges: () => boolean;
  updateProject: (id: string, patch: Partial<Project>) => void;
  saveWorkspaceNow: () => Promise<void>;
  now: () => string;
};

export type BrandSaveResult =
  | { status: "saved"; brand: BrandIntelligence | undefined; changed: OwnerBrandField[] }
  | { status: "noop" }
  | { status: "invalid"; error: OwnerBrandEditError }
  | { status: "conflict"; field: string }
  | { status: "unavailable" }
  | { status: "failed"; message?: string };

/**
 * Unconfirmed owner attempts, per project, for the session that made them. A failed
 * save leaves its value in the workspace as an unconfirmed change (a lost response
 * may already have committed it, so it is neither rolled back nor compensated
 * implicitly). The editor remembers it as its own so the next explicit save can
 * retry, correct or revert it, and so a remounted editor does not adopt it as a
 * confirmed baseline. `confirmed` is the stored value it replaced; it is also the
 * authority for restoring rows/entries that attempt removed (see `applyOwnerBrandEdits`).
 */
type PendingField = OwnerAttempt;
const pendingAttempts = new Map<
  string,
  { session: string; fields: Partial<Record<OwnerBrandField, PendingField>> }
>();
/** Pending fields of this session whose current value is still exactly the attempt. */
function ownPending(projectId: string, session: string | null, current?: BrandIntelligence) {
  const entry = pendingAttempts.get(projectId);
  if (!entry || entry.session !== session) {
    pendingAttempts.delete(projectId);
    return {};
  }
  return Object.fromEntries(
    Object.entries(entry.fields).filter(([field, pending]) =>
      sameOwnerValue(
        field as OwnerBrandField,
        ownerBrandFieldValue(current, field),
        pending!.attempted,
      ),
    ),
  ) as Partial<Record<OwnerBrandField, PendingField>>;
}
/**
 * The confirmed baseline for an editor opened on `current`: fields still holding this
 * session's unconfirmed attempt are shown in the form (from `current`) but compared
 * against the value they replaced, so the attempt stays a visible, retryable edit.
 */
export function ownerBrandBaseline(
  projectId: string,
  current: BrandIntelligence | undefined,
  session: string | null,
): BrandIntelligence | undefined {
  let baseline = current;
  for (const [field, pending] of Object.entries(ownPending(projectId, session, current)))
    baseline = withOwnerFieldValue(baseline, field as OwnerBrandField, pending!.confirmed);
  return baseline;
}
/** Test seam: forget remembered attempts. */
export function resetOwnerBrandAttempts() {
  pendingAttempts.clear();
}

/**
 * Validate, merge, persist and confirm one owner edit as a unit. Nothing is written
 * for validation errors, conflicts or an unusable workspace. "saved" is returned
 * only after the workspace save resolved in the same ready session and the stored
 * profile holds exactly the requested value for every changed field.
 *
 * After a failure the attempted fields stay in the workspace and are remembered as
 * this editor's own (see `pendingAttempts`): an unchanged retry rewrites and flushes
 * them, a correction saves without a self-conflict, an explicit revert writes the
 * confirmed value back, and a different value written by someone else is still a
 * conflict. A form with no changes while the workspace holds unconfirmed changes
 * flushes them instead of claiming there is nothing to save.
 */
export async function saveOwnerBrandForm(
  projectId: string,
  form: BrandForm,
  baseline: BrandIntelligence | undefined,
  deps: BrandSaveDeps,
): Promise<BrandSaveResult> {
  if (!deps.isReady()) return { status: "unavailable" };
  const session = deps.sessionKey();
  const project = deps.getProject(projectId);
  if (!project) return { status: "unavailable" };
  const own = ownPending(projectId, session, project.brandIntelligence);
  let result: ReturnType<typeof applyOwnerBrandEdits>;
  try {
    result = applyOwnerBrandEdits(
      baseline,
      buildBrandFromForm(form, baseline, project.brandIntelligence),
      project.brandIntelligence,
      deps.now(),
      own,
    );
  } catch (e) {
    if (!(e instanceof OwnerBrandEditError)) throw e;
    return e.code === "conflict"
      ? { status: "conflict", field: e.field }
      : { status: "invalid", error: e };
  }
  const { brand: attempted, changed } = result;
  if (!changed.length && !deps.hasUnsavedChanges()) return { status: "noop" };
  const remember = () => {
    if (!deps.isReady() || deps.sessionKey() !== session) return;
    const latest = deps.getProject(projectId)?.brandIntelligence;
    const fields: Partial<Record<OwnerBrandField, PendingField>> = { ...own };
    for (const field of changed)
      fields[field] = {
        attempted: ownerBrandFieldValue(attempted, field),
        // What was actually stored before this attempt (not the caller's baseline).
        confirmed: own[field]?.confirmed ?? ownerBrandFieldValue(project.brandIntelligence, field),
      };
    // Keep only fields that still hold this attempt; another writer's value is not ours.
    for (const field of Object.keys(fields) as OwnerBrandField[])
      if (!sameOwnerValue(field, ownerBrandFieldValue(latest, field), fields[field]!.attempted))
        delete fields[field];
    if (Object.keys(fields).length && session) pendingAttempts.set(projectId, { session, fields });
    else pendingAttempts.delete(projectId);
  };
  if (changed.length) deps.updateProject(projectId, { brandIntelligence: attempted });
  try {
    await deps.saveWorkspaceNow();
  } catch (e) {
    remember();
    return { status: "failed", message: e instanceof Error ? e.message : undefined };
  }
  if (!deps.isReady() || deps.sessionKey() !== session) return { status: "failed" };
  const saved = deps.getProject(projectId)?.brandIntelligence;
  const confirmed = changed.every((field) =>
    sameOwnerValue(
      field,
      ownerBrandFieldValue(saved, field),
      ownerBrandFieldValue(attempted, field),
    ),
  );
  if (!confirmed) {
    remember();
    return { status: "failed" };
  }
  pendingAttempts.delete(projectId);
  return { status: "saved", brand: saved, changed };
}
