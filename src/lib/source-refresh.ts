import { z } from "zod";
import type { KnowledgeScope } from "./project-knowledge";

const instant = z.string().datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const bounded = (max: number) => z.string().trim().min(1).max(max);
const scope = { ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) };

/** Source-reported observations, never independent claim verification or an
 * approval to edit/publish. Identity includes market/variant/currency so a
 * matching product name cannot accidentally validate another offer. */
export const observedFactSchema = z
  .object({
    key: bounded(200),
    productId: bounded(200).optional(),
    variantId: bounded(200).optional(),
    market: bounded(80).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    field: z.enum([
      "pageText",
      "name",
      "description",
      "specification",
      "price",
      "availability",
      "offer",
    ]),
    value: bounded(2000),
    locator: bounded(200),
    fingerprint: hash,
    validUntil: instant.optional(),
    validityUnknown: z.boolean().optional(),
  })
  .strict();
export type ObservedFact = z.infer<typeof observedFactSchema>;

export const sourceSnapshotSchema = z
  .object({
    ...scope,
    sourceId: z.string().uuid(),
    revision: z.number().int().positive(),
    observedAt: instant,
    // Public pages never establish whole-catalog completeness. Only an adapter
    // that completed its configured authenticated enumeration may say complete.
    coverage: z.enum(["public-page", "catalog-partial", "catalog-complete"]),
    facts: z.array(observedFactSchema).max(100),
    conflicts: z.array(hash).max(100).optional(),
    warnings: z
      .array(
        z.enum([
          "fact_limit",
          "limited_readable_text",
          "structured_data_limit",
          "invalid_structured_data",
          "missing_product_identity",
          "unsupported_offer",
          "unsupported_market",
          "offer_expiry_unknown",
          "unresolved_price",
        ]),
      )
      .max(9)
      .optional(),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    if (snapshot.conflicts?.some((key) => snapshot.facts.some((fact) => fact.key === key)))
      ctx.addIssue({ code: "custom", message: "Conflicting source fact cannot be usable" });
    if (new Set(snapshot.facts.map((f) => f.key)).size !== snapshot.facts.length)
      ctx.addIssue({ code: "custom", message: "Duplicate source fact identity" });
  });
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;

export type SourceChange = {
  key: string;
  kind: "added" | "changed" | "removed" | "unobserved";
  previous?: ObservedFact;
  current?: ObservedFact;
};

function sameScope(value: KnowledgeScope, target: KnowledgeScope) {
  return value.ownerId === target.ownerId && value.projectId === target.projectId;
}

/** Failed fetches do not enter this function: retain the last successful
 * snapshot and record the attempt separately. Partial coverage cannot prove
 * removal, even when an item appeared on the same page in an earlier read. */
export function compareSourceSnapshots(
  previous: SourceSnapshot | undefined,
  current: SourceSnapshot,
): SourceChange[] {
  sourceSnapshotSchema.parse(current);
  if (previous) {
    sourceSnapshotSchema.parse(previous);
    if (
      !sameScope(previous, current) ||
      previous.sourceId !== current.sourceId ||
      current.revision <= previous.revision ||
      Date.parse(current.observedAt) < Date.parse(previous.observedAt)
    )
      throw new Error("source_snapshot_conflict");
  }
  const before = new Map(previous?.facts.map((f) => [f.key, f]) ?? []);
  const after = new Map(current.facts.map((f) => [f.key, f]));
  const changes: SourceChange[] = [];
  for (const [key, fact] of after) {
    const old = before.get(key);
    if (!old) changes.push({ key, kind: "added", current: fact });
    else if (old.fingerprint !== fact.fingerprint)
      changes.push({ key, kind: "changed", previous: old, current: fact });
  }
  for (const [key, fact] of before) {
    if (!after.has(key))
      changes.push({
        key,
        kind:
          current.coverage === "catalog-complete" && previous?.coverage === "catalog-complete"
            ? "removed"
            : "unobserved",
        previous: fact,
      });
  }
  return changes.sort((a, b) => a.key.localeCompare(b.key));
}

export const outputDependencySchema = z
  .object({
    ...scope,
    sourceId: z.string().uuid(),
    sourceRevision: z.number().int().positive().optional(),
    snapshotRevision: z.number().int().positive().optional(),
    key: bounded(200),
    fingerprint: hash,
    productId: bounded(200).optional(),
    variantId: bounded(200).optional(),
    market: bounded(80).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    critical: z.boolean(),
  })
  .strict();
export type OutputDependency = z.infer<typeof outputDependencySchema>;
export type DependencyIssue = {
  sourceId: string;
  key: string;
  critical: boolean;
  reason: "unavailable" | "stale" | "changed" | "expired" | "identity-conflict";
};

/** Evaluate exact facts used by one output at the intended publication time.
 * Unknown/stale evidence remains unknown; a successful unrelated refresh does
 * not validate it. This returns issues only; never revises, retries or publishes. */
export function checkOutputDependencies(input: {
  scope: KnowledgeScope;
  dependencies: OutputDependency[];
  snapshots: SourceSnapshot[];
  unavailableSourceIds: string[];
  now: string;
  useAt: string;
  maxAgeMs: number;
}): DependencyIssue[] {
  z.object(scope).strict().parse(input.scope);
  const now = Date.parse(instant.parse(input.now));
  const useAt = Date.parse(instant.parse(input.useAt));
  if (
    !Number.isSafeInteger(input.maxAgeMs) ||
    input.maxAgeMs <= 0 ||
    input.maxAgeMs > 7 * 86400_000 ||
    useAt < now
  )
    throw new Error("invalid_freshness_window");
  const deps = z.array(outputDependencySchema).max(100).parse(input.dependencies);
  const snapshots = z.array(sourceSnapshotSchema).max(100).parse(input.snapshots);
  if (
    deps.some((d) => !sameScope(d, input.scope)) ||
    snapshots.some((s) => !sameScope(s, input.scope))
  )
    throw new Error("source_scope_conflict");
  const sources = new Map(snapshots.map((s) => [s.sourceId, s]));
  if (sources.size !== snapshots.length) throw new Error("source_snapshot_conflict");
  const unavailable = new Set(
    z.array(z.string().uuid()).max(100).parse(input.unavailableSourceIds),
  );
  return deps.flatMap((dependency) => {
    const snapshot = sources.get(dependency.sourceId);
    const fact = snapshot?.facts.find((f) => f.key === dependency.key);
    let reason: DependencyIssue["reason"] | undefined;
    if (!snapshot || !fact || fact.validityUnknown || unavailable.has(dependency.sourceId))
      reason = "unavailable";
    else if (
      Date.parse(snapshot.observedAt) > now ||
      useAt - Date.parse(snapshot.observedAt) > input.maxAgeMs
    )
      reason = "stale";
    else if (
      ["productId", "variantId", "market", "currency"].some(
        (key) => fact[key as keyof ObservedFact] !== dependency[key as keyof OutputDependency],
      )
    )
      reason = "identity-conflict";
    else if (fact.fingerprint !== dependency.fingerprint) reason = "changed";
    else if (fact.validUntil && Date.parse(fact.validUntil) <= useAt) reason = "expired";
    return reason
      ? [
          {
            sourceId: dependency.sourceId,
            key: dependency.key,
            critical: dependency.critical,
            reason,
          },
        ]
      : [];
  });
}

/** Cross-source contradiction detection requires explicit matching identity.
 * We never equate a SKU, URL and Shopify GID by guessing. Generic page excerpts
 * and independently named specifications cannot be matched by field alone. */
export function conflictingSourceFacts(snapshots: SourceSnapshot[]) {
  const groups = new Map<string, { sourceId: string; key: string; value: string }[]>();
  for (const snapshot of snapshots)
    for (const fact of snapshot.facts) {
      if (!fact.productId || fact.field === "pageText" || fact.field === "specification") continue;
      const identity = JSON.stringify([
        fact.productId,
        fact.variantId ?? "",
        fact.market ?? "",
        fact.currency ?? "",
        fact.field,
      ]);
      const group = groups.get(identity) ?? [];
      group.push({
        sourceId: snapshot.sourceId,
        key: fact.key,
        value: JSON.stringify([fact.value, fact.validUntil ?? "", fact.validityUnknown ?? false]),
      });
      groups.set(identity, group);
    }
  const conflicts = new Set<string>();
  for (const group of groups.values())
    if (
      new Set(group.map((f) => f.sourceId)).size > 1 &&
      new Set(group.map((f) => f.value)).size > 1
    )
      for (const fact of group) conflicts.add(`${fact.sourceId}:${fact.key}`);
  return conflicts;
}
