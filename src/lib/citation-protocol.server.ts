import { z } from "zod";
import { analyzeAnswer, evidenceProjectId, evidenceRowSchema } from "./answer-evidence";
import { readAnswerEvidence } from "./answer-evidence.server";
import {
  brandRunApprovalSchema,
  citationProtocolStateSchema,
  lockedPanelSchema,
  panelDraftSchema,
  parseManualCaptureInput,
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
  const [protocol, evidence] = await Promise.all([
    readCitationProtocol(s, rpc),
    readAnswerEvidence(s, rpc),
  ]);
  const captures = resolveStoredCaptures(
    evidence.answers.map((a) => ({
      id: a.id,
      status: a.input.status,
      promptId: a.input.promptId,
      promptRevision: a.input.promptRevision,
      captureContext: a.input.captureContext,
    })),
    protocol.panels,
    protocol.brandRuns,
  );
  return { panels: protocol.panels, brandRuns: protocol.brandRuns, captures };
}
