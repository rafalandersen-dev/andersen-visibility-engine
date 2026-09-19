import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceConversationTurn,
  assertConversationExecution,
  claimConversationTurn,
  readConversation,
  readConversationForExecution,
} from "./milo-conversation.server";
import { exportConversationPage } from "./milo-conversation-lifecycle.server";
import { acquireTeamPreview } from "./project-team-preview-limit.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
import type { TeamReadRpc } from "./project-team-read.server";
import type { SpecialistToolDeps } from "./milo-specialist-tools.server";
import { runConversationSpecialists } from "./milo-specialist-executor.server";
import { runSpecialistTool } from "./milo-specialist-tools.server";
import {
  recordConversationDiagnostic,
  type ConversationDiagnosticInput,
} from "./milo-conversation-diagnostics.server";

// Live regression for the 19 September conversation failure. The trusted
// conversation executor must never draw on the browser preview-lease budget:
// claim, the continuity read (readConversationForExecution), the project-brief and
// draft snapshot reads (runSpecialistTool -> readTeamProject), the liveness
// rechecks (check_milo_conversation_execution) and the checkpoint advances are all
// preview-free. A signed-in owner watching a turn's live progress polls the SAME
// per-actor/owner budget through the browser continuity read and export
// (readConversation / exportConversationPage, both admitted), and that live
// viewing must not be able to starve the running turn. Every model/provider
// response here is synthetic; no provider, network or real Supabase call runs.
//
// Limitation: PGlite is single-connection, so these tests reproduce budget
// SATURATION (a full per-actor budget) and a deterministic one-shot refusal — a
// faithful proxy for a full/contended budget — but they cannot reproduce a
// genuine concurrent pg_try_advisory_xact_lock race between two live connections.

const owner = "00000000-0000-4000-8000-000000000001";
const collaborator = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
// Every preview acquisition is counted so a test can assert the executor makes
// zero acquisitions while the browser paths do call the admission gate.
let acquireCount = 0;
let failNextAcquire = false;
let responses: string[] = [];

const query = async <T = unknown>(sql: string, params: unknown[]) =>
  (await db.query<{ result: T }>(`SELECT public.${sql} result`, params)).rows[0].result;
const rpc: TeamReadRpc = async (name, params) => {
  if (name === "acquire_project_team_preview") {
    acquireCount += 1;
    if (failNextAcquire) {
      failNextAcquire = false;
      return { data: null, error: { message: "team_preview_capacity" } };
    }
  }
  const entries = Object.entries(params);
  try {
    return {
      data: await query(
        `${name}(${entries.map(([key], index) => `${key}=>$${index + 1}`).join(",")})`,
        entries.map(([, value]) => value),
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};

const unavailable = async (): Promise<never> => {
  throw new Error("must not run");
};
const workspace = (async () => ({
  data: { projects: [{ id: "p", name: "Safari" }], opportunities: [] },
})) as unknown as SpecialistToolDeps["workspace"];
const toolDeps = {
  rpc,
  workspace,
  knowledge: unavailable,
  weekly: unavailable,
  technicalRuns: unavailable,
  googleIndex: unavailable,
  performance: unavailable,
  answers: unavailable,
  logs: unavailable,
  backlinks: unavailable,
  inspectIndex: unavailable,
  performanceTest: unavailable,
  startCrawl: unavailable,
  stepCrawl: unavailable,
  generate: unavailable,
} as unknown as SpecialistToolDeps;

// The executor deps wire ONLY the preview-free entry points, exactly as the
// production executor does (milo-specialist-executor.server production deps):
// readConversationForExecution for continuity and runSpecialistTool (whose
// snapshot read is readTeamProject, not the browser-admitted reader). The model
// is synthetic and still runs the executor's real between-dispatch claim recheck.
function executorDeps(onAdvance?: (codes: string[]) => void) {
  return {
    claim: (who: string, input: never) => claimConversationTurn(who, input, rpc),
    read: (who: string, input: never) => readConversationForExecution(who, input, rpc),
    assert: (who: string, input: never, attempt: string) =>
      assertConversationExecution(who, input, attempt, rpc),
    advance: async (who: string, input: never, change: { events: Array<{ code?: string }> }) => {
      const next = await advanceConversationTurn(who, input, change as never, rpc);
      onAdvance?.(change.events.map((event) => event.code ?? ""));
      return next;
    },
    tool: (input: never, context: never) => runSpecialistTool(input, context, toolDeps),
    model: async ({ context }: { context: { beforeDispatch?: () => Promise<void> } }) => {
      await context.beforeDispatch?.();
      return responses.shift()!;
    },
  } as never;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users(id) VALUES('${owner}'),('${collaborator}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}');
    CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(jobname text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid $$;
    CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;`);
  for (const name of [
    "20260911020000_project_team_reads.sql",
    "20260913120000_milo_conversations.sql",
    "20260914120000_milo_provider_check_consent.sql",
    // Candidate-only diagnostics migration, applied here in PGlite (never the
    // production applied set) to prove the end-to-end receipt write. It also
    // schedules a daily pg_cron retention sweep, hence the cron stub above.
    "20260919160000_milo_conversation_diagnostics.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','p',$2)",
    [owner, { name: "Butelki Wodorowe — Safari", primaryLanguage: "Polish" }],
  );
  // A trusted collaborator (editor) used by the scope-refusal case, seeded through
  // the same released membership foundation the RPCs authorize against.
  await db.query(
    "INSERT INTO project_team_members(owner_id,project_id,actor_id,role,revision,active) VALUES($1,'p',$2,'editor',1,true)",
    [owner, collaborator],
  );
  // Many Unicode-Polish drafts so the real project brief and a real draft review
  // are multi-kilobyte receipts with genuine draft IDs, as in the live turn.
  for (let i = 0; i < 40; i++)
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'content',$2,$3)",
      [
        owner,
        `draft_${i}_zazolc_gesla_jazn`,
        {
          projectId: "p",
          title: `Różnica między zapisaną wersją roboczą a opublikowanym artykułem ${i} — żółć, gęś, jaźń`,
          status: "Draft",
          updatedAt: "2026-09-19",
          markdown: "## Sekcja\nZażółć gęślą jaźń.",
          metaTitle: "Tytuł",
          metaDescription: "Opis",
        },
      ],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});

// Each test starts with an empty preview budget and a clean, active collaborator
// membership, so held leases and a revocation never bleed between cases.
beforeEach(async () => {
  acquireCount = 0;
  failNextAcquire = false;
  responses = [];
  await db.exec(`RESET ROLE; TRUNCATE public.project_team_preview_limits,public.milo_conversation_diagnostics;
    UPDATE public.project_team_members SET active=true,expires_at=NULL,revision=1;`);
});

async function seedTurn(actor: string, body: string) {
  const conversationId = randomUUID();
  const turnId = randomUUID();
  await db.query(
    "INSERT INTO milo_conversations(conversation_id,actor_id,owner_id,project_id,title,turn_count) VALUES($1,$2,$3,'p','Safari',1)",
    [conversationId, actor, owner],
  );
  await db.query(
    "INSERT INTO milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,state) VALUES($1,$2,$3,1,$4,'pl',1,'pending')",
    [turnId, conversationId, actor, body],
  );
  return { conversationId, turnId };
}

describe("the live conversation executor is never bounded by the browser preview budget", () => {
  it("completes a lead-only turn with zero preview acquisitions even when a post-brief capacity refusal is armed", async () => {
    const { conversationId, turnId } = await seedTurn(
      owner,
      "Jaka jest różnica między wersją roboczą a opublikowanym artykułem?",
    );
    responses = [
      JSON.stringify({
        handoff: "Lead odpowiada na pytanie.",
        assignments: [{ role: "lead", task: "Wyjaśnij różnicę", tools: [] }],
      }),
      "Wersja robocza to nieopublikowany szkic; publikacja wymaga osobnego zapisu i zgody.",
    ];
    const target = { ownerId: owner, projectId: "p", conversationId, turnId };
    // Arm a one-shot capacity refusal on the FIRST preview acquisition after the
    // brief's tool_result — the exact live-incident moment when the owner's live
    // view begins polling. Because the executor is fully preview-free, the one-shot
    // is never triggered and no browser-shared budget can abort the running turn.
    const turn = await runConversationSpecialists(
      owner,
      target,
      executorDeps((codes) => {
        if (codes.includes("tool_result")) failNextAcquire = true;
      }),
    );
    expect(turn.state).toBe("completed");
    // Still armed and no acquisition counted => the executor took no preview lease
    // across claim, continuity read, project brief, liveness checks or advances.
    expect(failNextAcquire).toBe(true);
    expect(acquireCount).toBe(0);
    const saved = await readConversationForExecution(
      owner,
      { ownerId: owner, projectId: "p", conversationId },
      rpc,
    );
    const codes = saved.turns[0].events.map((event) => event.code ?? event.kind);
    expect(codes).toContain("analysing");
    expect(saved.turns[0].events.some((event) => event.kind === "assistant")).toBe(true);
    expect(saved.turns[0].events.some((event) => event.code === "execution_unknown")).toBe(false);
  }, 20000);

  it("completes a nontrivial tool-using turn at saturated preview capacity while browser reads and exports are denied", async () => {
    const { conversationId, turnId } = await seedTurn(
      owner,
      "Przejrzyj zapisany szkic i wyjaśnij różnicę wobec publikacji.",
    );
    // Hold the actor's whole preview budget (per-actor cap 2) before execution,
    // modelling a live browser view already consuming the actor's allocation. The
    // leases are never released within the test.
    await acquireTeamPreview(owner, owner, "p", rpc);
    await acquireTeamPreview(owner, owner, "p", rpc);
    // Browser live-view polling is hard-denied at the admission gate BEFORE its
    // storage RPC. Both the continuity read and the export share the same budget.
    const browserBefore = acquireCount;
    await expect(
      readConversation(owner, { ownerId: owner, projectId: "p", conversationId }, rpc),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    await expect(
      exportConversationPage(owner, { ownerId: owner, projectId: "p", conversationId }, rpc),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(acquireCount).toBeGreaterThan(browserBefore); // the browser path DOES call the gate

    responses = [
      JSON.stringify({
        handoff: "SEO przejmuje przegląd zapisanego szkicu.",
        assignments: [
          {
            role: "seo",
            task: "Sprawdź zapisany szkic",
            tools: [{ name: "draft_seo_review", assetId: "draft_0_zazolc_gesla_jazn" }],
          },
        ],
      }),
      "Zapisany szkic zawiera jedną sekcję H2. To przegląd tekstu, bez publikacji.",
    ];
    const target = { ownerId: owner, projectId: "p", conversationId, turnId };
    const executorBefore = acquireCount;
    const turn = await runConversationSpecialists(owner, target, executorDeps());
    // The trusted executor completed the whole tool-using turn (brief + a real
    // draft review + reply) without a single preview acquisition, so the saturated
    // budget never touched it.
    expect(acquireCount).toBe(executorBefore);
    expect(turn.state).toBe("completed");
    // Verify the saved trail through the preview-free executor read, since the
    // browser read is denied at capacity.
    const saved = await readConversationForExecution(
      owner,
      { ownerId: owner, projectId: "p", conversationId },
      rpc,
    );
    const events = saved.turns[0].events;
    expect(
      events.some((event) => event.tool === "draft_seo_review" && event.state === "completed"),
    ).toBe(true);
    expect(events.some((event) => event.kind === "assistant" && event.role === "seo")).toBe(true);
    expect(events.some((event) => event.code === "execution_unknown")).toBe(false);
  }, 20000);

  it("still stops model and tool dispatch when the collaborator's membership is revoked or expired, on the preview-free path", async () => {
    const { conversationId, turnId } = await seedTurn(
      collaborator,
      "Zaproponuj poprawki do zapisanego szkicu.",
    );
    const target = { ownerId: owner, projectId: "p", conversationId, turnId };
    const model = vi.fn(async () => "must not run");
    const tool = vi.fn(async () => {
      throw new Error("must not run");
    });
    const guarded = {
      claim: (who: string, input: never) => claimConversationTurn(who, input, rpc),
      read: (who: string, input: never) => readConversationForExecution(who, input, rpc),
      assert: (who: string, input: never, attempt: string) =>
        assertConversationExecution(who, input, attempt, rpc),
      advance: (who: string, input: never, change: never) =>
        advanceConversationTurn(who, input, change, rpc),
      tool,
      model,
    } as never;
    const before = acquireCount;
    // Revoked membership: the SQL claim/continuity gate refuses before any model or
    // tool dispatch, even though the executor path no longer touches the preview
    // budget. Removing the browser preview admission removed no authorization.
    await db.query("UPDATE project_team_members SET active=false WHERE actor_id=$1", [
      collaborator,
    ]);
    await expect(runConversationSpecialists(collaborator, target, guarded)).rejects.toThrow();
    // Expired membership is the same scope refusal; the turn stays pending.
    await db.query(
      "UPDATE project_team_members SET active=true,expires_at=now()-interval '1 hour' WHERE actor_id=$1",
      [collaborator],
    );
    await expect(runConversationSpecialists(collaborator, target, guarded)).rejects.toThrow();
    expect(model).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
    // The refused, preview-free executor path attempted no admission either.
    expect(acquireCount).toBe(before);
    const stored = await db.query<{ state: string }>(
      "SELECT state FROM milo_conversation_turns WHERE turn_id=$1",
      [turnId],
    );
    expect(stored.rows[0].state).toBe("pending");
  }, 20000);

  it("writes a service-only diagnostic receipt for a pre-brief NOWAIT refusal, correlated to the turn", async () => {
    const { conversationId, turnId } = await seedTurn(
      owner,
      "Jaka jest różnica między wersją roboczą a opublikowanym artykułem?",
    );
    const target = { ownerId: owner, projectId: "p", conversationId, turnId };
    // A NOWAIT lock refusal at the FIRST checkpoint write (the project-brief
    // tool_started advance) is the exact pre-brief boundary of the 19 Sep incident.
    // Only the first advance is refused; the catch's execution_unknown write then
    // succeeds, and the diagnostic is written through the real service-only RPC.
    let firstAdvance = true;
    const turn = await runConversationSpecialists(owner, target, {
      claim: (who: string, input: never) => claimConversationTurn(who, input, rpc),
      read: (who: string, input: never) => readConversationForExecution(who, input, rpc),
      assert: (who: string, input: never, attempt: string) =>
        assertConversationExecution(who, input, attempt, rpc),
      advance: async (who: string, input: never, change: never) => {
        if (firstAdvance) {
          firstAdvance = false;
          throw new TeamAdmissionBusyError();
        }
        return advanceConversationTurn(who, input, change, rpc);
      },
      tool: (input: never, context: never) => runSpecialistTool(input, context, toolDeps),
      model: async () => {
        throw new Error("model must not run before the brief");
      },
      diagnostic: (input: ConversationDiagnosticInput) => recordConversationDiagnostic(input, rpc),
    } as never);
    // The stored trail is the incident shape: one execution_unknown, no brief.
    expect(turn.state).toBe("unknown");
    const saved = await readConversationForExecution(
      owner,
      { ownerId: owner, projectId: "p", conversationId },
      rpc,
    );
    const events = saved.turns[0].events;
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("execution_unknown");
    expect(events.some((event) => event.tool === "project_brief")).toBe(false);
    // The receipt pinpoints WHERE (brief_start) and WHY (55P03), inspectable via a
    // plain service-role read, correlated to the turn and the brief operation id.
    const diag = await db.query<{
      turn_id: string;
      operation_id: string | null;
      stage: string;
      outcome: string;
      outcome_code: string;
      error_class: string;
      name_category: string;
      http_status: number | null;
      sql_state: string | null;
    }>("SELECT * FROM public.milo_conversation_diagnostics WHERE turn_id=$1", [turnId]);
    expect(diag.rows).toHaveLength(1);
    expect(diag.rows[0]).toMatchObject({
      turn_id: turnId,
      stage: "brief_start",
      outcome: "unknown",
      outcome_code: "execution_unknown",
      error_class: "unknown",
      name_category: "other",
      http_status: null,
      sql_state: "55P03",
    });
    expect(diag.rows[0].operation_id).toEqual(expect.any(String));
  }, 20000);

  it("writes a service-only diagnostic receipt for a claim-time NOWAIT refusal at the pre-entry unknown stage, leaving the turn untouched", async () => {
    const { conversationId, turnId } = await seedTurn(
      owner,
      "Jaka jest różnica między wersją roboczą a opublikowanym artykułem?",
    );
    const target = { ownerId: owner, projectId: "p", conversationId, turnId };
    // A NOWAIT lock refusal on the durable claim ITSELF is the pre-entry boundary: it
    // happens before any execution stage, so claim ownership and the turn's
    // authoritative state stay UNCONFIRMED. The claim-time diagnostic still records a
    // real service-only receipt through the same RPC at the `unknown` stage, then the
    // original error is re-thrown — no outcome is advanced and nothing is dispatched.
    const advance = vi.fn();
    const model = vi.fn(async () => {
      throw new Error("model must not run on a claim-time fault");
    });
    const tool = vi.fn(async () => {
      throw new Error("tool must not run on a claim-time fault");
    });
    await expect(
      runConversationSpecialists(owner, target, {
        claim: async () => {
          throw new TeamAdmissionBusyError();
        },
        read: (who: string, input: never) => readConversationForExecution(who, input, rpc),
        assert: (who: string, input: never, attempt: string) =>
          assertConversationExecution(who, input, attempt, rpc),
        advance,
        tool,
        model,
        diagnostic: (input: ConversationDiagnosticInput) =>
          recordConversationDiagnostic(input, rpc),
      } as never),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    // Ownership was never confirmed: no outcome advance and no dispatch.
    expect(advance).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
    // The turn is untouched — still pending with no stored events.
    const turnRow = await db.query<{ state: string }>(
      "SELECT state FROM milo_conversation_turns WHERE turn_id=$1",
      [turnId],
    );
    expect(turnRow.rows[0].state).toBe("pending");
    // A real receipt pinpoints the pre-entry stage (`unknown`) and the 55P03 class,
    // correlated to the turn with a NULL operation id (no stage/operation was entered).
    const diag = await db.query<{
      turn_id: string;
      operation_id: string | null;
      stage: string;
      outcome: string;
      outcome_code: string;
      error_class: string;
      name_category: string;
      http_status: number | null;
      sql_state: string | null;
    }>("SELECT * FROM public.milo_conversation_diagnostics WHERE turn_id=$1", [turnId]);
    expect(diag.rows).toHaveLength(1);
    expect(diag.rows[0]).toMatchObject({
      turn_id: turnId,
      operation_id: null,
      stage: "unknown",
      outcome: "unknown",
      outcome_code: "execution_unknown",
      error_class: "unknown",
      name_category: "other",
      http_status: null,
      sql_state: "55P03",
    });
  }, 20000);
});
