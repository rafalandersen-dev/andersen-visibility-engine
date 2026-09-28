/**
 * Change evidence contracts (candidate migration 20260928120000): intended-change artifacts for listing and
 * configuration changes (enumerated NON-SECRET fields only), their version-bound approval provenance, performed
 * declarations, inspection assignments and the inspector's masked view. Pure schemas/helpers; no React, no
 * server access.
 */
import { z } from "zod";

const uuid = z.string().uuid();
const projectId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });

export const CITATION_CHANGE_KINDS = ["listing", "configuration"] as const;
export type CitationChangeKind = (typeof CITATION_CHANGE_KINDS)[number];
/** The ONLY supported fields per kind — the same allow-list the database enforces. Credentials, tokens,
 * connector secrets, private settings, raw dumps and uploads have no key here and are refused. */
export const CITATION_CHANGE_FIELDS: Readonly<Record<CitationChangeKind, readonly string[]>> = {
  listing: [
    "name",
    "address",
    "phone",
    "openingHours",
    "website",
    "description",
    "category",
    "priceRange",
  ],
  configuration: [
    "siteTitle",
    "siteTagline",
    "defaultPostType",
    "businessName",
    "businessAddress",
    "businessPhone",
    "businessHours",
    "robotsIndexing",
    "canonicalUrl",
    "structuredDataType",
    "websiteUrl",
  ],
};
const EMBEDDED_CREDENTIALS = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*@/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const fieldValue = z
  .string()
  .min(1)
  .max(500)
  .refine((v) => v.trim().length > 0 && !CONTROL_CHARS.test(v) && !EMBEDDED_CREDENTIALS.test(v), {
    message: "unsupported value",
  });
/** EXACT nested shape (R1/1): `after` required, `before` optional (text or null); any other nested key is refused. */
const fieldChange = z
  .object({ before: fieldValue.nullable().optional(), after: fieldValue })
  .strict();
export const changeFieldsSchema = z.record(z.string(), fieldChange);
/** Client-side pre-check mirroring `citation_change_fields_valid`: unknown keys or an empty set fail. */
export function changeFieldsValid(kind: CitationChangeKind, fields: unknown): boolean {
  const parsed = changeFieldsSchema.safeParse(fields);
  if (!parsed.success) return false;
  const keys = Object.keys(parsed.data);
  return (
    keys.length >= 1 &&
    keys.length <= 12 &&
    keys.every((k) => CITATION_CHANGE_FIELDS[kind].includes(k))
  );
}

export const changeArtifactInputSchema = z
  .object({
    expectedOwnerId: uuid,
    projectId,
    kind: z.enum(CITATION_CHANGE_KINDS),
    reference: z.string().min(1).max(1500),
    fields: changeFieldsSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!changeFieldsValid(v.kind, v.fields))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields"], message: "unsupported field" });
  });
/** Approval provenance. `revision` is the approval subject's OWN head (0 = no decision yet); a write names the
 * revision it reviewed. `replayed` marks a lost-response retry that returned ITS historical decision (its
 * `revision` may be older than `currentRevision`) — never a new approval. */
export const changeApprovalProvenanceSchema = z
  .object({
    approved: z.boolean(),
    approverKind: z.enum(["owner", "delegate"]).nullable(),
    approverId: uuid.nullable(),
    approvedAt: z.string().nullable(),
    revision: z.number().int().min(0),
    currentRevision: z.number().int().min(0),
    replayed: z.boolean(),
  })
  .strict();
export const changeReceiptSchema = z
  .object({
    id: uuid,
    performedBy: uuid,
    performerKind: z.enum(["owner", "delegate"]),
    performedAt: z.string(),
    recordedAt: z.string(),
  })
  .strict();
export const changeArtifactSchema = z
  .object({
    id: uuid,
    kind: z.enum(CITATION_CHANGE_KINDS),
    reference: z.string(),
    fields: changeFieldsSchema,
    artifactSha256: sha,
    createdBy: uuid,
    createdAt: z.string(),
    approval: z
      .object({
        approved: z.boolean(),
        current: z.boolean(),
        revision: z.number().int().min(1),
        approverKind: z.enum(["owner", "delegate"]),
        approverId: uuid,
        approvedAt: z.string(),
      })
      .strict()
      .nullable(),
    receipts: z.array(changeReceiptSchema).max(1000),
  })
  .strict();
export const changeArtifactsStateSchema = z
  .object({ artifacts: z.array(changeArtifactSchema).max(200) })
  .strict();
export const changeSavedReceiptSchema = changeReceiptSchema
  .extend({
    artifactId: uuid,
    artifactSha256: sha,
    kind: z.enum(CITATION_CHANGE_KINDS),
    reference: z.string(),
  })
  .strict();

// Owner-scoped inputs (the authenticated caller IS the owner; `expectedOwnerId` is a change guard).
export const changeApprovalInputSchema = z
  .object({
    expectedOwnerId: uuid,
    projectId,
    artifactId: uuid,
    expectedSha: sha,
    approved: z.boolean(),
    /** The approval revision the approver reviewed (0 = none yet); a moved decision is refused as stale. */
    expectedRevision: z.number().int().min(0).max(1000000),
    /** Frozen per click; a retry of the same request replays its own historical result. */
    requestId: uuid,
  })
  .strict();
export const changeReceiptInputSchema = z
  .object({ expectedOwnerId: uuid, projectId, artifactId: uuid, performedAt: instant })
  .strict();
export const changeArtifactTargetSchema = z
  .object({ expectedOwnerId: uuid, projectId, artifactId: uuid })
  .strict();
export const changeReceiptTargetSchema = z
  .object({ expectedOwnerId: uuid, projectId, receiptId: uuid })
  .strict();
export const inspectionAssignmentInputSchema = z
  .object({ expectedOwnerId: uuid, projectId, improvementRowId: uuid, inspectorId: uuid })
  .strict();

// Actor-scoped inputs (the authenticated caller is the INSPECTOR / delegate; owner + project are supplied and the
// database decides authority from the live team membership/policy and the explicit assignment).
export const inspectionTargetSchema = z
  .object({ ownerId: uuid, projectId, improvementRowId: uuid })
  .strict();
export const inspectionInputSchema = inspectionTargetSchema
  .extend({
    expectedSha: sha,
    checkResult: z.enum(["shows_approved_content", "does_not_show", "inconclusive", "withdrawn"]),
    observedAt: instant.nullable(),
    expectedVersion: z.number().int().min(0).max(10000),
    expectedHeadId: uuid.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.checkResult === "withdrawn") !== (v.observedAt === null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observedAt"],
        message: "instant pairing",
      });
    if (v.expectedVersion > 0 !== (typeof v.expectedHeadId === "string"))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedHeadId"],
        message: "head pairing",
      });
  });
export const delegateApprovalInputSchema = z
  .object({
    ownerId: uuid,
    projectId,
    artifactId: uuid,
    expectedSha: sha,
    approved: z.boolean(),
    expectedRevision: z.number().int().min(0).max(1000000),
    requestId: uuid,
  })
  .strict();
export const delegateReceiptInputSchema = z
  .object({ ownerId: uuid, projectId, artifactId: uuid, performedAt: instant })
  .strict();

export const inspectionViewSchema = z
  .object({
    id: uuid,
    improvementId: uuid,
    version: z.number().int().min(1),
    expectedSha: sha,
    kind: z.enum(["public_url", "listing", "configuration"]).nullable(),
    destinationReference: z.string().nullable(),
    approvedVersion: z.string().nullable(),
    approval: z.object({ known: z.boolean(), approvedAt: z.string().nullable() }).strict(),
    performer: z.object({ known: z.boolean(), anchorAt: z.string().nullable() }).strict(),
    independenceAvailable: z.boolean(),
    approvedContent: z
      .union([
        z.object({ markdown: z.string() }).strict(),
        z.object({ fields: changeFieldsSchema }).strict(),
      ])
      .nullable(),
    boundFindings: z
      .array(
        z
          .object({
            findingId: uuid,
            version: z.number().int(),
            family: z.string(),
            decision: z.string(),
          })
          .strict(),
      )
      .max(20),
    /** The inspector's current chain head and whether it still has effect (a re-granted assignment, a renewed
     * membership or a lost independence make it ineffective: record a FRESH inspection against this head). */
    myHead: z
      .object({
        version: z.number().int(),
        id: uuid,
        effective: z.boolean(),
        ineffectiveReason: z
          .enum(["superseded", "withdrawn", "account", "assignment", "authority", "independence"])
          .nullable(),
      })
      .strict()
      .nullable(),
    myInspections: z
      .array(
        z
          .object({
            id: uuid,
            version: z.number().int(),
            checkResult: z.enum([
              "shows_approved_content",
              "does_not_show",
              "inconclusive",
              "withdrawn",
            ]),
            observedAt: z.string().nullable(),
            createdAt: z.string(),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type InspectionView = z.infer<typeof inspectionViewSchema>;
export const inspectionReceiptSavedSchema = z
  .object({
    id: uuid,
    improvementRowId: uuid,
    inspectorId: uuid,
    version: z.number().int(),
    supersedesId: uuid.nullable(),
    checkResult: z.enum(["shows_approved_content", "does_not_show", "inconclusive", "withdrawn"]),
    observedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();

/** Fixed allowlist of change/inspection outcome tokens the owner or inspector can act on. */
export const CHANGE_ERROR_KEYS: Readonly<Record<string, string>> = {
  citation_change_unsupported: "citationChange.error.unsupported",
  citation_change_unavailable: "citationChange.error.unavailable",
  citation_change_stale: "citationChange.error.stale",
  citation_change_forbidden: "citationChange.error.forbidden",
  citation_change_unapproved: "citationChange.error.unapproved",
  citation_change_receipt_invalid: "citationChange.error.receiptInvalid",
  citation_change_capacity: "citationChange.error.capacity",
  citation_inspection_invalid: "citationChange.error.inspectionInvalid",
  citation_inspection_forbidden: "citationChange.error.forbidden",
  citation_inspection_stale: "citationChange.error.stale",
  citation_inspection_not_independent: "citationChange.error.notIndependent",
  citation_inspection_identity_unavailable: "citationChange.error.identityUnavailable",
  citation_inspection_version_conflict: "citationChange.error.inspectionConflict",
  citation_improvement_unavailable: "citationChange.error.unavailable",
};
export function changeErrorKey(code: string): string {
  return CHANGE_ERROR_KEYS[code] ?? "citationChange.error.generic";
}
/** Owner-side display fold of one row's inspection receipts (the server computes the authoritative status; this
 * only groups the chain per inspector for the audit list: head first, history after). */
export function inspectionChains<T extends { inspectorId: string; version: number }>(
  receipts: readonly T[],
): Array<{ inspectorId: string; head: T; history: T[] }> {
  const byInspector = new Map<string, T[]>();
  for (const r of receipts) {
    const list = byInspector.get(r.inspectorId) ?? [];
    list.push(r);
    byInspector.set(r.inspectorId, list);
  }
  return [...byInspector.entries()].map(([inspectorId, list]) => {
    const sorted = [...list].sort((a, b) => b.version - a.version);
    return { inspectorId, head: sorted[0], history: sorted.slice(1) };
  });
}
