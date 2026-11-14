/**
 * Renewal capacity (20261114130000) against the REAL migration chain, through the
 * production readers.
 *
 * The released workspace, entitlement, team and project-knowledge migrations, the
 * dormant Stripe foundation and commercial operations, and the new candidate are
 * installed verbatim into PGlite. Allowance changes only ever arrive through the real
 * fenced `stripe_commercial_guarded_projection`. The production `readTeamSeatAllowance`,
 * `updateProjectTeam` and `readCommercialAccountSummary` run unchanged with
 * `supabaseAdmin` routed into the same database.
 *
 * WHAT THIS IS NOT. PGlite is single-connection: the "parked" request is a real
 * interleaving of awaited steps (allowance read → renewal projection → mutation), and
 * the row-lock ordering is evidenced by the locks the allowance read takes, not by two
 * live connections. No provider behaviour (B5/B6/B7) is established here.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_IDS, PLAN_LIMITS, PLAN_SEATS, projectLimitFor, type PlanId } from "./billing";
import { TeamSeatLimitError } from "./project-team-seats";
import { readSummaryResponse } from "./stripe-commercial-ui";

let db: PGlite;
let failRpc: Set<string>;
/** A synthetic reply for one RPC name, to exercise the adapter's contract checks. */
let replies: Map<string, unknown>;

function jsonLike(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(jsonLike);
  if (value && typeof value === "object" && value.constructor === Object)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonLike(v)]));
  return value;
}
/** What `supabaseAdmin.rpc` returns: a scalar for a scalar function, rows for a TABLE. */
async function callSql(name: string, args: Record<string, unknown>) {
  if (failRpc.has(name)) throw new Error(`${name} unavailable`);
  if (replies.has(name)) return replies.get(name);
  const keys = Object.keys(args);
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`,
    keys.map((k) => args[k] ?? null),
  );
  if (result.fields.length === 1 && result.fields[0].name === name)
    return jsonLike(result.rows[0]?.[name] ?? null);
  return result.rows.map(jsonLike);
}
const sqlRpc = async (name: string, args: Record<string, unknown>) => {
  try {
    return { data: await callSql(name, args), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "sql" } };
  }
};

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));

import { readTeamSeatAllowance } from "./project-team-seats.server";
import { updateProjectTeam } from "./project-team-membership.server";
import { readCommercialAccountSummary } from "./stripe-commercial.server";

const sql = (file: string) => readFileSync(`supabase/migrations/${file}`, "utf8");
const CHAIN = [
  "20260628183811_2a8a511e-1dda-48a6-a5a3-426f72d8c4de.sql",
  "20260628191037_27b2c064-e257-4609-8b67-4802ad6a1907.sql",
  "20260726120000_workspace_entities.sql",
  "20260730205423_d6fe67e4-58c0-4848-86bd-649615604d1c.sql",
  "20260907233000_workspace_trigger_privileges.sql",
  "20260909200000_project_knowledge.sql",
  "20260911020000_project_team_reads.sql",
  "20260911030000_project_team_membership.sql",
  "20260914150000_project_team_seats.sql",
  "20261028183000_stripe_subscription_lifecycle.sql",
  "20261028223000_stripe_commercial_operations.sql",
  "20261114130000_renewal_capacity_limits.sql",
];

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const person = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
const invite = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;
const ACCOUNT = "acct_renewal";
const FUTURE = () => new Date(Date.now() + 20 * 86_400_000).toISOString();
let observed = 0;
let events = 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    CREATE TABLE auth.identities(user_id uuid,identity_data jsonb);
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    INSERT INTO auth.users(id,email) VALUES('${OWNER}','owner@example.test'),('${OTHER}','other@example.test');
    CREATE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
    CREATE TYPE public.app_role AS ENUM ('owner','member');
    CREATE TABLE public.user_roles(user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE (user_id, role));
    CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;`);
  for (const file of CHAIN) await db.exec(sql(file));
}, 120000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  failRpc = new Set();
  replies = new Map();
  await db.exec(`RESET ROLE; RESET request.uid;
    TRUNCATE public.stripe_refund_reservations, public.stripe_refund_policy_uses,
      public.stripe_refund_invoice_ledger, public.stripe_refund_cases,
      public.stripe_commercial_operations, public.stripe_commercial_quotes,
      public.stripe_checkout_requests, public.stripe_webhook_receipts, public.stripe_subscriptions,
      public.stripe_account_leases, public.stripe_customers;
    TRUNCATE public.project_team_members, public.project_team_invitations, public.project_team_audit;
    DELETE FROM public.entitlements; DELETE FROM public.user_roles; DELETE FROM public.workspaces;
    DELETE FROM public.workspace_entities; DELETE FROM public.workspace_meta;`);
  mocks.rpc.mockImplementation(sqlRpc);
  mocks.from.mockImplementation((table: string) => ({
    select: (columns: string) => {
      const filters: [string, unknown][] = [];
      const run = async () => {
        const where = filters.map(([c], i) => `${c}=$${i + 1}`).join(" AND ");
        try {
          const { rows } = await db.query<Record<string, unknown>>(
            `SELECT ${columns} FROM public.${table}${where ? ` WHERE ${where}` : ""}`,
            filters.map(([, v]) => v),
          );
          return { data: rows.map(jsonLike), error: null };
        } catch (error) {
          return { data: null, error: { message: String(error) } };
        }
      };
      const builder = {
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        limit: run,
        async maybeSingle() {
          const { data, error } = await run();
          return { data: data?.[0] ?? null, error };
        },
      };
      return builder;
    },
  }));
});

/* --------------------------------- state --------------------------------- */

const count = async (from: string) =>
  Number((await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${from}`)).rows[0].n);
/** Historic state only (rows that predate a reduction): triggers are bypassed on purpose. */
const seedRaw = (statements: string) =>
  db.exec(
    `SET session_replication_role = replica; ${statements}; SET session_replication_role = DEFAULT;`,
  );
const migrated = (projects: string[], owner = OWNER) =>
  seedRaw(`INSERT INTO public.workspace_meta(user_id) VALUES('${owner}');
    ${projects.map((p) => `INSERT INTO public.workspace_entities(user_id,collection,entity_id,data) VALUES('${owner}','projects','${p}','{"name":"${p}"}')`).join(";")}`);
const members = async (from: number, to: number, role = "editor", project = "p1") => {
  for (let n = from; n <= to; n++) {
    await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING", [
      person(n),
      `p${n}@example.test`,
    ]);
    await db.query(
      "INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES($1,$2,$3,$4)",
      [OWNER, project, person(n), role],
    );
  }
};
const seats = async () =>
  (
    await db.query<{ working: number; viewer: number }>(
      "SELECT * FROM public.count_project_team_seats($1)",
      [OWNER],
    )
  ).rows[0];
const entitle = (plan: string, status = "active", provider = "manual") =>
  db.query(
    `INSERT INTO public.entitlements(user_id,plan_id,status,current_period_end,provider) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET plan_id=excluded.plan_id,status=excluded.status,
       current_period_end=excluded.current_period_end,provider=excluded.provider`,
    [OWNER, plan, status, FUTURE(), provider],
  );

/** One complete verified webhook turn through the guarded projection. */
const renew = async (opts: {
  plan: string;
  seats: number;
  mode?: string;
  observedAt?: string;
  periodEnd?: string;
}): Promise<string> => {
  const mode = opts.mode ?? "live";
  const event = `evt_${++events}`;
  await db.query("SELECT public.stripe_upsert_customer($1,$2,$3,'cus_1')", [OWNER, ACCOUNT, mode]);
  await db.query("SELECT public.stripe_record_webhook_receipt($1,$2,$3,$4,1,'sub_1',$5)", [
    event,
    ACCOUNT,
    mode,
    "customer.subscription.updated",
    `fp_${event}`,
  ]);
  const fence = (
    await db.query<{ f: string }>(
      "SELECT public.stripe_claim_account_lease($1,$2,'w',30)::text f",
      [ACCOUNT, mode],
    )
  ).rows[0].f;
  try {
    return (
      await db.query<{ r: string }>(
        `SELECT public.stripe_commercial_guarded_projection($1,$2,'w',$3,$4,'cus_1','sub_1',NULL,$5,'active',$6,$7,false,true,true,$8,1) r`,
        [
          ACCOUNT,
          mode,
          fence,
          event,
          opts.plan,
          opts.seats,
          opts.periodEnd ?? FUTURE(),
          opts.observedAt ?? new Date(Date.now() + ++observed * 1000).toISOString(),
        ],
      )
    ).rows[0].r;
  } finally {
    await db.query("SELECT public.stripe_release_account_lease($1,$2,'w',$3)", [
      ACCOUNT,
      mode,
      fence,
    ]);
  }
};
const inviteWith = (
  n: number,
  role: "editor" | "reviewer" | "viewer",
  allowance: { workingSeats: number; viewerSeats: number },
  project = "p1",
) =>
  updateProjectTeam(
    OWNER,
    {
      action: "invite",
      projectId: project,
      inviteId: invite(n),
      email: `i${n}@example.test`,
      role,
    },
    sqlRpc,
    allowance,
  );
const summary = async () => {
  const result = await readCommercialAccountSummary(OWNER, { env: {} });
  if (!result.ok) throw new Error(result.reason);
  return result.summary;
};

/* --------------------------------- tests --------------------------------- */

describe("one plan map in SQL and in the client", () => {
  it("matches PLAN_SEATS and PLAN_LIMITS for every plan, and an unknown plan is Free", async () => {
    for (const plan of [...PLAN_IDS, "enterprise", null] as (PlanId | string | null)[]) {
      const expected = PLAN_IDS.includes(plan as PlanId) ? (plan as PlanId) : "freePreview";
      const { rows } = await db.query("SELECT * FROM public.project_plan_allowance($1)", [plan]);
      expect(rows, String(plan)).toEqual([
        {
          plan_id: expected,
          working: PLAN_SEATS[expected].workingSeats,
          viewer: PLAN_SEATS[expected].viewerSeats,
          projects: PLAN_LIMITS[expected].maxProjects,
        },
      ]);
    }
    expect(PLAN_IDS.map((p) => PLAN_LIMITS[p].maxProjects)).toEqual([1, 1, 3, 5, 15]);
    for (const planId of PLAN_IDS) {
      const sub = { planId, billingMarket: "Other", currency: "EUR", priceMonthly: 0 } as const;
      expect(projectLimitFor({ ...sub, status: "active" })).toBe(PLAN_LIMITS[planId].maxProjects);
      // A lapsed or pending mirror is Free, exactly like active_plan_id.
      expect(projectLimitFor({ ...sub, status: "pastDue" })).toBe(1);
    }
    expect(projectLimitFor(undefined)).toBe(1);
  });
});

describe("RN-02: the allowance is re-read at the protected mutation", () => {
  it("a request parked with the old Pro+3 allowance cannot add past the renewed Pro allowance", async () => {
    await migrated(["p1"]);
    expect(await renew({ plan: "pro", seats: 3 })).toBe("applied_grant");
    await members(1, 3); // owner + 3 = 4 working
    // The server function reads the allowance, then is parked before its RPC.
    const parked = await readTeamSeatAllowance(OWNER);
    expect(parked).toEqual({ workingSeats: 8, viewerSeats: 10 });
    // The verified renewal with reduced items lands in the gap.
    expect(await renew({ plan: "pro", seats: 0 })).toBe("applied_grant");
    expect(await readTeamSeatAllowance(OWNER)).toEqual({ workingSeats: 5, viewerSeats: 10 });
    // Resumed with the stale numbers: one seat still fits the NEW allowance …
    expect(await inviteWith(1, "editor", parked)).toEqual({ saved: true });
    // … the next would fit the stale 8 but not the current 5, and is refused.
    await expect(inviteWith(2, "reviewer", parked)).rejects.toBeInstanceOf(TeamSeatLimitError);
    // Viewer capacity is independent and still available.
    expect(await inviteWith(3, "viewer", parked)).toEqual({ saved: true });
    expect(await seats()).toEqual({ working: 5, viewer: 1 });
    // Nothing was removed and the refused invitation left no row.
    expect(await count("public.project_team_members WHERE active")).toBe(3);
    expect(await count("public.project_team_invitations")).toBe(2);
  });

  it("the opposite order applies the renewal, preserves everyone and only blocks growth", async () => {
    await migrated(["p1", "p2"]);
    await renew({ plan: "pro", seats: 3 });
    await members(1, 6); // owner + 6 = 7 working, within 8
    expect(await inviteWith(1, "editor", await readTeamSeatAllowance(OWNER))).toEqual({
      saved: true,
    });
    expect(await seats()).toEqual({ working: 8, viewer: 0 });
    expect((await summary()).capacityReview).toBeNull();
    const before = await summary();

    // Renewal arrives after the mutation committed: applied, not held, nothing removed.
    expect(await renew({ plan: "pro", seats: 0 })).toBe("applied_grant");
    expect(await seats()).toEqual({ working: 8, viewer: 0 });
    const over = await summary();
    expect(over.capacityReview).toEqual({
      reason: "capacity_conflict_working",
      used: 8,
      allowance: 5,
    });
    // Display only: no action (including cancellation) is taken away by over-capacity.
    expect(over.actions).toEqual(before.actions);
    expect(over.heldReason).toBe(before.heldReason);

    const current = await readTeamSeatAllowance(OWNER);
    await expect(inviteWith(2, "editor", current)).rejects.toBeInstanceOf(TeamSeatLimitError);
    // Neutral change, revoke, acceptance of the reserved invitation and removal all still work.
    const change = (member: string, expected: number, role: string | null, remove: boolean) =>
      updateProjectTeam(
        OWNER,
        remove
          ? { action: "remove", projectId: "p1", memberId: member, expectedRevision: expected }
          : {
              action: "role",
              projectId: "p1",
              memberId: member,
              expectedRevision: expected,
              role: role as "reviewer",
            },
        sqlRpc,
        current,
      );
    expect(await change(person(1), 1, "reviewer", false)).toEqual({ saved: true });
    await db.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'i1@example.test',now())",
      [person(90)],
    );
    await db.query(
      `INSERT INTO auth.identities VALUES($1,'{"email":"i1@example.test","email_verified":true}')`,
      [person(90)],
    );
    expect(
      await callSql("accept_project_team_invitation", {
        p_actor: person(90),
        p_owner: OWNER,
        p_project: "p1",
        p_invite: invite(1),
      }),
    ).toBe(1);
    expect(await seats()).toEqual({ working: 8, viewer: 0 }); // reserved seat, not a second one
    for (const n of [2, 3, 4])
      expect(await change(person(n), 1, null, true)).toEqual({ saved: true });
    // Owner's Refresh re-reads current allowance and usage; it clears only once it fits.
    expect(await seats()).toEqual({ working: 5, viewer: 0 });
    expect((await summary()).capacityReview).toBeNull();
    expect(await count("public.project_team_members")).toBe(7); // removed rows retained inactive
  });

  it("the legacy NULL-limit signature is enforced against the current allowance, not bypassed", async () => {
    await migrated(["p1"]);
    const legacy = (n: number, role: string) =>
      callSql("create_project_team_invitation", {
        p_actor: OWNER,
        p_owner: OWNER,
        p_project: "p1",
        p_invite: invite(n),
        p_email: `l${n}@example.test`,
        p_role: role,
      });
    // Free: the owner is the one working seat, one viewer.
    await expect(legacy(1, "editor")).rejects.toThrow(/team_seat_limit/);
    expect(await legacy(2, "viewer")).toBe(true);
    await expect(legacy(3, "viewer")).rejects.toThrow(/team_seat_limit/);
    // A supplied limit can only narrow the current allowance.
    await entitle("growth");
    await expect(
      callSql("create_project_team_invitation", {
        p_actor: OWNER,
        p_owner: OWNER,
        p_project: "p1",
        p_invite: invite(4),
        p_email: "l4@example.test",
        p_role: "editor",
        p_working_seats: 1,
        p_viewer_seats: 5,
      }),
    ).rejects.toThrow(/team_seat_limit/);
    expect(await legacy(5, "editor")).toBe(true);
  });

  it("keeps test mode, manual grants, lapsed periods and stale observations non-granting", async () => {
    await migrated(["p1"]);
    expect(await renew({ plan: "pro", seats: 3, mode: "test" })).toBe("applied_grant");
    expect(await readTeamSeatAllowance(OWNER)).toEqual({ workingSeats: 1, viewerSeats: 1 });
    await entitle("pro", "manualComped");
    await renew({ plan: "pro", seats: 3 }); // live, but the manual grant is preserved
    expect(await readTeamSeatAllowance(OWNER)).toEqual({ workingSeats: 5, viewerSeats: 10 });
    await db.query("DELETE FROM public.entitlements");
    const t1 = new Date(Date.now() + 500_000).toISOString();
    expect(await renew({ plan: "pro", seats: 3, observedAt: t1 })).toBe("applied_grant");
    expect(
      await renew({
        plan: "growth",
        seats: 0,
        observedAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    ).toBe("applied_grant");
    // A delayed older observation cannot restore the old paid allowance.
    expect(await renew({ plan: "pro", seats: 3, observedAt: t1 })).toBe("stale_ignored");
    expect(await readTeamSeatAllowance(OWNER)).toEqual({ workingSeats: 3, viewerSeats: 5 });
    // Outside a long transaction the helper agrees with the released readers.
    expect(await callSql("project_team_seat_allowance", { p_owner: OWNER })).toEqual([
      { plan_id: "growth", purchased: 0, working: 3, viewer: 5 },
    ]);
    await db.query("UPDATE public.entitlements SET current_period_end=now()-interval '1 second'");
    expect(await callSql("project_team_seat_allowance", { p_owner: OWNER })).toEqual([
      { plan_id: "freePreview", purchased: 0, working: 1, viewer: 1 },
    ]);
  });

  /** Start a transaction before `end`, then keep it open until the wall clock passes `end`. */
  const spanExpiry = async (end: string) => {
    await db.exec("BEGIN");
    const started = await db.query<{ before: boolean }>("SELECT now() < $1::timestamptz before", [
      end,
    ]);
    expect(started.rows[0].before).toBe(true);
    for (;;) {
      const { rows } = await db.query<{ passed: boolean }>(
        "SELECT clock_timestamp() > $1::timestamptz passed",
        [end],
      );
      if (rows[0].passed) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // The released readers still see the transaction-start now(), i.e. the old allowance.
    expect(
      (await db.query<{ p: string }>("SELECT public.active_plan_id($1) p", [OWNER])).rows[0].p,
    ).toBe("pro");
  };
  const helper = () => callSql("project_team_seat_allowance", { p_owner: OWNER });
  /** One statement inside the open transaction; a refusal must not abort the rest. */
  const attempt = async <T>(run: () => Promise<T>) => {
    await db.exec("SAVEPOINT attempt");
    try {
      return await run();
    } finally {
      await db.exec("ROLLBACK TO SAVEPOINT attempt");
    }
  };

  it("an invite in a transaction that spans the entitlement's period end gets the lapsed allowance", async () => {
    await migrated(["p1"]);
    const end = new Date(Date.now() + 1500).toISOString();
    expect(await renew({ plan: "pro", seats: 3, periodEnd: end })).toBe("applied_grant");
    const parked = await readTeamSeatAllowance(OWNER);
    expect(parked).toEqual({ workingSeats: 8, viewerSeats: 10 });
    await spanExpiry(end);
    try {
      expect(await helper()).toEqual([
        { plan_id: "freePreview", purchased: 0, working: 1, viewer: 1 },
      ]);
      // Both the no-limit legacy call and the parked server call are refused at the boundary.
      await expect(
        attempt(() =>
          callSql("create_project_team_invitation", {
            p_actor: OWNER,
            p_owner: OWNER,
            p_project: "p1",
            p_invite: invite(1),
            p_email: "x1@example.test",
            p_role: "editor",
          }),
        ),
      ).rejects.toThrow(/team_seat_limit/);
      await expect(attempt(() => inviteWith(2, "editor", parked))).rejects.toBeInstanceOf(
        TeamSeatLimitError,
      );
    } finally {
      await db.exec("ROLLBACK");
    }
    expect(await seats()).toEqual({ working: 1, viewer: 0 });
    expect(await count("public.project_team_invitations")).toBe(0);
    expect(await helper()).toEqual([
      { plan_id: "freePreview", purchased: 0, working: 1, viewer: 1 },
    ]);
  });

  it("projection-only expiry removes the purchased extras but keeps a still-valid base plan", async () => {
    await migrated(["p1"]);
    const end = new Date(Date.now() + 1500).toISOString();
    await renew({ plan: "pro", seats: 3, periodEnd: end });
    // The entitlement's own period is still current; only the purchased-seat projection lapses.
    await db.query("UPDATE public.entitlements SET current_period_end=$2 WHERE user_id=$1", [
      OWNER,
      FUTURE(),
    ]);
    await members(1, 4); // owner + 4 = 5 working: fits Pro, not Pro+3's spare
    const parked = await readTeamSeatAllowance(OWNER);
    expect(parked).toEqual({ workingSeats: 8, viewerSeats: 10 });
    await spanExpiry(end);
    try {
      expect(await helper()).toEqual([{ plan_id: "pro", purchased: 0, working: 5, viewer: 10 }]);
      await expect(attempt(() => inviteWith(1, "editor", parked))).rejects.toBeInstanceOf(
        TeamSeatLimitError,
      );
      expect(await attempt(() => inviteWith(2, "viewer", parked))).toEqual({ saved: true }); // base kept
    } finally {
      await db.exec("ROLLBACK");
    }
    expect(await seats()).toEqual({ working: 5, viewer: 0 });
    expect(await count("public.project_team_members WHERE active")).toBe(4);
    expect(await helper()).toEqual([{ plan_id: "pro", purchased: 0, working: 5, viewer: 10 }]);
  });

  it("share-locks the projection rows it reads, in the projection's order", async () => {
    await renew({ plan: "pro", seats: 3 });
    await db.exec("BEGIN");
    try {
      await db.query("SELECT * FROM public.project_team_seat_allowance($1)", [OWNER]);
      const { rows } = await db.query<{ relname: string }>(
        `SELECT c.relname FROM pg_locks l JOIN pg_class c ON c.oid=l.relation
          WHERE l.mode='RowShareLock' AND c.relname IN ('stripe_subscriptions','entitlements') ORDER BY 1`,
      );
      expect(rows.map((r) => r.relname)).toEqual(["entitlements", "stripe_subscriptions"]);
    } finally {
      await db.exec("ROLLBACK");
    }
    const source = sql("20261114130000_renewal_capacity_limits.sql");
    const body = source.slice(source.indexOf("FUNCTION public.project_team_seat_allowance"));
    expect(body.indexOf("stripe_subscriptions s WHERE")).toBeLessThan(
      body.indexOf("entitlements e WHERE"),
    );
  });

  it("keeps every new or replaced function service-only or definer-only, with a pinned search path", async () => {
    const can = async (role: string, fn: string) =>
      (
        await db.query<{ ok: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') ok", [
          role,
          fn,
        ])
      ).rows[0].ok;
    for (const role of ["anon", "authenticated", "public"]) {
      expect(await can(role, "public.project_team_seat_allowance(uuid)"), role).toBe(false);
      expect(await can(role, "public.workspace_entities_project_cap()"), role).toBe(false);
      expect(await can(role, "public.enforce_workspace_project_cap()"), role).toBe(false);
    }
    expect(await can("service_role", "public.project_team_seat_allowance(uuid)")).toBe(true);
    for (const role of ["anon", "authenticated", "service_role", "public"]) {
      expect(await can(role, "public.project_plan_allowance(text)"), role).toBe(false);
      expect(
        await can(role, "public.assert_project_team_seat(uuid,text,text,text,integer,integer)"),
        role,
      ).toBe(false);
    }
    const { rows } = await db.query<{ proname: string; cfg: string[] | null }>(
      `SELECT proname, proconfig cfg FROM pg_proc WHERE proname IN ('project_plan_allowance',
        'project_team_seat_allowance','assert_project_team_seat','workspace_entities_project_cap',
        'enforce_workspace_project_cap') ORDER BY 1`,
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row.cfg, row.proname).toEqual(['search_path=""']);
  });
});

describe("RN-03: project caps follow the plan, block only additions", () => {
  const batch = (upserts: { id: string; name: string }[], deletes: string[] = [], meta = {}) =>
    db.query("SELECT public.apply_workspace_entity_batch($1,$2::jsonb,$3::jsonb,$4::jsonb,NULL)", [
      OWNER,
      JSON.stringify(
        upserts.map((p) => ({ collection: "projects", entity_id: p.id, data: { name: p.name } })),
      ),
      JSON.stringify(deletes.map((id) => ({ collection: "projects", entity_id: id }))),
      JSON.stringify(meta),
    ]);
  const names = async () =>
    (
      await db.query<{ entity_id: string; name: string }>(
        "SELECT entity_id, data->>'name' name FROM public.workspace_entities WHERE user_id=$1 ORDER BY 1",
        [OWNER],
      )
    ).rows;

  it.each(PLAN_IDS.map((plan) => [plan, PLAN_LIMITS[plan].maxProjects] as const))(
    "%s allows exactly %i projects; the owner role bypasses",
    async (plan, cap) => {
      await migrated([]);
      if (plan !== "freePreview") await entitle(plan);
      for (let n = 1; n <= cap; n++) await batch([{ id: `n${n}`, name: "x" }]);
      await expect(batch([{ id: "extra", name: "x" }])).rejects.toThrow(
        `Project limit reached (${cap})`,
      );
      await db.query("INSERT INTO public.user_roles VALUES($1,'owner')", [OWNER]);
      await batch([{ id: "extra", name: "x" }]);
      expect(await count(`public.workspace_entities WHERE user_id='${OWNER}'`)).toBe(cap + 1);
    },
  );

  it("keeps over-cap projects editable and deletable after a downgrade, refusing only new ones", async () => {
    await migrated(["p1", "p2", "p3", "p4", "p5"]);
    await renew({ plan: "pro", seats: 0 });
    await renew({ plan: "growth", seats: 0 }); // B7: Growth = 3 projects
    await batch([{ id: "p1", name: "edited" }]); // idempotent existing-id upsert
    // A batch mixing an edit with a new project is refused as a whole: no partial write.
    await expect(
      batch([
        { id: "p2", name: "lost?" },
        { id: "p6", name: "new" },
      ]),
    ).rejects.toThrow("Project limit reached (3)");
    expect((await names()).find((p) => p.entity_id === "p2")?.name).toBe("p2");
    await batch([], ["p5"]);
    await expect(batch([{ id: "p6", name: "new" }])).rejects.toThrow("Project limit reached (3)");
    // A forged subscription in the save or in workspace_meta cannot widen the cap.
    await expect(
      batch([{ id: "p6", name: "new" }], [], {
        subscription: { planId: "agency", status: "active" },
      }),
    ).rejects.toThrow("Project limit reached (3)");
    await db.query(
      `UPDATE public.workspace_meta SET subscription='{"planId":"agency","status":"active"}' WHERE user_id=$1`,
      [OWNER],
    );
    await expect(batch([{ id: "p6", name: "new" }])).rejects.toThrow("Project limit reached (3)");
    await batch([], ["p4", "p3"]);
    await batch([{ id: "p6", name: "new" }]);
    expect(await names()).toEqual([
      { entity_id: "p1", name: "edited" },
      { entity_id: "p2", name: "p2" },
      { entity_id: "p6", name: "new" },
    ]);
    // The project half of the summary reads the same rows.
    expect((await summary()).capacityReview).toBeNull();
  });

  it("lets the lazy backfill carry over the legacy blob's own ids, idempotently, and no more", async () => {
    // Legacy Agency workspace b1..b4, saved through the real blob trigger, then reduced to Free.
    const projects = ["b1", "b2", "b3", "b4"].map((id) => ({ id, name: id }));
    await entitle("agency");
    await db.query("INSERT INTO public.workspaces(user_id,data) VALUES($1,$2::jsonb)", [
      OWNER,
      JSON.stringify({ projects }),
    ]);
    await db.query("DELETE FROM public.entitlements");
    const split = (ids: string[]) =>
      ids.map((id, ord) => ({
        collection: "projects",
        entity_id: id,
        ord,
        data: { id, name: id },
      }));
    const entities = split(projects.map((p) => p.id));
    /** The released RPC, called as the exact authenticated owner, as the browser does. */
    const backfill = async (owner = OWNER, list = entities) => {
      await db.exec(`SET request.uid = '${owner}'; SET ROLE authenticated;`);
      try {
        return await db.query<{ created: boolean }>(
          "SELECT public.backfill_workspace_entities($1,$2::jsonb,'{}'::jsonb) created",
          [owner, JSON.stringify(list)],
        );
      } finally {
        await db.exec("RESET ROLE; RESET request.uid;");
      }
    };
    // A new id can never spend the slots the preserved legacy projects occupy, in any order.
    for (const ids of [
      ["b1", "b2", "b3", "new-project"],
      ["new1", "new2", "new3", "new4"],
      ["new1", "b1", "b2", "b3", "b4"],
    ]) {
      await expect(backfill(OWNER, split(ids)), ids.join()).rejects.toThrow(
        "Project limit reached (1)",
      );
      expect(await count(`public.workspace_entities WHERE user_id='${OWNER}'`)).toBe(0);
      expect(await count(`public.workspace_meta WHERE user_id='${OWNER}'`)).toBe(0);
    }
    expect(
      (
        await db.query<{ ids: string[] }>(
          "SELECT array(SELECT p->>'id' FROM jsonb_array_elements(data->'projects') p) ids FROM public.workspaces WHERE user_id=$1",
          [OWNER],
        )
      ).rows[0].ids,
    ).toEqual(["b1", "b2", "b3", "b4"]);
    expect((await backfill()).rows[0].created).toBe(true);
    expect((await backfill()).rows[0].created).toBe(false); // replay: existing ids, no error
    expect(await count(`public.workspace_entities WHERE user_id='${OWNER}'`)).toBe(4);
    await expect(batch([{ id: "b5", name: "new" }])).rejects.toThrow("Project limit reached (1)");
    // With no legacy blob the one-time backfill is bounded by the plan, not open-ended.
    await expect(backfill(OTHER, entities)).rejects.toThrow("Project limit reached (1)");
    expect(await count(`public.workspace_entities WHERE user_id='${OTHER}'`)).toBe(0);
  });

  it("counts carried-over legacy ids against the ordinary cap when the plan has headroom", async () => {
    await entitle("pro");
    await db.query("INSERT INTO public.workspaces(user_id,data) VALUES($1,$2::jsonb)", [
      OWNER,
      JSON.stringify({ projects: [{ id: "b1", name: "b1" }] }),
    ]);
    const backfill = (ids: string[]) =>
      db.query("SELECT public.backfill_workspace_entities($1,$2::jsonb,'{}'::jsonb)", [
        OWNER,
        JSON.stringify(ids.map((id) => ({ collection: "projects", entity_id: id, data: { id } }))),
      ]);
    await expect(backfill(["n1", "n2", "n3", "n4", "n5", "b1"])).rejects.toThrow(
      "Project limit reached (5)",
    );
    await backfill(["n1", "n2", "n3", "n4", "b1"]);
    expect(await count(`public.workspace_entities WHERE user_id='${OWNER}'`)).toBe(5);
  });

  it("lets the legacy blob save unchanged or reduced over-cap content, never a new project", async () => {
    const blob = (ids: string[], name = "v") =>
      JSON.stringify({ projects: ids.map((id) => ({ id, name })) });
    await seedRaw(
      `INSERT INTO public.workspaces(user_id,data) VALUES('${OWNER}','${blob(["a", "b", "c"])}')`,
    );
    const save = (data: string) =>
      db.query("UPDATE public.workspaces SET data=$2::jsonb WHERE user_id=$1", [OWNER, data]);
    await save(blob(["a", "b", "c"], "edited"));
    await save(blob(["a", "c"], "edited"));
    await expect(save(blob(["a", "d"]))).rejects.toThrow("Project limit reached (1)");
    await expect(save(blob(["a", "c", "d"]))).rejects.toThrow("Project limit reached (1)");
    expect(
      (
        await db.query<{ data: unknown }>("SELECT data FROM public.workspaces WHERE user_id=$1", [
          OWNER,
        ])
      ).rows[0].data,
    ).toEqual(JSON.parse(blob(["a", "c"], "edited")));
    await expect(
      db.query("INSERT INTO public.workspaces(user_id,data) VALUES($1,$2::jsonb)", [
        OTHER,
        blob(["x", "y"]),
      ]),
    ).rejects.toThrow("Project limit reached (1)");
    await db.query("INSERT INTO public.workspaces(user_id,data) VALUES($1,$2::jsonb)", [
      OTHER,
      blob(["x"]),
    ]);
  });
});

describe("RN-01: the current capacity review in the billing summary", () => {
  it("reports each conflict with its count and allowance, and the wire reader keeps it", async () => {
    await migrated(["p1", "p2", "p3", "p4"]);
    await renew({ plan: "pro", seats: 0 });
    await members(1, 6, "viewer");
    expect((await summary()).capacityReview).toBeNull();
    await renew({ plan: "growth", seats: 0 });
    let review = (await summary()).capacityReview;
    expect(review).toEqual({ reason: "capacity_conflict_viewer", used: 6, allowance: 5 });
    await members(7, 7, "viewer", "p2");
    await db.query(
      "UPDATE public.project_team_members SET active=false WHERE actor_id IN ($1,$2)",
      [person(1), person(2)],
    );
    review = (await summary()).capacityReview;
    expect(review).toEqual({ reason: "capacity_conflict_projects", used: 4, allowance: 3 });
    const read = readSummaryResponse({ ok: true, summary: await summary() });
    expect(read.kind === "value" && read.value.capacityReview).toEqual(review);
    const broken = { ok: true, summary: { ...(await summary()), capacityReview: { reason: "x" } } };
    expect(readSummaryResponse(broken).kind).toBe("unreadable");
  });

  it("keeps unknown seats and projects unknown, never zero, and recovers on a clean re-read", async () => {
    await renew({ plan: "growth", seats: 0 });
    const entitlement = await db.query("SELECT * FROM public.entitlements");
    // Not migrated: the project count is unknown, not 0.
    expect((await summary()).capacityReview).toEqual({
      reason: "capacity_projects_unknown",
      used: null,
      allowance: null,
    });
    await migrated(["p1"]);
    for (const name of ["project_team_seat_allowance", "stripe_commercial_membership_usage"]) {
      failRpc = new Set([name]);
      expect((await summary()).capacityReview, name).toEqual({
        reason: "capacity_unknown",
        used: null,
        allowance: null,
      });
    }
    failRpc = new Set();
    expect((await summary()).capacityReview).toBeNull();
    // A retry never invents an entitlement or a larger plan.
    expect((await db.query("SELECT * FROM public.entitlements")).rows).toEqual(entitlement.rows);
  });

  it("reads a malformed allowance reply as unknown, never as fitting", async () => {
    await migrated(["p1"]);
    await renew({ plan: "pro", seats: 0 });
    const clear = await summary();
    expect(clear.capacityReview).toBeNull(); // control: the real reply fits
    const row = { plan_id: "pro", purchased: 0, working: 5, viewer: 10 };
    for (const reply of [
      [{ ...row, purchased: "" }],
      [{ ...row, purchased: "0" }],
      [{ ...row, purchased: 2.5 }],
      [{ ...row, purchased: -1, working: 4 }],
      [{ ...row, purchased: 1001, working: 1006 }],
      [{ plan_id: "freePreview", purchased: 1, working: 2, viewer: 1 }],
      [{ ...row, plan_id: "enterprise" }],
      [{ ...row, working: 9 }],
      [{ ...row, viewer: 11 }],
      [row, row],
      [],
      [null],
      row,
      null,
    ]) {
      replies.set("project_team_seat_allowance", reply);
      const read = await summary();
      expect(read.capacityReview, JSON.stringify(reply)).toEqual({
        reason: "capacity_unknown",
        used: null,
        allowance: null,
      });
      expect(read.actions).toEqual(clear.actions); // display only
      const wire = readSummaryResponse({ ok: true, summary: read });
      expect(wire.kind === "value" && wire.value.capacityReview).toEqual(read.capacityReview);
    }
    // The bounded maximum is still a valid reply.
    replies.set("project_team_seat_allowance", [{ ...row, purchased: 1000, working: 1005 }]);
    expect((await summary()).capacityReview).toBeNull();
  });
});
