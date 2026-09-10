import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  hash = "a".repeat(64);
const reserve = (
  draft = "a",
  recipient = "editor@example.com",
  step = "initial",
  limit = 5,
  rev = 1,
) =>
  db.query("SELECT reserve_outreach_delivery($1,'p',$2,$3,$4,$5,$6,$7,2)", [
    user,
    draft,
    step,
    rev,
    hash,
    recipient,
    limit,
  ]);
const dispatch = (draft = "a", rev = 1) =>
  db.query<{ ok: boolean }>("SELECT dispatch_outreach_delivery($1,$2,'initial',$3,$4) ok", [
    user,
    draft,
    hash,
    rev,
  ]);
const finish = (state = "accepted", message: string | null = "message-1") =>
  db.query("SELECT finish_outreach_delivery($1,'a','initial',$2,$3,$4)", [
    user,
    hash,
    state,
    message,
  ]);
const read = async () =>
  (
    await db.query<{ value: Record<string, unknown>[] }>(
      "SELECT read_outreach_deliveries($1,'p') value",
      [user],
    )
  ).rows[0].value;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}',PRIMARY KEY(user_id,collection,entity_id));CREATE TABLE suppressed_emails(email text);CREATE TABLE email_unsubscribe_tokens(email text,used_at timestamptz);CREATE TABLE email_send_log(template_name text,recipient_email text,status text,metadata jsonb,created_at timestamptz DEFAULT now());",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  await db.exec(
    readFileSync("supabase/migrations/20260910230000_outreach_delivery_integrity.sql", "utf8"),
  );
}, 120000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE;TRUNCATE outreach_delivery_receipts,workspace_entities,suppressed_emails,email_unsubscribe_tokens,email_send_log;UPDATE workspace_meta SET rev=1;",
  );
  await db.query("INSERT INTO workspace_entities VALUES($1,'projects','p','{}')", [user]);
  for (const id of ["a", "b", "c"])
    await db.query(
      'INSERT INTO workspace_entities VALUES($1,\'outreachDrafts\',$2,\'{"projectId":"p","status":"Approved"}\')',
      [user, id],
    );
  await db.exec(
    "INSERT INTO email_unsubscribe_tokens VALUES('editor@example.com',NULL),('other@example.com',NULL)",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("durable once-only outreach admission", () => {
  it("reserves before I/O and refuses replay after any elapsed time or editable draft deletion", async () => {
    await reserve();
    expect((await read())[0].state).toBe("reserved");
    await db.exec(
      "UPDATE outreach_delivery_receipts SET reserved_at=now()-interval '60 days';DELETE FROM workspace_entities WHERE collection='outreachDrafts';",
    );
    await db.query(
      'INSERT INTO workspace_entities VALUES($1,\'outreachDrafts\',\'a\',\'{"projectId":"p","status":"Approved"}\')',
      [user],
    );
    await expect(reserve()).rejects.toThrow("outreach_step_reserved");
  });
  it("serially admits distinct drafts against the shared limit and cooldown", async () => {
    await reserve("a", "editor@example.com", "initial", 1);
    await expect(reserve("b", "other@example.com", "initial", 1)).rejects.toThrow(
      "outreach_daily_limit_reached",
    );
    await expect(reserve("b")).rejects.toThrow("outreach_recipient_cooldown");
    expect(await dispatch()).toMatchObject({ rows: [{ ok: true }] });
    await finish("unknown", null);
    await db.exec("UPDATE outreach_delivery_receipts SET reserved_at=now()-interval '60 days'");
    await expect(reserve("b", "other@example.com", "initial", 1)).rejects.toThrow(
      "outreach_daily_limit_reached",
    );
    await expect(reserve("b")).rejects.toThrow("outreach_recipient_cooldown");
  });
  it("checks the exact revision on reservation and final dispatch", async () => {
    await expect(reserve("a", "editor@example.com", "initial", 5, 0)).rejects.toThrow(
      "outreach_workspace_changed",
    );
    await reserve();
    await db.exec("UPDATE workspace_meta SET rev=2");
    expect((await dispatch()).rows[0].ok).toBe(false);
    expect((await read())[0].state).toBe("blocked");
    await expect(reserve("a", "editor@example.com", "initial", 5, 2)).rejects.toThrow(
      "outreach_step_reserved",
    );
  });
  it("rechecks suppression and used unsubscribe tokens immediately before dispatch", async () => {
    await reserve();
    await db.exec("INSERT INTO suppressed_emails VALUES('editor@example.com')");
    expect((await dispatch()).rows[0].ok).toBe(false);
    await reserve("b", "other@example.com");
    await db.exec(
      "UPDATE email_unsubscribe_tokens SET used_at=now() WHERE email='other@example.com'",
    );
    expect((await dispatch("b")).rows[0].ok).toBe(false);
  });
  it("authorizes dispatch once and accepts a receipt only from a dispatched attempt", async () => {
    await reserve();
    await finish();
    expect((await read())[0].state).toBe("reserved");
    expect((await dispatch()).rows[0].ok).toBe(true);
    expect((await dispatch()).rows[0].ok).toBe(false);
    await expect(finish("accepted", "private unsafe receipt")).rejects.toThrow(
      "outreach_invalid_receipt",
    );
    await finish();
    await finish("unknown", null);
    expect((await read())[0].state).toBe("accepted");
    await expect(reserve()).rejects.toThrow("outreach_step_reserved");
  });
  it("requires service acceptance for the unchanged recipient before a due follow-up", async () => {
    await db.exec(
      "UPDATE workspace_entities SET data=jsonb_set(data,'{status}','\"Sent\"') WHERE entity_id='a'",
    );
    await expect(reserve("a", "editor@example.com", "followup-0")).rejects.toThrow(
      "outreach_initial_not_sent",
    );
    await db.exec(
      "UPDATE workspace_entities SET data=jsonb_set(data,'{status}','\"Approved\"') WHERE entity_id='a'",
    );
    await reserve();
    await dispatch();
    await finish();
    await db.exec(
      "UPDATE workspace_entities SET data=jsonb_set(data,'{status}','\"Sent\"') WHERE entity_id='a'",
    );
    await expect(reserve("a", "editor@example.com", "followup-0")).rejects.toThrow(
      "outreach_followup_not_due",
    );
    await db.exec("UPDATE outreach_delivery_receipts SET updated_at=now()-interval '4 days'");
    await expect(reserve("a", "other@example.com", "followup-0")).rejects.toThrow(
      "outreach_initial_not_sent",
    );
    await reserve("a", "editor@example.com", "followup-0");
    await expect(reserve("a", "editor@example.com", "followup-1")).rejects.toThrow(
      "outreach_recipient_cooldown",
    );
  });
  it("keeps historical logged attempts held without trusting browser history", async () => {
    await db.query(
      "INSERT INTO email_send_log VALUES('outreach','editor@example.com','failed',$1,now()-interval '90 days')",
      [JSON.stringify({ user_id: user, draft_id: "a", step: "initial" })],
    );
    await expect(reserve()).rejects.toThrow("outreach_legacy_attempt_held");
    await expect(reserve("b")).rejects.toThrow("outreach_legacy_attempt_held");
  });
  it("bounds retained records and limits history to the selected owner/project", async () => {
    await expect(db.query("SELECT read_outreach_deliveries($1,'p')", [other])).rejects.toThrow(
      "outreach_project_unavailable",
    );
    await db.query(
      "INSERT INTO outreach_delivery_receipts(user_id,draft_id,project_id,step,version_hash,recipient,state) SELECT $1,'past-'||g,'p','initial',$2,'past@example.com','blocked' FROM generate_series(1,3000)g",
      [user, hash],
    );
    expect((await read()).length).toBe(3000);
    await expect(reserve()).rejects.toThrow("outreach_history_capacity");
  });
  it("denies direct reads and writes to every application role, browser RPC execution, and foreign scope", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.exec("SELECT * FROM outreach_delivery_receipts")).rejects.toThrow(
        "permission denied",
      );
      await expect(db.exec("DELETE FROM outreach_delivery_receipts")).rejects.toThrow(
        "permission denied",
      );
      if (role !== "service_role") await expect(reserve()).rejects.toThrow("permission denied");
      else {
        await reserve();
        expect((await read()).length).toBe(1);
      }
      await db.exec("RESET ROLE");
    }
  });
});
