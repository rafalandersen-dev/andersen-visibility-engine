import { z } from "zod";
import type { BrandIntelligence } from "./types";

type Field = { schema: z.ZodTypeAny; json: Record<string, unknown> };
const text = (max = 1000, min = 0): Field => ({
  schema: z.string().trim().min(min).max(max),
  json: { type: "string", minLength: min, maxLength: max },
});
const choices = (values: [string, ...string[]]): Field => ({
  schema: z.enum(values),
  json: { type: "string", enum: values },
});
const list = (item: Field, max = 20): Field => ({
  schema: z.array(item.schema).max(max),
  json: { type: "array", maxItems: max, items: item.json },
});
const object = (fields: Record<string, Field>, required: string[] = []): Field => ({
  schema: z
    .object(
      Object.fromEntries(
        Object.entries(fields).map(([name, field]) => [
          name,
          required.includes(name) ? field.schema : field.schema.optional(),
        ]),
      ),
    )
    .strict()
    .refine((value) => Object.keys(value).length > 0, "Provide at least one field"),
  json: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    ...(required.length ? { required } : {}),
    properties: Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [name, field.json]),
    ),
  },
});
const url: Field = {
  schema: z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
      if (value === "") return true;
      try {
        const u = new URL(value);
        return u.protocol === "https:" && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Use an HTTPS URL without credentials"),
  json: {
    type: "string",
    maxLength: 500,
    description: "HTTPS URL without credentials, or empty to clear. Stored only; not fetched.",
  },
};
const strings = list(text(500, 1));
const offer = object(
  {
    name: text(200, 1),
    type: choices(["service", "product", "package", "membership", "other"]),
    priority: choices(["high", "medium", "low"]),
    description: text(),
    url,
    targetAudience: text(500),
    notes: text(),
  },
  ["name", "type", "priority"],
);
const link = object(
  {
    label: text(200, 1),
    url,
    type: choices(["service", "product", "article", "booking", "contact", "other"]),
    priority: choices(["high", "medium", "low"]),
    notes: text(),
  },
  ["label", "url", "type", "priority"],
);
export const brandProposal = object({
  voice: object({
    tone: text(500),
    styleNotes: text(),
    wordsToUse: strings,
    wordsToAvoid: strings,
  }),
  claims: object({ allowedClaims: strings, forbiddenClaims: strings, requiredCaveats: strings }),
  offers: object({ primaryOffers: list(offer, 10), secondaryOffers: list(offer, 10) }),
  proof: object({
    proofPoints: strings,
    credentials: strings,
    testimonialsNotes: text(),
    trustSignals: strings,
  }),
  ctas: object({
    primaryCtaLabel: text(200),
    primaryCtaUrl: url,
    secondaryCtaLabel: text(200),
    secondaryCtaUrl: url,
    ctaStyleNotes: text(),
  }),
  internalLinks: list(link),
  marketLanguageRules: list(object({ market: text(100), language: text(100), notes: text() })),
  avoid: strings,
});
export type BrandProposal = Omit<BrandIntelligence, "updatedAt">;
export function brandProposalEntries(value: unknown): Array<{ field: string; value: unknown }> {
  const parsed = brandProposal.schema.safeParse(value);
  if (!parsed.success) return [];
  return Object.entries(parsed.data).flatMap(([group, entry]) => {
    if (Array.isArray(entry)) return [{ field: group, value: entry }];
    return Object.entries(entry as Record<string, unknown>).map(([key, v]) => ({
      field: `${group}.${key}`,
      value: v,
    }));
  });
}
/** Only validated leaf fields change. Unmentioned brand/project fields survive. */
export function mergeBrandProposal(
  current: BrandIntelligence | undefined,
  patch: BrandProposal,
  now: string,
): BrandIntelligence {
  const parsed = brandProposal.schema.parse(patch);
  const next: Record<string, unknown> = { ...current };
  for (const { field, value } of brandProposalEntries(parsed)) {
    const [group, key] = field.split(".");
    if (!key) next[group] = structuredClone(value);
    else {
      const prior = next[group];
      next[group] = {
        ...(prior && typeof prior === "object" && !Array.isArray(prior) ? prior : {}),
        [key]: structuredClone(value),
      };
    }
  }
  return { ...next, updatedAt: now } as BrandIntelligence;
}
/** Plain text for review; complete values, no HTML or clickable supplied URLs. */
export function displayBrandValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayBrandValue).join("\n");
  if (value && typeof value === "object")
    return Object.values(value).map(displayBrandValue).filter(Boolean).join(" · ");
  return String(value ?? "");
}
