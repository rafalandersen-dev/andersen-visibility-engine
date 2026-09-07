import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
const user = "00000000-0000-4000-8000-000000000031",
  other = "00000000-0000-4000-8000-000000000032";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_entities VALUES($1,'projects','p'),($2,'projects','p')", [
    user,
    other,
  ]);
  await db.exec(
    readFileSync("supabase/migrations/20260907190000_auto_scheduler_leases.sql", "utf8"),
  );
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE; TRUNCATE auto_scheduler_leases;");
});
afterAll(async () => {
  await db?.close();
});
const claim = async (who = user) =>
  (
    await db.query<{ token: string | null }>(
      "SELECT claim_auto_scheduler_lease($1,'p','2026-10') AS token",
      [who],
    )
  ).rows[0].token;
const release = async (token: string, who = user) =>
  (
    await db.query<{ ok: boolean }>("SELECT release_auto_scheduler_lease($1,'p',$2) AS ok", [
      who,
      token,
    ])
  ).rows[0].ok;
const check = async (token: string) =>
  (
    await db.query<{ ok: boolean }>("SELECT check_auto_scheduler_lease($1,'p',$2) AS ok", [
      user,
      token,
    ])
  ).rows[0].ok;
describe("durable scheduler project ownership", () => {
  it("admits one owner and denies duplicate project starts", async () => {
    const token = await claim();
    expect(token).toBeTruthy();
    expect(await claim()).toBeNull();
    expect(await check(token!)).toBe(true);
  });
  it("allows independent accounts with the same project identifier", async () => {
    expect(await claim()).toBeTruthy();
    expect(await claim(other)).toBeTruthy();
  });
  it("only lets the correct owner release and renew the lease", async () => {
    const token = (await claim())!;
    expect(await release(token, other)).toBe(false);
    expect(await release(other)).toBe(false);
    expect(await release(token)).toBe(true);
    const next = (await claim())!;
    expect(next).not.toBe(token);
    expect(await release(token)).toBe(false);
    expect(await check(next)).toBe(true);
  });
  it("does not grant an automatic takeover after expiry", async () => {
    const token = (await claim())!;
    await db.exec("UPDATE auto_scheduler_leases SET lease_until=now()-interval '1 minute'");
    expect(await check(token)).toBe(false);
    expect(await claim()).toBeNull();
    expect((await db.query("SELECT status FROM auto_scheduler_leases")).rows).toEqual([
      { status: "unknown" },
    ]);
    expect(await claim()).toBeNull();
  });
  it("allows a late original process to confirm completed work without a competing owner", async () => {
    const token = (await claim())!;
    await db.exec("UPDATE auto_scheduler_leases SET lease_until=now()-interval '1 minute'");
    await claim();
    expect(await release(token)).toBe(true);
    expect(await claim()).toBeTruthy();
  });
  it("does not expose ownership tokens or mutation RPCs to clients", async () => {
    await claim();
    await db.exec("SET ROLE authenticated");
    await expect(db.exec("SELECT * FROM auto_scheduler_leases")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("SELECT claim_auto_scheduler_lease($1,'p','2026-10')", [user]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE;SET ROLE anon");
    await expect(
      db.query("SELECT claim_auto_scheduler_lease($1,'p','2026-10')", [user]),
    ).rejects.toThrow(/permission denied/);
  });
  it("rejects leases for a project belonging only to another account", async () => {
    await db.query("INSERT INTO workspace_entities VALUES($1,'projects','other-only')", [other]);
    await expect(
      db.query("SELECT claim_auto_scheduler_lease($1,'other-only','2026-10')", [user]),
    ).rejects.toThrow(/foreign key/);
  });
});
const mocked = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocked.rpc } }));
import {
  acquireSchedulerLease,
  assertSchedulerLease,
  releaseSchedulerLease,
} from "./auto-scheduler-lease.server";
describe("scheduler ownership RPC boundary", () => {
  it.each([
    { data: null, error: {} },
    { data: null, error: null },
    { data: { token: user }, error: null },
  ])("refuses an unconfirmed claim %j", async (response) => {
    mocked.rpc.mockResolvedValueOnce(response);
    await expect(acquireSchedulerLease(user, "p", "2026-10")).rejects.toThrow();
  });
  it("accepts a valid server token and scopes later checks", async () => {
    mocked.rpc
      .mockResolvedValueOnce({ data: other, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    expect(await acquireSchedulerLease(user, "p", "2026-10")).toBe(other);
    expect(mocked.rpc).toHaveBeenLastCalledWith("claim_auto_scheduler_lease", {
      p_user: user,
      p_project: "p",
      p_period: "2026-10",
    });
    await assertSchedulerLease(user, "p", other);
    await releaseSchedulerLease(user, "p", other);
    expect(mocked.rpc).toHaveBeenLastCalledWith("release_auto_scheduler_lease", {
      p_user: user,
      p_project: "p",
      p_token: other,
    });
  });
  it.each([false, null, "true"])("rejects unconfirmed continued ownership %s", async (data) => {
    mocked.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(assertSchedulerLease(user, "p", other)).rejects.toThrow(
      "ownership could not be confirmed",
    );
  });
  it("reports uncertain completion rather than assuming a release", async () => {
    mocked.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(releaseSchedulerLease(user, "p", other)).rejects.toThrow(
      "completion needs recovery review",
    );
  });
});
