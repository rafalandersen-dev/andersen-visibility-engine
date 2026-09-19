import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
/** Applies every unapplied candidate migration in production (filename) order on top of
 * the released chain and asserts the grant matrix of each function a candidate creates
 * or recreates. A recreated function starts with EXECUTE for PUBLIC, so this guards the
 * REVOKE/GRANT that must follow every DROP/CREATE (local security review, 14 September). */
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
// Reviewed and applied to production on 19 September (alongside the eight
// released conversation migrations below). They sort after the cutoff, so they are
// enumerated explicitly and subtracted from the unapplied set — an unexpected
// future migration is never silently folded into either group.
const releasedAfterCutoff = [
  "20260919120000_ai_expense_default_budgets.sql",
  "20260919130000_manual_free_ai_budgets.sql",
];
const releasedConversationPacket = [
  "20260912040000_knowledge_review_batch_time.sql",
  "20260913120000_milo_conversations.sql",
  "20260913160000_milo_conversation_dispatch.sql",
  "20260913180000_milo_draft_proposals.sql",
  "20260913200000_milo_conversation_lifecycle.sql",
  "20260914090000_milo_account_conversations.sql",
  "20260914120000_milo_provider_check_consent.sql",
  "20260914150000_project_team_seats.sql",
];
const candidates = ["20260919160000_milo_conversation_diagnostics.sql"];
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
  // two released expense overloads (19 September), then the unapplied candidates
  // on top. Released expense SQL is executed verbatim, not restated here.
  for (const file of [
    ...expensePrerequisites,
    ...released,
    ...releasedAfterCutoff,
    ...releasedConversationPacket,
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
    // The two 19 September expense migrations also sort after the cutoff but are
    // already released; subtract exactly those known suffixes. Any other file
    // after the cutoff stays in `unapplied` and fails below, so a future
    // migration is surfaced rather than silently treated as released.
    expect(files.filter((file) => releasedAfterCutoff.includes(file))).toEqual(releasedAfterCutoff);
    const unapplied = files.filter(
      (file) => ![...releasedAfterCutoff, ...releasedConversationPacket].includes(file),
    );
    expect(unapplied).toEqual(candidates);
  });
  it.each([
    "record_milo_conversation_diagnostic(uuid,uuid,text,text,text,text,text,integer,text)",
    "prune_milo_conversation_diagnostics(timestamptz,integer)",
    "list_my_milo_conversations(uuid,timestamptz,uuid)",
    "begin_milo_conversation_turn(uuid,uuid,text,uuid,uuid,text,text,boolean,boolean)",
    "export_milo_conversation_page(uuid,uuid,text,uuid,integer,text)",
    "erase_milo_conversation(uuid,uuid,text,uuid)",
    "count_project_team_seats(uuid,text)",
    "create_project_team_invitation(uuid,uuid,text,uuid,text,text,integer,integer)",
    "change_project_team_member(uuid,uuid,text,uuid,bigint,text,boolean,integer,integer)",
  ])("%s is executable by service_role only", async (fn) => {
    expect(await allowed("service_role", fn)).toBe(true);
    for (const role of ["anon", "authenticated", "public"])
      expect(await allowed(role, fn)).toBe(false);
  });
  it.each([
    "milo_conversation_turn_view(public.milo_conversation_turns)",
    "assert_milo_conversation_access(uuid,uuid,text)",
    "assert_project_team_seat(uuid,text,text,text,integer,integer)",
  ])("%s is reachable only from definer functions", async (fn) => {
    for (const role of ["anon", "authenticated", "service_role", "public"])
      expect(await allowed(role, fn)).toBe(false);
  });
  it("leaves one overload of every dropped-and-recreated function", async () => {
    for (const name of [
      "begin_milo_conversation_turn",
      "create_project_team_invitation",
      "change_project_team_member",
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
      "milo_conversations",
      "milo_conversation_turns",
      "milo_draft_proposals",
      "milo_erased_conversations",
      "milo_erased_turns",
      "milo_conversation_dispatch_control",
      "milo_conversation_dispatch_attempts",
      "project_team_members",
      "project_team_invitations",
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
