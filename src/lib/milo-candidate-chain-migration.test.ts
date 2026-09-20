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
  "20260910210000_answer_evidence.sql",
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
];
// Applied to production on 20 September (the conversation checkpoint lock-wait), AFTER the conversation
// packet and BEFORE the still-unapplied P3 citation candidate. Enumerated as an applied migration and
// subtracted from the unapplied set, so it is never mistaken for a pending candidate.
const releasedCheckpoint = ["20260920180000_milo_conversation_checkpoint_lock_wait.sql"];
// The only UNAPPLIED candidate in this worktree: P3 citation findings/improvements/facts/review. It applies
// on top of the full released chain (its real released prerequisites are enumerated above). There is NO P2
// citation panel candidate here yet (PR146 is a separate, still-open author); it is deliberately absent
// rather than cherry-picked or duplicated.
const candidates = ["20260920200000_citation_findings_improvements.sql"];
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
    ...releasedCheckpoint,
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
      ...releasedCheckpoint,
    ].sort();
    expect(files.filter((file) => applied.includes(file))).toEqual(applied);
    const unapplied = files.filter((file) => !applied.includes(file));
    expect(unapplied).toEqual(candidates);
  });
  it.each([
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
  ])("%s is executable by service_role only", async (fn) => {
    expect(await allowed("service_role", fn)).toBe(true);
    for (const role of ["anon", "authenticated", "public"])
      expect(await allowed(role, fn)).toBe(false);
  });
  it.each([
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
    "citation_finding_review_status(uuid,text,uuid)",
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
      "milo_conversation_dispatch_attempts",
      "project_team_members",
      "project_team_invitations",
      // P3 UNAPPLIED citation candidate 20260920200000 stores: RLS enabled, no policies, REVOKEd from every
      // client role (service_role reaches them only via the SECURITY DEFINER RPCs above).
      "ai_citation_findings",
      "ai_citation_improvements",
      "ai_citation_finding_reviews",
      "ai_citation_business_facts",
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
