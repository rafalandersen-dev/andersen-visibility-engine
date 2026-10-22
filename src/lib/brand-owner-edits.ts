import type {
  BrandIntelligence,
  BrandInternalLink,
  BrandMarketLanguageRule,
  BrandOffer,
} from "./types";

/**
 * Owner-edit contract for the Brand Intelligence editor (7 October 2026).
 *
 * This is deliberately separate from `brand-proposal.ts`, which bounds untrusted
 * AI/MCP/source proposals (strict keys, HTTPS-only URLs, 10 offers, 20 list items).
 * A persisted profile may legitimately exceed those proposal limits (Synergy has 15
 * primary offers, Butelki 19) or hold a legacy root-relative CTA such as `/contact`;
 * neither may hide or block an owner's edit to an unrelated field.
 *
 * Rules:
 * - Change detection uses a fixed allowlist of canonical leaf fields, never the
 *   proposal parser, so it works whatever the rest of the profile looks like.
 * - Only fields the owner actually changed are validated. Untouched fields, groups,
 *   list members, relative URLs and unknown legacy keys are carried over as stored,
 *   not re-validated or rewritten. An edited offer/link/rule row keeps its stored
 *   metadata keys (see `reuseStoredRows`); new metadata is never accepted.
 * - Every requested change is validated before anything is merged: all fields save
 *   together or the whole edit is refused with an `OwnerBrandEditError`.
 */
export const OWNER_BRAND_FIELDS = [
  "voice.tone",
  "voice.styleNotes",
  "voice.wordsToUse",
  "voice.wordsToAvoid",
  "claims.allowedClaims",
  "claims.forbiddenClaims",
  "claims.requiredCaveats",
  "offers.primaryOffers",
  "offers.secondaryOffers",
  "proof.proofPoints",
  "proof.credentials",
  "proof.testimonialsNotes",
  "proof.trustSignals",
  "ctas.primaryCtaLabel",
  "ctas.primaryCtaUrl",
  "ctas.secondaryCtaLabel",
  "ctas.secondaryCtaUrl",
  "ctas.ctaStyleNotes",
  "internalLinks",
  "marketLanguageRules",
  "avoid",
] as const;
export type OwnerBrandField = (typeof OWNER_BRAND_FIELDS)[number];

/**
 * Finite owner bounds. Chosen above the largest persisted editor data observed on
 * 7 October 2026 (19 offers, ~76 claim entries after list parsing, ~1,250-character
 * style notes) with headroom, and well above the proposal limits on purpose. A list
 * already longer than its bound can still be edited or shortened; only additions
 * beyond the bound are refused.
 */
export const OWNER_BRAND_LIMITS = {
  listItems: 200,
  listItemLength: 1000,
  offers: 50,
  internalLinks: 50,
  marketLanguageRules: 50,
  label: 200,
  tone: 2000,
  longText: 4000,
  offerAudience: 2000,
  ruleText: 100,
  url: 500,
} as const;

export type OwnerBrandEditErrorCode =
  | "conflict"
  | "required"
  | "tooLong"
  | "invalidUrl"
  | "invalidChoice"
  | "limit"
  | "unknownField"
  | "ambiguous"
  | "malformed";

export class OwnerBrandEditError extends Error {
  constructor(
    readonly code: OwnerBrandEditErrorCode,
    readonly field: string,
    readonly index?: number,
  ) {
    // "brand_profile_changed" is the established conflict signal used by the editor.
    super(code === "conflict" ? "brand_profile_changed" : `brand_owner_${code}`);
    this.name = "OwnerBrandEditError";
  }
}

type Kind = "text" | "url" | "list" | "offers" | "links" | "rules";
const KIND: Record<OwnerBrandField, Kind> = {
  "voice.tone": "text",
  "voice.styleNotes": "text",
  "voice.wordsToUse": "list",
  "voice.wordsToAvoid": "list",
  "claims.allowedClaims": "list",
  "claims.forbiddenClaims": "list",
  "claims.requiredCaveats": "list",
  "offers.primaryOffers": "offers",
  "offers.secondaryOffers": "offers",
  "proof.proofPoints": "list",
  "proof.credentials": "list",
  "proof.testimonialsNotes": "text",
  "proof.trustSignals": "list",
  "ctas.primaryCtaLabel": "text",
  "ctas.primaryCtaUrl": "url",
  "ctas.secondaryCtaLabel": "text",
  "ctas.secondaryCtaUrl": "url",
  "ctas.ctaStyleNotes": "text",
  internalLinks: "links",
  marketLanguageRules: "rules",
  avoid: "list",
};
const TEXT_MAX: Partial<Record<OwnerBrandField, number>> = {
  "voice.tone": OWNER_BRAND_LIMITS.tone,
  "ctas.primaryCtaLabel": OWNER_BRAND_LIMITS.label,
  "ctas.secondaryCtaLabel": OWNER_BRAND_LIMITS.label,
};
const GROUPS = new Set(OWNER_BRAND_FIELDS.map((field) => field.split(".")[0]));
const OFFER_TYPES: BrandOffer["type"][] = ["service", "product", "package", "membership", "other"];
const LINK_TYPES: BrandInternalLink["type"][] = [
  "service",
  "product",
  "article",
  "booking",
  "contact",
  "other",
];
const PRIORITIES: BrandOffer["priority"][] = ["high", "medium", "low"];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const blank = (v: unknown) =>
  v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const opt = (v: unknown) => str(v) || undefined;
/** Key-order independent JSON; undefined members are dropped as JSON does. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_key, value) =>
    isPlainObject(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}
const same = (a: unknown, b: unknown) => (blank(a) && blank(b)) || stable(a) === stable(b);

export function ownerBrandFieldValue(
  brand: BrandIntelligence | null | undefined,
  field: string,
): unknown {
  const [group, leaf] = field.split(".");
  const value = (brand as Record<string, unknown> | null | undefined)?.[group];
  if (!leaf) return value;
  return isPlainObject(value) ? value[leaf] : undefined;
}
/** A copy of `brand` with one canonical field set; `undefined` removes the leaf. */
export function withOwnerFieldValue(
  brand: BrandIntelligence | undefined,
  field: OwnerBrandField,
  value: unknown,
): BrandIntelligence {
  const next: Record<string, unknown> = { ...brand };
  const [group, leaf] = field.split(".");
  if (!leaf) {
    if (value === undefined) delete next[group];
    else next[group] = structuredClone(value);
    return next as BrandIntelligence;
  }
  const container: Record<string, unknown> = isPlainObject(next[group]) ? { ...next[group] } : {};
  if (value === undefined) delete container[leaf];
  else container[leaf] = structuredClone(value);
  next[group] = container;
  return next as BrandIntelligence;
}

// ---- Normalization: stored and edited values compared the way the editor shows them ----
/**
 * Stored and edited lists are arrays of entries. They are trimmed and emptied of
 * blanks but never re-split, so an entry such as "Professional from £1,490" keeps its
 * identity however often it is normalized. Text is parsed once, by
 * `parseOwnerListText`, in the form.
 */
const normalizeList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((item) => str(item)).filter(Boolean);
/**
 * Parse list text typed in the editor (the documented "one per line or
 * comma-separated" rule), exactly once:
 * - text with several lines gives one entry per line; commas inside a line are kept;
 * - a single line that equals an existing stored entry stays that one entry, so an
 *   untouched or remaining "£1,490" entry is never split;
 * - any other single line is split on commas ("a, b" gives two entries).
 */
export function parseOwnerListText(text: string, stored?: unknown): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length !== 1 || normalizeList(stored).includes(lines[0])) return lines;
  return lines[0]
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Offer, link and rule rows: supported keys are normalized; any other key on a
 * stored row (legacy ids, import metadata) is kept verbatim as row metadata. It is
 * compared like any other value, so concurrent metadata changes are visible.
 */
const ROW_KEYS = {
  offers: ["name", "type", "priority", "description", "url", "targetAudience", "notes"],
  links: ["label", "url", "type", "priority", "notes"],
  rules: ["market", "language", "notes"],
} as const;
type RowKind = keyof typeof ROW_KEYS;
const rowExtras = (kind: RowKind, row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => !(ROW_KEYS[kind] as readonly string[]).includes(key)),
  );
const withoutUndefined = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
export function normalizeOwnerOffer(o: Partial<BrandOffer>): BrandOffer {
  return {
    name: str(o.name),
    type: o.type as BrandOffer["type"],
    priority: o.priority as BrandOffer["priority"],
    description: opt(o.description),
    url: opt(o.url),
    targetAudience: opt(o.targetAudience),
    notes: opt(o.notes),
  };
}
export function normalizeOwnerLink(l: Partial<BrandInternalLink>): BrandInternalLink {
  return {
    label: str(l.label),
    url: str(l.url),
    type: l.type as BrandInternalLink["type"],
    priority: l.priority as BrandInternalLink["priority"],
    notes: opt(l.notes),
  };
}
export function normalizeOwnerRule(r: Partial<BrandMarketLanguageRule>): BrandMarketLanguageRule {
  return { market: opt(r.market), language: opt(r.language), notes: opt(r.notes) };
}
const KNOWN_ROW: Record<RowKind, (row: Record<string, unknown>) => Record<string, unknown>> = {
  offers: (o) => normalizeOwnerOffer(o) as unknown as Record<string, unknown>,
  links: (l) => normalizeOwnerLink(l) as unknown as Record<string, unknown>,
  rules: (r) => normalizeOwnerRule(r) as unknown as Record<string, unknown>,
};
const KNOWN_TEXT: Record<RowKind, string[]> = {
  offers: ["name", "description", "url", "targetAudience", "notes"],
  links: ["label", "url", "notes"],
  rules: ["market", "language", "notes"],
};
// A row is dropped only when every supported text field is empty and it carries no
// metadata (an untouched "Add" row). Partly filled rows are kept so a missing
// name/URL is reported, not silently lost.
const rowsOf = (kind: RowKind) => (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .filter(isPlainObject)
    .map((row) => ({ ...rowExtras(kind, row), ...KNOWN_ROW[kind](row) }))
    .filter(
      (row) => KNOWN_TEXT[kind].some((key) => row[key]) || Object.keys(rowExtras(kind, row)).length,
    );
const offerRows = rowsOf("offers");
const linkRows = rowsOf("links");
const ruleRows = rowsOf("rules");

export function normalizeOwnerField(field: OwnerBrandField, value: unknown): unknown {
  switch (KIND[field]) {
    case "text":
    case "url":
      return opt(value);
    case "list":
      return normalizeList(value);
    case "offers":
      return offerRows(value);
    case "links":
      return linkRows(value);
    case "rules":
      return ruleRows(value);
  }
}
/** True when two stored/edited values are the same after editor serialization. */
export const sameOwnerValue = (field: OwnerBrandField, a: unknown, b: unknown) =>
  same(normalizeOwnerField(field, a), normalizeOwnerField(field, b));

// ---- URL policy for newly entered owner URLs ----
/**
 * Accepts an absolute HTTPS URL without credentials, or a same-site root-relative
 * path ("/contact"). Rejects protocol-relative "//host", other schemes
 * (javascript:, data:, http:), credentials, whitespace/control characters and
 * backslashes. URLs are stored as entered; nothing is fetched or rewritten.
 */
export function isSafeOwnerUrl(value: string): boolean {
  if (!value || value.length > OWNER_BRAND_LIMITS.url) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith("/")) {
    if (value.startsWith("//")) return false;
    try {
      const base = "https://owner-path.invalid";
      return new URL(value, base).origin === base;
    } catch {
      return false;
    }
  }
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

// ---- Validation of intentional changes only ----
function checkText(field: string, value: string | undefined, max: number, index?: number) {
  if (value && value.length > max) throw new OwnerBrandEditError("tooLong", field, index);
}
function checkUrl(field: string, value: string | undefined, index?: number) {
  if (value && !isSafeOwnerUrl(value)) throw new OwnerBrandEditError("invalidUrl", field, index);
}
function checkCount(field: string, next: number, before: number, max: number) {
  if (next > max && next > before) throw new OwnerBrandEditError("limit", field);
}
const takeFrom = <T>(pools: Map<string, T[]>, key: string) => pools.get(key)?.shift();
const addTo = <T>(pools: Map<string, T[]>, key: string, value: T) =>
  pools.set(key, [...(pools.get(key) ?? []), value]);
/** List entries equal to a stored entry keep the stored string; only new entries are validated. */
function reuseStoredEntries(
  stored: unknown,
  edited: string[],
  validate: (entry: string, index: number) => void,
): unknown[] {
  const pool = new Map<string, unknown[]>();
  for (const entry of Array.isArray(stored) ? stored : [])
    if (str(entry)) addTo(pool, str(entry), entry);
  return edited.map((entry, index) => {
    const reused = takeFrom(pool, entry);
    if (reused !== undefined) return reused;
    validate(entry, index);
    return entry;
  });
}
/**
 * Associate edited rows with stored rows without guessing a domain id:
 * 1. a row equal to a stored row (supported keys and metadata) is that stored object;
 * 2. an edited row carrying metadata belongs to an unclaimed stored row with exactly
 *    that metadata. Its supported keys are validated and applied on top of the stored
 *    row, so untouched metadata survives. Metadata matching no stored row is an
 *    injected unknown field; metadata claimed by more rows than exist is ambiguous;
 *    both are refused rather than guessed;
 * 3. a row without metadata is new (or had none to keep) and is validated as such.
 * Order, count and duplicates follow the edited list exactly; unclaimed stored rows
 * were removed by the owner.
 */
function reuseStoredRows(
  field: OwnerBrandField,
  kind: RowKind,
  stored: unknown,
  edited: Record<string, unknown>[],
  validate: (row: Record<string, unknown>, index: number) => void,
): unknown[] {
  const rows = rowsOf(kind);
  const storedRows = (Array.isArray(stored) ? stored : []).filter(isPlainObject);
  const exact = new Map<string, number[]>();
  const metadata = new Map<string, number[]>();
  const knownMetadata = new Set<string>();
  storedRows.forEach((row, i) => {
    const [normalized] = rows([row]);
    if (normalized) addTo(exact, stable(normalized), i);
    const extras = rowExtras(kind, row);
    if (Object.keys(extras).length) knownMetadata.add(stable(extras));
  });
  const claimed = new Set<number>();
  const out: unknown[] = edited.map((row) => {
    const i = takeFrom(exact, stable(row));
    if (i === undefined) return undefined;
    claimed.add(i);
    return storedRows[i];
  });
  storedRows.forEach((row, i) => {
    const extras = rowExtras(kind, row);
    if (!claimed.has(i) && Object.keys(extras).length) addTo(metadata, stable(extras), i);
  });
  edited.forEach((row, index) => {
    if (out[index] !== undefined) return;
    const known = KNOWN_ROW[kind](row);
    validate(known, index);
    const extras = rowExtras(kind, row);
    if (!Object.keys(extras).length) {
      out[index] = withoutUndefined(known);
      return;
    }
    const key = stable(extras);
    const i = takeFrom(metadata, key);
    if (i === undefined)
      throw new OwnerBrandEditError(
        knownMetadata.has(key) ? "ambiguous" : "unknownField",
        field,
        index,
      );
    out[index] = withoutUndefined({ ...storedRows[i], ...known });
  });
  return out;
}
function ownerValue(field: OwnerBrandField, requested: unknown, stored: unknown): unknown {
  const storedCount = Array.isArray(stored) ? stored.length : 0;
  switch (KIND[field]) {
    case "text": {
      const value = opt(requested);
      checkText(field, value, TEXT_MAX[field] ?? OWNER_BRAND_LIMITS.longText);
      return value;
    }
    case "url": {
      const value = opt(requested);
      checkText(field, value, OWNER_BRAND_LIMITS.url);
      checkUrl(field, value);
      return value;
    }
    case "list": {
      const edited = normalizeList(requested);
      checkCount(field, edited.length, storedCount, OWNER_BRAND_LIMITS.listItems);
      return reuseStoredEntries(stored, edited, (item, index) =>
        checkText(field, item, OWNER_BRAND_LIMITS.listItemLength, index),
      );
    }
    case "offers": {
      const edited = offerRows(requested);
      checkCount(field, edited.length, storedCount, OWNER_BRAND_LIMITS.offers);
      return reuseStoredRows(field, "offers", stored, edited, (row, index) => {
        const o = row as unknown as BrandOffer;
        if (!o.name) throw new OwnerBrandEditError("required", field, index);
        if (!OFFER_TYPES.includes(o.type) || !PRIORITIES.includes(o.priority))
          throw new OwnerBrandEditError("invalidChoice", field, index);
        checkText(field, o.name, OWNER_BRAND_LIMITS.label, index);
        checkText(field, o.description, OWNER_BRAND_LIMITS.longText, index);
        checkText(field, o.targetAudience, OWNER_BRAND_LIMITS.offerAudience, index);
        checkText(field, o.notes, OWNER_BRAND_LIMITS.longText, index);
        checkUrl(field, o.url, index);
      });
    }
    case "links": {
      const edited = linkRows(requested);
      checkCount(field, edited.length, storedCount, OWNER_BRAND_LIMITS.internalLinks);
      return reuseStoredRows(field, "links", stored, edited, (row, index) => {
        const l = row as unknown as BrandInternalLink;
        if (!l.label || !l.url) throw new OwnerBrandEditError("required", field, index);
        if (!LINK_TYPES.includes(l.type) || !PRIORITIES.includes(l.priority))
          throw new OwnerBrandEditError("invalidChoice", field, index);
        checkText(field, l.label, OWNER_BRAND_LIMITS.label, index);
        checkText(field, l.notes, OWNER_BRAND_LIMITS.longText, index);
        checkUrl(field, l.url, index);
      });
    }
    case "rules": {
      const edited = ruleRows(requested);
      checkCount(field, edited.length, storedCount, OWNER_BRAND_LIMITS.marketLanguageRules);
      return reuseStoredRows(field, "rules", stored, edited, (row, index) => {
        const r = row as BrandMarketLanguageRule;
        checkText(field, r.market, OWNER_BRAND_LIMITS.ruleText, index);
        checkText(field, r.language, OWNER_BRAND_LIMITS.ruleText, index);
        checkText(field, r.notes, OWNER_BRAND_LIMITS.longText, index);
      });
    }
  }
}

/** Edits to paths outside the canonical allowlist are refused, never stored. */
function assertKnownPaths(reference: BrandIntelligence | undefined, edited: BrandIntelligence) {
  const ref = (reference ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(edited)) {
    if (key === "updatedAt") continue;
    if (!GROUPS.has(key)) {
      if (!same(value, ref[key])) throw new OwnerBrandEditError("unknownField", key);
      continue;
    }
    if (!isPlainObject(value)) continue;
    for (const [leaf, leafValue] of Object.entries(value)) {
      const field = `${key}.${leaf}`;
      if ((OWNER_BRAND_FIELDS as readonly string[]).includes(field)) continue;
      if (!same(leafValue, ownerBrandFieldValue(reference, field)))
        throw new OwnerBrandEditError("unknownField", field);
    }
  }
}

/** Mark only changed canonical fields, including clears; ignores `updatedAt`. Prior markers stay. */
export function changedBrandOwnerFields(
  before: BrandIntelligence | undefined,
  after: BrandIntelligence,
  prior: string[] = [],
) {
  return [
    ...new Set([
      ...prior,
      ...OWNER_BRAND_FIELDS.filter(
        (field) => !same(ownerBrandFieldValue(before, field), ownerBrandFieldValue(after, field)),
      ),
    ]),
  ].sort();
}

/**
 * Apply an owner's form edit atomically.
 *
 * `baseline` is the stored profile the form was loaded from, `edited` the form's
 * output and `current` the latest in-memory profile. A field counts as edited when
 * its normalized value differs from the normalized baseline, so a no-op form round
 * trip changes nothing. Unrelated newer changes in `current` are kept; a different
 * newer value for an edited field throws `conflict`; an identical one is accepted.
 * This guards the hydrated in-memory profile only, not a cross-session database
 * compare-and-swap.
 *
 * `own` lists this editor's unconfirmed earlier attempt per field: the attempted
 * value and the value actually stored before it (`confirmed`). A field whose current
 * value is still exactly that attempt is not a competing change: a correction or
 * retry saves without a self-conflict, and an explicit revert is a change to write,
 * not a no-op. For such a field only, the confirmed value (not the attempt) is the
 * authority for reusing stored rows, row metadata and the list-size bound, so
 * restoring rows or entries the failed attempt removed is accepted. Anything not in
 * the confirmed value is still new and validated; a field changed by anyone else is
 * not `own` and keeps the usual conflict rule and current-value authority.
 */
export type OwnerAttempt = { attempted: unknown; confirmed: unknown };
export function applyOwnerBrandEdits(
  baseline: BrandIntelligence | undefined,
  edited: BrandIntelligence,
  current: BrandIntelligence | undefined,
  now: string,
  own: Partial<Record<OwnerBrandField, OwnerAttempt>> = {},
): { brand: BrandIntelligence | undefined; changed: OwnerBrandField[] } {
  assertKnownPaths(baseline, edited);
  const isOwn = (field: OwnerBrandField) =>
    !!own[field] &&
    sameOwnerValue(field, ownerBrandFieldValue(current, field), own[field]!.attempted);
  const changed = OWNER_BRAND_FIELDS.filter(
    (field) =>
      !sameOwnerValue(
        field,
        ownerBrandFieldValue(baseline, field),
        ownerBrandFieldValue(edited, field),
      ) ||
      (isOwn(field) &&
        !sameOwnerValue(
          field,
          ownerBrandFieldValue(current, field),
          ownerBrandFieldValue(edited, field),
        )),
  );
  if (!changed.length) return { brand: current, changed };
  const values = new Map<OwnerBrandField, unknown>();
  for (const field of changed) {
    const before = ownerBrandFieldValue(baseline, field),
      latest = ownerBrandFieldValue(current, field),
      requested = ownerBrandFieldValue(edited, field);
    if (
      !isOwn(field) &&
      !sameOwnerValue(field, before, latest) &&
      !sameOwnerValue(field, requested, latest)
    )
      throw new OwnerBrandEditError("conflict", field);
    const [group, leaf] = field.split(".");
    const container = (current as Record<string, unknown> | undefined)?.[group];
    if (leaf && container != null && !isPlainObject(container))
      throw new OwnerBrandEditError("malformed", field);
    values.set(field, ownerValue(field, requested, isOwn(field) ? own[field]!.confirmed : latest));
  }
  // Everything validated: merge into the latest profile without touching other keys.
  const next: Record<string, unknown> = { ...current };
  for (const [field, value] of values) {
    const [group, leaf] = field.split(".");
    if (!leaf) next[group] = value;
    else
      next[group] = {
        ...(isPlainObject(next[group]) ? next[group] : {}),
        [leaf]: value,
      };
  }
  return { brand: { ...next, updatedAt: now } as BrandIntelligence, changed };
}

/** Compatibility wrapper: the merged profile, or `current` unchanged when nothing was edited. */
export function mergeOwnerBrandEdits(
  baseline: BrandIntelligence | undefined,
  edited: BrandIntelligence,
  current: BrandIntelligence | undefined,
  now: string,
) {
  return applyOwnerBrandEdits(baseline, edited, current, now).brand;
}
