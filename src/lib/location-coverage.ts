import { z } from "zod";
import type { KnowledgeRecord } from "./project-knowledge";

const short = z.string().trim().max(160);
const url = z
  .string()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
    } catch {
      return false;
    }
  }, "Use a public HTTPS URL without credentials, query or fragment");
/** Explicit owner/source claims. Never a Google connection, crawl or verified presence. */
export const coverageSchema = z
  .object({
    kind: z.enum(["local", "global"]),
    target: short.min(1),
    service: short,
    name: short,
    address: z.string().trim().max(240),
    phone: z.string().trim().max(60),
    language: z.string().trim().max(35),
    pageUrl: url,
    alternateUrl: url,
    citationUrl: url,
    reviewUrl: url,
    gbpUrl: url,
    notes: z.string().trim().max(400),
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= 2000, "Coverage record is too long");
export type Coverage = z.infer<typeof coverageSchema>;
export const emptyCoverage: Coverage = {
  kind: "local",
  target: "",
  service: "",
  name: "",
  address: "",
  phone: "",
  language: "",
  pageUrl: "",
  alternateUrl: "",
  citationUrl: "",
  reviewUrl: "",
  gbpUrl: "",
  notes: "",
};
export const isCoverageKey = (key: string) =>
  /^coverage\.(local|global)\.[A-Za-z0-9_-]{1,64}$/.test(key);
export function parseCoverage(record: Pick<KnowledgeRecord, "key" | "value">): Coverage | null {
  if (!isCoverageKey(record.key)) return null;
  try {
    const value = coverageSchema.parse(JSON.parse(record.value));
    return record.key.startsWith(`coverage.${value.kind}.`) ? value : null;
  } catch {
    return null;
  }
}
export function validCoverageRecord(
  record: Pick<KnowledgeRecord, "key" | "value" | "category" | "appliesTo">,
) {
  return (
    !record.key.startsWith("coverage.") ||
    (record.category === "fact" && record.appliesTo === "text" && parseCoverage(record) !== null)
  );
}
const normal = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
export function coverageConflictKeys(records: KnowledgeRecord[]): string[] {
  const parsed = records.map((record) => ({ record, value: parseCoverage(record) }));
  const conflicts = new Set<string>();
  for (let i = 0; i < parsed.length; i++)
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i],
        b = parsed[j];
      if (
        !a.value ||
        !b.value ||
        a.value.kind !== b.value.kind ||
        normal(a.value.target) !== normal(b.value.target)
      )
        continue;
      const fields: (keyof Coverage)[] =
        a.value.kind === "local" ? ["name", "address", "phone"] : [];
      if (
        normal(a.value.service) === normal(b.value.service) &&
        normal(a.value.language) === normal(b.value.language)
      )
        fields.push("pageUrl", "alternateUrl");
      if (
        fields.some(
          (field) =>
            a.value![field] &&
            b.value![field] &&
            (field.endsWith("Url")
              ? a.value![field] !== b.value![field]
              : normal(a.value![field]) !== normal(b.value![field])),
        )
      ) {
        conflicts.add(a.record.key);
        conflicts.add(b.record.key);
      }
    }
  return [...conflicts];
}
