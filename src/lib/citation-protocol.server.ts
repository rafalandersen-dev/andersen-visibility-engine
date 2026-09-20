import { z } from "zod";
import { analyzeAnswer, evidenceProjectId, evidenceRowSchema } from "./answer-evidence";
import { readAnswerEvidence } from "./answer-evidence.server";
import {
  brandRunApprovalSchema,
  citationProtocolStateSchema,
  citationReports,
  lockedPanelSchema,
  panelDraftSchema,
  parseManualCaptureInput,
  resolveErasedSlots,
  resolveStoredCaptures,
} from "./citation-protocol";
import { brandRunSchema } from "./citation-panel";
import type { KnowledgeRpc } from "./project-knowledge.server";

/**
 * Server helpers for CI-2 panel/protocol storage, brand-run approval and manual capture context.
 * All owner identity, review identity and approval timestamps are derived on the server (the RPCs
 * mint them); the client never supplies them. Panel versions are immutable, and a capture is only
 * accepted when the RPC resolves its panel version and any brand run against actual stored records.
 * Network-free: no provider, collector or URL calls. Mirrors answer-evidence.server.ts.
 */
const scope = z.object({ ownerId: z.string().uuid(), projectId: evidenceProjectId }).strict();

async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const r = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("citation_protocol_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw Error("citation_protocol_unavailable");
    return r.data;
  } finally {
    clearTimeout(timer);
  }
}

export async function readCitationProtocol(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return citationProtocolStateSchema.parse(
    await call("read_citation_protocol", { p_user: s.ownerId, p_project: s.projectId }, rpc),
  );
}

/** Append an immutable draft panel version. The panel id and next version are checked against the
 * expected current version so a stale or racing draft cannot silently overwrite another. */
export async function saveCitationPanelDraft(
  raw: z.infer<typeof scope>,
  panelId: string,
  expected: number,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const id = z.string().uuid().parse(panelId);
  const expectedVersion = z.number().int().min(0).max(999).parse(expected);
  const draft = panelDraftSchema.parse(value);
  if (draft.panelId !== id || draft.version !== expectedVersion + 1)
    throw Error("citation_panel_draft_mismatch");
  return panelDraftSchema.parse(
    await call(
      "save_citation_panel_draft",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_panel: id,
        p_expected: expectedVersion,
        p_document: draft,
      },
      rpc,
    ),
  );
}

/** Lock a reviewed draft. The server copies the reviewed draft content verbatim (freezing the
 * client market, languages, surface, session controls and collection location) and mints the
 * owner approval receipt from the authenticated caller and the database clock. */
export async function lockCitationPanel(
  raw: z.infer<typeof scope>,
  panelId: string,
  expectedVersion: number,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const locked = lockedPanelSchema.parse(
    await call(
      "lock_citation_panel",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_panel: z.string().uuid().parse(panelId),
        p_expected: z.number().int().min(1).max(999).parse(expectedVersion),
      },
      rpc,
    ),
  );
  // Defence in depth: the approval must name the authenticated owner the server locked under.
  if (locked.approval?.approvedBy !== s.ownerId) throw Error("citation_panel_owner_mismatch");
  return locked;
}

/** Approve one brand diagnostic run bound to a locked brand panel version, with an owner-set
 * observation budget and round cap. Discovery is never scheduled here. */
export async function approveBrandRun(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const approval = brandRunApprovalSchema.parse(value);
  const run = brandRunSchema.parse(
    await call(
      "approve_citation_brand_run",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_run: approval.runId,
        p_panel: approval.panelId,
        p_version: approval.panelVersion,
        p_budget: approval.observationBudget,
        p_rounds: approval.rounds,
      },
      rpc,
    ),
  );
  if (run.approvedBy !== s.ownerId) throw Error("citation_brand_run_owner_mismatch");
  return run;
}

/**
 * Import a manual capture bound to a panel/slot/brand-run. The document is built exactly as the
 * legacy answer import (prompt snapshot + derived analysis) so a capture satisfies the same
 * derived-data contract as reads, and the capture context rides inside `input` so it is part of
 * the dedup hash. The panel version, question binding and brand-run budget are resolved by the
 * RPC against actual stored records; nothing here trusts the capture's own asserted binding.
 */
export async function importManualCapture(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const { input } = parseManualCaptureInput(value);
  const state = await readAnswerEvidence(s, rpc);
  const prompt = state.prompts.find(
    (p) => p.id === input.promptId && p.revision === input.promptRevision,
  );
  if (!prompt) throw Error("evidence_prompt_missing");
  const document = evidenceRowSchema
    .omit({ id: true, createdAt: true, hash: true })
    .parse({ input, prompt, analysis: analyzeAnswer(input, prompt) });
  if (new TextEncoder().encode(JSON.stringify(document)).length > 90000)
    throw Error("answer_evidence_too_large");
  return z
    .string()
    .uuid()
    .parse(
      await call(
        "save_citation_capture",
        { p_user: s.ownerId, p_project: s.projectId, p_document: document },
        rpc,
      ),
    );
}

/** Read the panels, brand runs and answer records together and resolve each stored capture against
 * the actual locked panels/approved runs. This is the read-side "resolve before counts" step; the
 * human-reviewed facts and counts themselves are the separate findings packet. */
export async function readResolvedCaptures(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  // Read the dependent captures (evidence) BEFORE their append-only panel/run dependencies
  // (protocol), sequentially — never Promise.all, which could read a stale protocol snapshot against
  // newer evidence. A capture's referenced panel version and approved run are committed before the
  // capture, so reading the protocol strictly after the evidence guarantees the protocol snapshot is
  // at least as new as the evidence: any dependency that existed when a capture was written is present
  // in the later read, and a concurrent panel lock / run approval / capture import can no longer
  // produce a spurious panel_unresolved or brand_run_not_approved. A panel/run genuinely deleted
  // between the two reads is still (correctly) seen as unresolved — deletion invalidation is preserved.
  const evidence = await readAnswerEvidence(s, rpc);
  const protocol = await readCitationProtocol(s, rpc);
  // Stale-read reconciliation by chain IDENTITY, applied to the RAW evidence BEFORE active-leaf/slot
  // resolution (evidence is read strictly BEFORE protocol). A row the older evidence still shows live
  // may have been deleted by the newer protocol read. A tombstone records the erased ORIGINAL's id —
  // the correction chain's ROOT (the trigger writes one only for a `supersedes` null row). Every row
  // whose chain root is a tombstoned original is dropped from the raw set. Doing this BEFORE resolution
  // is essential: resolving first would collapse two independent originals sharing one slot into a
  // single stable-first entry and discard the sibling, so filtering afterwards could remove the kept
  // copy and leave no survivor. Filtering the raw set instead removes only the deleted chain's own rows
  // and leaves a genuine independent survivor (and its own correction chain, whose leaf id is NOT its
  // root — found by walking `supersedesId`) to resolve normally. The chain root is resolved from the
  // complete evidence ancestry map.
  const parentOf = new Map<string, string | null>();
  for (const a of evidence.answers) parentOf.set(a.id, a.input.supersedesId ?? null);
  const rootOf = (id: string): string => {
    let cur = id;
    const seen = new Set<string>([cur]);
    let p = parentOf.get(cur) ?? null;
    while (p !== null && parentOf.has(p) && !seen.has(p)) {
      cur = p;
      seen.add(cur);
      p = parentOf.get(cur) ?? null;
    }
    return cur;
  };
  const tombstonedRoots = new Set(protocol.tombstones.map((t) => t.answerId));
  const survivingAnswers = evidence.answers.filter((a) => !tombstonedRoots.has(rootOf(a.id)));
  // A survivor sharing a slot with a KNOWN erased original is ambiguous duplicate history: the resolver
  // flags it `erased_duplicate_slot` and demotes it (never a silent success). These keys match the
  // resolver's internal slot key. Only transmitted (grid, LIMIT-bounded) tombstones are known here; when
  // truncated, `coverageComplete` is false for the version so the incompleteness is already surfaced.
  const tombstoneSlotKey = (t: {
    panelId: string;
    panelVersion: number;
    brandRunId: string | null;
    questionId: string;
    round: number;
  }) => JSON.stringify([t.panelId, t.panelVersion, t.brandRunId, t.questionId, t.round]);
  const erasedSlotKeys = new Set(protocol.tombstones.map(tombstoneSlotKey));
  const captures = resolveStoredCaptures(
    survivingAnswers.map((a) => ({
      id: a.id,
      status: a.input.status,
      promptId: a.input.promptId,
      promptRevision: a.input.promptRevision,
      captureContext: a.input.captureContext,
      // Carry the correction link so the resolver keeps only active chain leaves (raw history stays).
      supersedesId: a.input.supersedesId,
    })),
    protocol.panels,
    protocol.brandRuns,
    erasedSlotKeys,
  );
  // Content-free erased-slot facts: an erased consumed attempt (a deleted capture that left a
  // tombstone) is surfaced as an erased observation so the report never mistakes it for an absent/
  // missed slot. Any slot a (reconciled) surviving capture still occupies is excluded (no double
  // count). These are the distinct content-safe grid slots for COVERAGE only — never the budget count.
  const erasedSlots = resolveErasedSlots(
    protocol.tombstones,
    protocol.panels,
    protocol.brandRuns,
    captures,
  );
  // Consumed budget is AUTHORITATIVE from the read RPC's SQL aggregate (`runConsumed`), computed with
  // the exact write-gate predicate in one snapshot — never reconstructed here from the LIMIT-bounded or
  // slot-collapsed coverage, and NOT subject to the capture reconciliation (the write gate counts a
  // surviving live original AND an erased sibling at the same slot as two; a JS reconstruction that
  // dropped same-slot live originals would under-report). Bounded to the approved runs.
  const consumedByRun: Record<string, number> = {};
  for (const r of protocol.runConsumed) consumedByRun[r.runId] = r.consumed;
  // Content-free malformed-tombstone counts per panel version, surfaced as `excluded` in the report.
  const excludedByVersion: Record<string, number> = {};
  // Coverage completeness per version: the transmitted (LIMIT-bounded) grid tombstone rows for a version
  // vs its TRUE grid-row total. When fewer were transmitted, coverage is incomplete and the report must
  // not derive a definitive neverObserved. `tombstones` is content-safe grid rows only, so counting them
  // per version against `gridRows` detects the LIMIT truncation exactly.
  const receivedByVersion: Record<string, number> = {};
  for (const t of protocol.tombstones) {
    const k = `${t.panelId}:${t.panelVersion}`;
    receivedByVersion[k] = (receivedByVersion[k] ?? 0) + 1;
  }
  const coverageCompleteByVersion: Record<string, boolean> = {};
  for (const v of protocol.erasureByVersion) {
    const k = `${v.panelId}:${v.panelVersion}`;
    excludedByVersion[k] = (excludedByVersion[k] ?? 0) + v.excludedRows;
    coverageCompleteByVersion[k] = (receivedByVersion[k] ?? 0) >= v.gridRows;
  }
  const erasure = {
    slots: erasedSlots,
    consumedByRun,
    excludedByVersion,
    coverageCompleteByVersion,
  };
  // Canonical erased-aware report per locked panel version, computed at the service boundary from these
  // trusted facts so a consumer cannot read `captures` and silently ignore erased/consumed facts.
  // `erasureOverflow` (tombstone rows orphaned by a deleted panel) is surfaced so nothing is dropped.
  const reports = citationReports(protocol.panels, protocol.brandRuns, captures, erasure);
  return {
    panels: protocol.panels,
    brandRuns: protocol.brandRuns,
    captures,
    erasedSlots,
    reports,
    erasureOverflow: protocol.erasureOverflow,
  };
}
