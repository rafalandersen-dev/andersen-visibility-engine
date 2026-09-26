import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
/** Applies every unapplied candidate migration in production (filename) order on top of
 * the released chain and asserts the grant matrix of each function a candidate creates
 * or recreates, plus the RLS/closed-table state of the stores it adds. A recreated function
 * starts with EXECUTE for PUBLIC, so this guards the REVOKE/GRANT that must follow every
 * DROP/CREATE (local security review, 14 September). The sole unapplied candidate is the P3
 * citation candidate 20260920200000; it is applied here on top of its REAL released
 * prerequisites (project knowledge, publication approval/evidence, answer evidence, native
 * artifacts, project team reads/policy) so its migration actually executes and its
 * service-only RPCs, internal-helper REVOKEs and closed stores are genuinely tested. There is
 * no P2 citation panel candidate in this worktree (a separate open author owns it). */
let db: PGlite;
const released = [
  "20260907150000_operational_notifications.sql",
  "20260907170000_operational_email_outbox.sql",
  "20260909200000_project_knowledge.sql",
  "20260910210000_answer_evidence.sql",
  "20260910100000_source_refresh.sql",
  "20260911000000_output_knowledge_integrity.sql",
  "20260911010000_output_knowledge_reviews.sql",
  "20260911020000_project_team_reads.sql",
  "20260911030000_project_team_membership.sql",
  "20260911040000_project_team_comments.sql",
  "20260910170000_publication_approval.sql",
  // Released prerequisites the UNAPPLIED P3 citation candidate binds to: the publication attempt/evidence
  // store and the owner-supplied answer evidence + prompts. Reused verbatim (the focused citation suites use
  // the same real migrations), never invented substitutes; both predate the candidate cutoff.
  "20260910200000_publication_evidence.sql",
  "20260911050000_project_team_edits.sql",
  "20260911060000_project_team_approval_policy.sql",
  "20260911070000_project_team_review_context.sql",
  "20260911080000_project_team_notification_recipients.sql",
  "20260911090000_project_team_notification_outbox.sql",
  "20260911100000_project_team_invitation_delivery.sql",
];
// The internal AI expense ledger the two 19 September migrations extend. These
// predate the candidate cutoff and are part of the released chain; they are
// listed here only so the combined-chain fixture builds the real dependency
// order (budgets/requests, then permits) before the released expense overloads.
const expensePrerequisites = [
  "20260907140000_ai_expense_reservations.sql",
  "20260908210000_restricted_ai_expense_permits.sql",
];
// Reviewed and applied to production on 19 September before the conversation packet. They sort after the cutoff, so they are
// enumerated explicitly and subtracted from the unapplied set — an unexpected
// future migration is never silently folded into either group.
const releasedAfterCutoff = [
  "20260919120000_ai_expense_default_budgets.sql",
  "20260919130000_manual_free_ai_budgets.sql",
];
// Applied together in PR136 on 19 September; retained as real fixture prerequisites.
const releasedConversationPacket = [
  "20260912040000_knowledge_review_batch_time.sql",
  "20260913120000_milo_conversations.sql",
  "20260913160000_milo_conversation_dispatch.sql",
  "20260913180000_milo_draft_proposals.sql",
  "20260913200000_milo_conversation_lifecycle.sql",
  "20260914090000_milo_account_conversations.sql",
  "20260914120000_milo_provider_check_consent.sql",
  "20260914150000_project_team_seats.sql",
  // Reviewed and applied diagnostics and artifact staging.
  "20260919160000_milo_conversation_diagnostics.sql",
  "20260919165000_native_report_artifacts.sql",
  // PR148 applied and verified on 20 September.
  "20260920180000_milo_conversation_checkpoint_lock_wait.sql",
];
// PR146 applied and verified on 21 September; immutable released prerequisite for P3.
const releasedCitationProtocol = ["20260920190000_citation_protocol.sql"];
// P3 is the only unapplied migration after integrating the released protocol.
// P3 is applied in production (20260920200000, immutable); it is listed here because its file sorts after the
// cutoff, exactly like the released packets above. The sole UNAPPLIED candidate is the additive owner-authoring
// scope-binding/version migration (26 September 2026).
const candidates = [
  "20260920200000_citation_findings_improvements.sql",
  "20260926190000_citation_scope_binding_versions.sql",
];
const allowed = async (role: string, fn: string) =>
  (
    await db.query<{ allowed: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') allowed", [
      role,
      fn,
    ])
  ).rows[0].allowed;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE auth.identities(user_id uuid,identity_data jsonb);
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.scheduled_publishes(user_id uuid,project_id text,asset_id text,status text,updated_at timestamptz);
    CREATE TABLE public.ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb);
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,collection,entity_id));
    CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
    CREATE SCHEMA net;
    CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,timeout_ms integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
    RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE request_id bigint; BEGIN
      INSERT INTO net.requests(url,body,timeout_ms) VALUES(url,body,timeout_milliseconds) RETURNING id INTO request_id; RETURN request_id;
    END; $$;
    CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(jobname text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid $$;
    CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;`);
  // Real production apply order: expense base + permits, the released chain, the
  // released expense overloads and conversation packet (19 September), then new candidates
  // on top. Released expense SQL is executed verbatim, not restated here.
  for (const file of [
    ...expensePrerequisites,
    ...released,
    ...releasedAfterCutoff,
    ...releasedConversationPacket,
    ...releasedCitationProtocol,
    ...candidates,
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe("candidate migration chain", () => {
  it("lists exactly the candidates that follow the newest applied migration", () => {
    const files = readdirSync("supabase/migrations")
      .filter((file) => file.slice(0, 14) > "20260912030000" && file.endsWith(".sql"))
      .sort();
    // The 19 September expense and conversation packets sort after the cutoff but
    // are already released; subtract exactly their known suffixes. Any other file
    // after the cutoff stays in `unapplied` and fails below, so a future
    // migration is surfaced rather than silently treated as released.
    const applied = [
      ...releasedAfterCutoff,
      ...releasedConversationPacket,
      ...releasedCitationProtocol,
    ].sort();
    expect(files.filter((file) => applied.includes(file))).toEqual(applied);
    const unapplied = files.filter((file) => !applied.includes(file));
    expect(unapplied).toEqual(candidates);
  });
  it.each([
    "read_citation_protocol(uuid,text)",
    "save_citation_panel_draft(uuid,text,uuid,integer,jsonb)",
    "lock_citation_panel(uuid,text,uuid,integer)",
    "approve_citation_brand_run(uuid,text,uuid,uuid,integer,integer,integer)",
    "save_citation_capture(uuid,text,jsonb)",
    "record_milo_conversation_diagnostic(uuid,uuid,text,text,text,text,text,integer,text,text)",
    "prune_milo_conversation_diagnostics(timestamptz,integer)",
    "save_ai_native_report_artifact(uuid,text,jsonb,text)",
    "read_ai_native_report_artifacts(uuid,text)",
    "read_ai_native_report_artifact(uuid,text,uuid)",
    "remove_ai_native_report_artifact(uuid,text,uuid)",
    "list_my_milo_conversations(uuid,timestamptz,uuid)",
    "begin_milo_conversation_turn(uuid,uuid,text,uuid,uuid,text,text,boolean,boolean)",
    "export_milo_conversation_page(uuid,uuid,text,uuid,integer,text)",
    "erase_milo_conversation(uuid,uuid,text,uuid)",
    "count_project_team_seats(uuid,text)",
    "create_project_team_invitation(uuid,uuid,text,uuid,text,text,integer,integer)",
    "change_project_team_member(uuid,uuid,text,uuid,bigint,text,boolean,integer,integer)",
    // Redefined by the applied 20260920180000 migration (CREATE OR REPLACE keeps service_role-only).
    "claim_milo_conversation_turn(uuid,uuid,text,uuid,uuid)",
    "advance_milo_conversation_turn(uuid,uuid,text,uuid,uuid,uuid,integer,jsonb,text)",
    "check_milo_conversation_execution(uuid,uuid,text,uuid,uuid,uuid)",
    // P3 UNAPPLIED citation candidate 20260920200000 service RPCs: REVOKEd from PUBLIC/anon/authenticated,
    // GRANTed to service_role only (the middleware supplies the authenticated actor). Findings/improvements:
    "save_ai_citation_finding(uuid,text,jsonb,jsonb)",
    "read_ai_citation_findings(uuid,text)",
    "read_ai_citation_finding(uuid,text,uuid)",
    "remove_ai_citation_finding(uuid,text,uuid)",
    "save_ai_citation_improvement(uuid,text,jsonb,jsonb,jsonb)",
    "read_ai_citation_improvements(uuid,text)",
    "read_ai_citation_improvement(uuid,text,uuid)",
    "remove_ai_citation_improvement(uuid,text,uuid)",
    // Dated business facts + the finding accuracy read:
    "save_ai_citation_business_fact(uuid,text,jsonb)",
    "read_ai_citation_business_facts(uuid,text)",
    "read_ai_citation_business_fact(uuid,text,uuid)",
    "remove_ai_citation_business_fact(uuid,text,uuid)",
    "read_ai_citation_finding_accuracy(uuid,text,uuid)",
    // Independent (two-person) review — actor is the authenticated caller, owner/project/finding supplied:
    "save_ai_citation_finding_review(uuid,uuid,text,uuid,text,text,text)",
    "remove_ai_citation_finding_review(uuid,uuid,text,uuid)",
    "read_ai_citation_finding_reviews(uuid,uuid,text,uuid)",
    "read_ai_citation_finding_for_review(uuid,uuid,text,uuid)",
    // Owner-only finding-scoped evidence-review assignment grant/revoke (finding 4062796988): p_owner is the
    // authenticated owner supplied by the middleware; client-initiated, so GRANTed to service_role only.
    "grant_ai_citation_review_assignment(uuid,text,uuid,uuid)",
    "revoke_ai_citation_review_assignment(uuid,text,uuid,uuid)",
    // Additive owner-authoring candidate 20260926190000: expected-version save wrappers + provenance reads
    // (service RPCs, service_role only, like their v1 counterparts which keep their grants for rollout).
    "save_ai_citation_finding_v2(uuid,text,jsonb,jsonb,integer,uuid)",
    "save_ai_citation_improvement_v2(uuid,text,jsonb,jsonb,jsonb)",
    "save_ai_citation_business_fact_v2(uuid,text,jsonb,integer,uuid)",
    "read_ai_citation_findings_v2(uuid,text)",
    "read_ai_citation_finding_v2(uuid,text,uuid)",
    "read_ai_citation_improvements_v2(uuid,text)",
    "read_ai_citation_improvement_v2(uuid,text,uuid)",
    "read_ai_citation_finding_for_review_v2(uuid,uuid,text,uuid)",
  ])("%s is executable by service_role only", async (fn) => {
    expect(await allowed("service_role", fn)).toBe(true);
    for (const role of ["anon", "authenticated", "public"])
      expect(await allowed(role, fn)).toBe(false);
  });
  it.each([
    "native_artifact_utf16_length(text)",
    "tombstone_citation_capture()",
    "milo_conversation_turn_view(public.milo_conversation_turns)",
    "assert_milo_conversation_access(uuid,uuid,text)",
    "assert_project_team_seat(uuid,text,text,text,integer,integer)",
    // Internal helper added by the applied 20260920180000 migration: the executor-only bounded
    // access assert, granted to no role and reachable only from the definer RPCs.
    "assert_milo_conversation_execution(uuid,uuid,text)",
    // P3 UNAPPLIED citation candidate 20260920200000 internal helpers: SECURITY DEFINER, REVOKEd from
    // PUBLIC/anon/authenticated/service_role, reached only from the P3 service RPCs (never client-callable).
    "citation_lock_account(uuid)",
    "citation_finding_sources_available(uuid,text,jsonb)",
    "citation_finding_head_id(uuid,text,uuid,uuid,integer,text,text)",
    "citation_finding_inspectable(uuid,text,jsonb)",
    "citation_finding_accuracy(uuid,text,jsonb)",
    "citation_finding_accuracy_status(uuid,text,jsonb)",
    "citation_accuracy_resolve(uuid,text,jsonb,jsonb)",
    "citation_improvement_evidence(uuid,text,jsonb)",
    "citation_improvement_status(uuid,text,jsonb,uuid[],jsonb)",
    "citation_review_authorized(uuid,uuid,text)",
    // Finding-scoped assignment check (finding 4062796988): reached only from the reviewer save/list/read RPCs
    // to gate private evidence in ADDITION to team eligibility. REVOKEd from every role (never client-callable).
    "citation_review_assigned(uuid,text,uuid,uuid)",
    "citation_finding_review_status(uuid,text,uuid)",
    "citation_finding_review_digest_masked(uuid,text,uuid)",
    // Selected-knowledge validity predicate (finding 4060770032): the evidence-inspection subset of the canonical
    // knowledge selector, called only from the inspectable/read definer functions. REVOKEd from every role.
    "citation_knowledge_selectable(jsonb,jsonb,timestamptz)",
    // Forget-cascade objects added by this candidate: the shared passage redactor plus the two trigger
    // functions fired by AFTER DELETE on the released project_knowledge_sources / project_knowledge_records.
    // All REVOKEd from every role — reached only from their triggers.
    "citation_forget_redact_source(uuid,text,uuid)",
    "citation_forget_source_passages()",
    "citation_forget_record_passages()",
    // Answer-forget objects (P2): the pure answer-field redactor, the answer-delete redactor, and the trigger
    // function fired by AFTER DELETE on the released ai_answer_evidence. All REVOKEd from every role.
    "citation_redact_answer_fields(jsonb)",
    "citation_forget_redact_answer(uuid,text,uuid)",
    "citation_forget_answer_passages()",
    // Native-artifact-forget objects (finding 4061786099): the native-delete redactor and the trigger function
    // fired by AFTER DELETE on the released ai_native_report_artifacts. Both REVOKEd from every role.
    "citation_forget_redact_native(uuid,text,uuid)",
    "citation_forget_native_records()",
    // Fact-delete erasure objects: the fact-reference matcher (row-pin OR logical id+version, finding 4061340380),
    // the fact redactor and the trigger function fired by AFTER DELETE on ai_citation_business_facts. All REVOKEd
    // from every role — the matcher is reached only from the redactor/save guard, the redactor only from the trigger.
    "citation_fact_ref_matches(jsonb,uuid,uuid,integer)",
    "citation_forget_redact_fact(uuid,text,uuid,uuid,integer)",
    "citation_forget_fact_records()",
    // Additive 20260926190000: the locked-panel scope predicate and the BEFORE INSERT enforcement trigger
    // function on ai_citation_findings / ai_citation_improvements. Reached only from the trigger / definers.
    "citation_panel_scope_authenticated(uuid,text,uuid,integer,text,text)",
    "citation_scope_binding_enforce()",
  ])("%s is reachable only from definer functions", async (fn) => {
    for (const role of ["anon", "authenticated", "service_role", "public"])
      expect(await allowed(role, fn)).toBe(false);
  });
  it("leaves one overload of every dropped-and-recreated function", async () => {
    for (const name of [
      "begin_milo_conversation_turn",
      "create_project_team_invitation",
      "change_project_team_member",
      // The applied 20260920180000 migration CREATE OR REPLACEs these with identical signatures — it
      // must not fork a second overload (a signature typo would leave the old NOWAIT body
      // live alongside the new one).
      "claim_milo_conversation_turn",
      "advance_milo_conversation_turn",
      "check_milo_conversation_execution",
      "assert_milo_conversation_execution",
    ]) {
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*)::text n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname=$1",
        [name],
      );
      expect(rows[0].n, name).toBe("1");
    }
  });
  it("pins search_path on every security definer function in public", async () => {
    const { rows } = await db.query<{ proname: string }>(
      "SELECT proname FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.prosecdef AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%') ORDER BY proname",
    );
    expect(rows.map((row) => row.proname)).toEqual([]);
  });
  it("keeps conversation, proposal, erasure and dispatch tables closed to every role", async () => {
    for (const table of [
      "ai_native_report_artifacts",
      "milo_conversations",
      "milo_conversation_turns",
      "milo_draft_proposals",
      "milo_erased_conversations",
      "milo_erased_turns",
      "milo_conversation_dispatch_control",
      "citation_panels",
      "citation_brand_runs",
      "milo_conversation_dispatch_attempts",
      "project_team_members",
      "project_team_invitations",
      // P3 UNAPPLIED citation candidate 20260920200000 stores: RLS enabled, no policies, REVOKEd from every
      // client role (service_role reaches them only via the SECURITY DEFINER RPCs above).
      "ai_citation_findings",
      "ai_citation_improvements",
      "ai_citation_finding_reviews",
      "ai_citation_business_facts",
      // Content-free source-level erasure provenance for the forget cascade (ids + timestamp only).
      "ai_citation_source_erasures",
      // Content-free answer-level erasure provenance (P2 answer-delete propagation; ids + timestamp only).
      "ai_citation_answer_erasures",
      // Content-free logical-finding dissent tombstone (a dissent survives a version/head delete; ids + timestamp).
      "ai_citation_finding_dissent_tombstones",
      // Content-free fact-level erasure provenance (fact-delete propagation; ids + timestamp only).
      "ai_citation_fact_erasures",
      // Content-free native-artifact erasure provenance (native-delete propagation; ids + timestamp, no bytes/sha).
      "ai_citation_native_erasures",
      // Content-free finding-scoped evidence-review assignment (finding 4062796988): owner/project/row/reviewer
      // identities + active/revoked flag only — no evidence, hash or note; finding FK ON DELETE CASCADE.
      "ai_citation_review_assignments",
    ]) {
      const { rows } = await db.query<{ rls: boolean; policies: string }>(
        "SELECT c.relrowsecurity rls,(SELECT count(*)::text FROM pg_policy WHERE polrelid=c.oid) policies FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relname=$1",
        [table],
      );
      expect(rows[0].rls, table).toBe(true);
      expect(rows[0].policies, table).toBe("0");
      for (const role of ["anon", "authenticated", "service_role"])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",
              [role, `public.${table}`],
            )
          ).rows[0].allowed,
          `${role} ${table}`,
        ).toBe(false);
    }
  });
});
