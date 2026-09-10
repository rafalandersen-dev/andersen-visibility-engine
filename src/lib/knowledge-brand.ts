import {
  brandProposal,
  brandProposalEntries,
  mergeBrandProposal,
  type BrandProposal,
} from "./brand-proposal";
import type { BrandIntelligence } from "./types";
import type { BrandDocumentSegment } from "./brand-document";
import type { KnowledgeRecord, KnowledgeSelection } from "./project-knowledge";

/** Explicit text labels only. No model, OCR, layout inference, or claim verification. */
export const knowledgeBrandFields = [
  {
    field: "voice.tone",
    category: "voice",
    label: "brand.voice.tone",
    list: false,
    aliases: ["tone", "tone of voice", "ton", "tonalitet", "ton głosu", "toneleje"],
  },
  {
    field: "voice.styleNotes",
    category: "voice",
    label: "brand.voice.styleNotes",
    list: false,
    aliases: ["style notes", "writing style", "skrivstil", "styl pisania", "skrivestil"],
  },
  {
    field: "voice.wordsToUse",
    category: "terminology",
    label: "brand.voice.wordsToUse",
    list: true,
    aliases: [
      "words to use",
      "preferred terms",
      "ord att använda",
      "zalecane słowa",
      "ord der skal bruges",
    ],
  },
  {
    field: "voice.wordsToAvoid",
    category: "terminology",
    label: "brand.voice.wordsToAvoid",
    list: true,
    aliases: [
      "words to avoid",
      "avoided terms",
      "ord att undvika",
      "słowa do unikania",
      "ord der skal undgås",
    ],
  },
  {
    field: "claims.forbiddenClaims",
    category: "claimRestriction",
    label: "brand.claims.forbidden",
    list: true,
    aliases: [
      "forbidden claims",
      "claim restrictions",
      "förbjudna påståenden",
      "niedozwolone twierdzenia",
      "forbudte påstande",
    ],
  },
  {
    field: "claims.requiredCaveats",
    category: "claimRestriction",
    label: "brand.claims.caveats",
    list: true,
    aliases: [
      "required caveats",
      "obligatoriska förbehåll",
      "wymagane zastrzeżenia",
      "påkrævede forbehold",
    ],
  },
] as const;
export type BrandProfile = {
  brandIntelligence?: BrandIntelligence | null;
  brandOwnerFields?: string[];
  toneOfVoice?: string;
};
export function mappedBrandField(key: string) {
  return knowledgeBrandFields.find((entry) => `brand.${entry.field}` === key);
}
export function brandFieldValue(
  brand: BrandIntelligence | null | undefined,
  field: string,
): unknown {
  const [group, leaf] = field.split(".");
  const value = (brand as Record<string, unknown> | undefined)?.[group];
  return leaf && value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[leaf]
    : leaf
      ? undefined
      : value;
}
const blank = (v: unknown) =>
  v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
export function brandRecordPatch(
  record: Pick<KnowledgeRecord, "key" | "value">,
): BrandProposal | null {
  const field = mappedBrandField(record.key);
  if (!field) return null;
  const [group, leaf] = field.field.split(".");
  const value = field.list
    ? record.value
        .split(/[\n;]/)
        .map((v) => v.trim())
        .filter(Boolean)
    : record.value.trim();
  const patch = { [group]: { [leaf]: value } };
  return brandProposal.schema.safeParse(patch).success ? (patch as BrandProposal) : null;
}
export function brandRecordDisposition(
  profile: BrandProfile,
  record: Pick<KnowledgeRecord, "key" | "value">,
) {
  const field = mappedBrandField(record.key);
  if (!field) return "unmapped" as const;
  if (!brandRecordPatch(record)) return "invalid" as const;
  const current = brandFieldValue(profile.brandIntelligence, field.field);
  // Malformed legacy containers and explicit owner clears are never fillable.
  const group = field.field.split(".")[0];
  const container = (profile.brandIntelligence as Record<string, unknown> | undefined)?.[group];
  if (
    profile.brandOwnerFields?.includes(field.field) ||
    !blank(current) ||
    (container != null && (typeof container !== "object" || Array.isArray(container))) ||
    (field.field === "voice.tone" && !blank(profile.toneOfVoice))
  )
    return "owner" as const;
  return "fills" as const;
}
export function filterBrandKnowledge(
  selection: KnowledgeSelection,
  profile: BrandProfile,
): KnowledgeSelection {
  const keep = selection.records.map((record) =>
    ["unmapped", "fills"].includes(brandRecordDisposition(profile, record)),
  );
  return {
    ...selection,
    records: selection.records.filter((_, i) => keep[i]),
    references: selection.references.filter((_, i) => keep[i]),
    omitted: selection.omitted + keep.filter((v) => !v).length,
  };
}
/** Derived values are never copied into workspace storage. Rebuild from active, reviewed records. */
export function resolveKnowledgeBrand(
  profile: BrandProfile,
  records: KnowledgeRecord[],
  now: string,
) {
  let brand = profile.brandIntelligence ?? undefined;
  for (const record of records) {
    if (brandRecordDisposition(profile, record) !== "fills") continue;
    const patch = brandRecordPatch(record);
    if (patch) brand = mergeBrandProposal(brand, patch, now);
  }
  return brand;
}
/** Mark only changed fields, including clears; a routine save cannot adopt derived values. */
export function changedBrandOwnerFields(
  before: BrandIntelligence | undefined,
  after: BrandIntelligence,
  prior: string[] = [],
) {
  const fields = new Set([
    ...brandProposalEntries(
      before && Object.fromEntries(Object.entries(before).filter(([key]) => key !== "updatedAt")),
    ).map((x) => x.field),
    ...knowledgeBrandFields.map((x) => x.field),
  ]);
  for (const entry of brandProposalEntries(
    Object.fromEntries(Object.entries(after).filter(([key]) => key !== "updatedAt")),
  ))
    fields.add(entry.field);
  return [
    ...new Set([
      ...prior,
      ...[...fields].filter((field) => {
        const a = brandFieldValue(before, field),
          b = brandFieldValue(after, field);
        return !(blank(a) && blank(b)) && JSON.stringify(a) !== JSON.stringify(b);
      }),
    ]),
  ].sort();
}
export function extractLabelledBrandProposals(segments: BrandDocumentSegment[]) {
  const proposals: Array<
    Pick<KnowledgeRecord, "key" | "category" | "appliesTo" | "value" | "locator" | "excerpt">
  > = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    for (const line of segment.text.split(/\r?\n/)) {
      const match = /^\s*(?:[-*#]+\s*)?([^:]{2,60}):\s*(\S.*)$/.exec(line);
      if (!match) continue;
      const field = knowledgeBrandFields.find((entry) =>
        (entry.aliases as readonly string[]).includes(match[1].trim().toLocaleLowerCase()),
      );
      if (!field) continue;
      const proposal = {
        key: `brand.${field.field}`,
        category: field.category,
        appliesTo: "both" as const,
        value: match[2].trim(),
        locator: segment.locator,
        excerpt: line.trim(),
      };
      const identity = JSON.stringify([proposal.key, proposal.value, proposal.locator]);
      if (
        proposal.value.length > 2000 ||
        proposal.excerpt.length > 2000 ||
        !brandRecordPatch(proposal) ||
        seen.has(identity)
      )
        continue;
      seen.add(identity);
      proposals.push(proposal);
      if (proposals.length === 30) return proposals;
    }
  }
  return proposals;
}

/** Save only the fields edited in this form. A stale form cannot erase unrelated
 * new owner settings; competing edits to the same field require reloading. */
export function mergeOwnerBrandEdits(
  baseline: BrandIntelligence | undefined,
  edited: BrandIntelligence,
  current: BrandIntelligence | undefined,
  now: string,
) {
  const changed = changedBrandOwnerFields(baseline, edited);
  if (!changed.length) return current;
  const patch: Record<string, unknown> = {};
  for (const field of changed) {
    const before = brandFieldValue(baseline, field),
      latest = brandFieldValue(current, field),
      value = brandFieldValue(edited, field);
    if (
      !(blank(before) && blank(latest)) &&
      JSON.stringify(before) !== JSON.stringify(latest) &&
      JSON.stringify(value) !== JSON.stringify(latest)
    )
      throw new Error("brand_profile_changed");
    const [group, leaf] = field.split(".");
    if (leaf)
      patch[group] = { ...(patch[group] as Record<string, unknown> | undefined), [leaf]: value };
    else patch[group] = value;
  }
  return mergeBrandProposal(current, patch as BrandProposal, now);
}
