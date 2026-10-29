/**
 * Executable acceptance for the Stripe lifecycle migration, on local PGlite.
 *
 * The decisive invariants under test are the ones a review reproduced as bugs:
 * test-mode activity must never touch a production entitlement; only the exact
 * mapped current subscription may apply or revoke; a crash, a lost
 * acknowledgment or a failed provider read must leave a retryable receipt that
 * a bounded replay can actually complete; and no write may happen without a
 * live fenced lease and a matching durable receipt.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const ACCOUNT = "acct_fixturelive";
const OTHER_ACCOUNT = "acct_fixtureother";
const user = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const FUTURE = () => iso(30 * 24 * 3600 * 1000);
const PAST = () => iso(-24 * 3600 * 1000);

/** Everything the migration needs to exist BEFORE it installs: the Supabase
 * roles, the auth schema and a faithful copy of the live entitlements table.
 * Shared verbatim with the inherited-ACL fixtures below, so those cannot
 * silently install against a weaker prerequisite set than the main suite. */
const BOOTSTRAP_SQL = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    INSERT INTO auth.users VALUES('${user}','owner@example.test'),('${second}','second@example.test');
    -- Faithful copy of the live public.entitlements shape (20260730205423).
    CREATE TABLE public.entitlements(
      user_id uuid PRIMARY KEY,
      plan_id text NOT NULL DEFAULT 'freePreview',
      status text NOT NULL DEFAULT 'freePreview',
      current_period_end timestamptz,
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      provider text NOT NULL DEFAULT 'paddle',
      provider_customer_id text,
      provider_subscription_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    CREATE TRIGGER entitlements_set_updated_at BEFORE UPDATE ON public.entitlements
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
    GRANT SELECT ON public.entitlements TO authenticated;
    GRANT ALL ON public.entitlements TO service_role;
    ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users view own entitlement" ON public.entitlements FOR SELECT TO authenticated
      USING (auth.uid() = user_id);`;

const MIGRATION_SQL = readFileSync(
  "supabase/migrations/20261028183000_stripe_subscription_lifecycle.sql",
  "utf8",
);

/** The five SENSITIVE stores this migration creates. */
const SENSITIVE_TABLES = [
  "stripe_customers",
  "stripe_subscriptions",
  "stripe_webhook_receipts",
  "stripe_account_leases",
  "stripe_checkout_requests",
] as const;

/** Every function this migration creates, with its exact signature. */
const FUNCTION_SIGNATURES = [
  "public.stripe_upsert_customer(uuid,text,text,text)",
  "public.stripe_owner_customer(uuid,text,text)",
  "public.stripe_customer_projection(text,text,text)",
  "public.stripe_claim_account_lease(text,text,text,integer)",
  "public.stripe_renew_account_lease(text,text,text,bigint,integer)",
  "public.stripe_release_account_lease(text,text,text,bigint)",
  "public.stripe_require_lease(text,text,text,bigint)",
  "public.stripe_sellable_plan(text)",
  "public.stripe_revocable_status(text)",
  "public.stripe_record_webhook_receipt(text,text,text,text,bigint,text,text)",
  "public.stripe_finish_webhook_receipt(text,text,text,text,text,bigint)",
  "public.stripe_receipt_attempt_limit()",
  "public.stripe_replay_exclusion_limit()",
  "public.stripe_claim_replay_receipt(text,text,text[])",
  "public.stripe_claim_checkout_request(uuid,uuid,text,text,text,text)",
  "public.stripe_read_checkout_request(uuid,uuid,text,text,text)",
  "public.stripe_open_checkout_request(uuid,uuid,text,text,text,text)",
  "public.stripe_fence_checkout_request(uuid,uuid,text,text,text)",
  "public.stripe_settle_checkout_request(uuid,uuid,text,text,text,text,text)",
  "public.stripe_expire_checkout_session(uuid,uuid,text,text,text,text,bigint)",
  "public.stripe_purchased_working_seats(uuid)",
  "public.stripe_apply_subscription_projection(text,text,text,bigint,text,text,text,text,text,text,integer,timestamptz,boolean,boolean,boolean,timestamptz,bigint,uuid,text)",
] as const;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP_SQL);
  await db.exec(MIGRATION_SQL);
}, 60000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE public.stripe_checkout_requests, public.stripe_webhook_receipts,
      public.stripe_subscriptions, public.stripe_account_leases, public.stripe_customers;
    DELETE FROM public.entitlements;`);
});

/* ------------------------------ helpers --------------------------------- */

const map = (customer: string, owner = user, mode: "live" | "test" = "live", account = ACCOUNT) =>
  db.query("SELECT public.stripe_upsert_customer($1,$2,$3,$4)", [owner, account, mode, customer]);

const lease = async (holder: string, mode: "live" | "test" = "live", ttl = 30, account = ACCOUNT) =>
  Number(
    (
      await db.query<{ fence: string }>(
        "SELECT public.stripe_claim_account_lease($1,$2,$3,$4)::text AS fence",
        [account, mode, holder, ttl],
      )
    ).rows[0].fence,
  );

const record = (
  event: string,
  opts: {
    mode?: "live" | "test";
    type?: string;
    created?: number;
    object?: string;
    fingerprint?: string;
    account?: string;
  } = {},
) =>
  db.query<{ result: string }>(
    "SELECT public.stripe_record_webhook_receipt($1,$2,$3,$4,$5,$6,$7) AS result",
    [
      event,
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      opts.type ?? "customer.subscription.updated",
      opts.created ?? 1000,
      opts.object ?? "sub_fixture",
      opts.fingerprint ?? "a".repeat(64),
    ],
  );

interface ApplyOpts {
  account?: string;
  mode?: "live" | "test";
  holder?: string;
  fence?: number;
  event?: string;
  customer?: string;
  subscription?: string;
  replaces?: string | null;
  planId?: string;
  status?: string;
  seats?: number;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  invoicePaid?: boolean;
  grants?: boolean;
  observedAt?: string;
  eventCreated?: number;
  sessionRequest?: string | null;
  sessionId?: string | null;
}
const apply = async (opts: ApplyOpts = {}) =>
  (
    await db.query<{ result: string }>(
      `SELECT public.stripe_apply_subscription_projection(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) AS result`,
      [
        opts.account ?? ACCOUNT,
        opts.mode ?? "live",
        opts.holder ?? "holder-a",
        opts.fence ?? 1,
        opts.event ?? "evt_1",
        opts.customer ?? "cus_live",
        opts.subscription ?? "sub_1",
        opts.replaces ?? null,
        opts.planId ?? "pro",
        opts.status ?? "active",
        opts.seats ?? 0,
        opts.periodEnd === undefined ? FUTURE() : opts.periodEnd,
        opts.cancelAtPeriodEnd ?? false,
        opts.invoicePaid ?? true,
        opts.grants ?? true,
        opts.observedAt ?? iso(0),
        opts.eventCreated ?? 1000,
        opts.sessionRequest ?? null,
        opts.sessionId ?? null,
      ],
    )
  ).rows[0].result;

/** The receipt transition helper, which now requires the ACCOUNT LEASE: a
 * worker that lost its lease must not be able to acknowledge anything. */
const finish = async (
  event: string,
  status: string,
  holder: string,
  fence: number,
  mode: "live" | "test" = "live",
) =>
  (
    await db.query<{ done: boolean }>(
      "SELECT public.stripe_finish_webhook_receipt($1,$2,$3,$4,$5,$6) AS done",
      [event, ACCOUNT, mode, status, holder, fence],
    )
  ).rows[0].done;

const renew = async (holder: string, fence: number, ttl = 30, mode: "live" | "test" = "live") =>
  (
    await db.query<{ done: boolean }>(
      "SELECT public.stripe_renew_account_lease($1,$2,$3,$4,$5) AS done",
      [ACCOUNT, mode, holder, fence, ttl],
    )
  ).rows[0].done;

const expireLease = () =>
  db.query(
    "UPDATE public.stripe_account_leases SET leased_until=clock_timestamp()-interval '1 second'",
  );

/** Claim one replay receipt. Omitting `exclude` exercises the DEFAULT argument
 * (the two-argument call the earlier revision had); passing it exercises the
 * PER-INVOCATION exclusion set. */
const claimReplay = async (account = ACCOUNT, mode = "live", exclude?: unknown[]) =>
  (exclude === undefined
    ? await db.query<{ event_id: string; attempts: number }>(
        "SELECT event_id,attempts FROM public.stripe_claim_replay_receipt($1,$2)",
        [account, mode],
      )
    : await db.query<{ event_id: string; attempts: number }>(
        "SELECT event_id,attempts FROM public.stripe_claim_replay_receipt($1,$2,$3)",
        [account, mode, exclude],
      )
  ).rows;

const allAttempts = async () =>
  (
    await db.query<{ event_id: string; attempts: number }>(
      "SELECT event_id,attempts FROM public.stripe_webhook_receipts ORDER BY event_id",
    )
  ).rows;

const entitlement = async (owner = user) =>
  (
    await db.query<Record<string, unknown>>(
      "SELECT plan_id,status,provider,provider_subscription_id,current_period_end FROM public.entitlements WHERE user_id=$1",
      [owner],
    )
  ).rows[0];

const receiptStatus = async (event = "evt_1", mode: "live" | "test" = "live") =>
  (
    await db.query<{ status: string; attempts: number }>(
      "SELECT status,attempts FROM public.stripe_webhook_receipts WHERE event_id=$1 AND account_id=$2 AND mode=$3",
      [event, ACCOUNT, mode],
    )
  ).rows[0];

const projection = async (owner = user, mode: "live" | "test" = "live") =>
  (
    await db.query<Record<string, unknown>>(
      "SELECT subscription_id,plan_id,status,seat_quantity FROM public.stripe_subscriptions WHERE user_id=$1 AND mode=$2",
      [owner, mode],
    )
  ).rows[0];

const seats = async (owner = user) =>
  (
    await db.query<{ seats: number }>("SELECT public.stripe_purchased_working_seats($1) AS seats", [
      owner,
    ])
  ).rows[0].seats;

/** A complete, live, granted subscription for `user` — the production state the
 * test-mode isolation cases must leave alone. */
const grantLive = async (
  opts: { subscription?: string; planId?: string; seats?: number; event?: string } = {},
) => {
  await map("cus_live");
  const fence = await lease("holder-live");
  await record(opts.event ?? "evt_live");
  const result = await apply({
    event: opts.event ?? "evt_live",
    holder: "holder-live",
    fence,
    subscription: opts.subscription ?? "sub_1",
    planId: opts.planId ?? "pro",
    seats: opts.seats ?? 0,
  });
  await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-live',$2)", [
    ACCOUNT,
    fence,
  ]);
  return result;
};

/* ------------------------------- install -------------------------------- */

describe("inert install and service-only surface", () => {
  it("creates no rows and leaves the existing entitlement table untouched", async () => {
    const counts = await db.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM public.stripe_customers)
            + (SELECT count(*) FROM public.stripe_subscriptions)
            + (SELECT count(*) FROM public.stripe_webhook_receipts)
            + (SELECT count(*) FROM public.stripe_account_leases)
            + (SELECT count(*) FROM public.stripe_checkout_requests)
            + (SELECT count(*) FROM public.entitlements) AS n`,
    );
    expect(Number(counts.rows[0].n)).toBe(0);
    // No trigger was added to entitlements beyond the pre-existing updated_at one.
    expect(
      (
        await db.query<{ tgname: string }>(
          "SELECT tgname FROM pg_trigger WHERE tgrelid='public.entitlements'::regclass AND NOT tgisinternal ORDER BY tgname",
        )
      ).rows,
    ).toEqual([{ tgname: "entitlements_set_updated_at" }]);
  });

  it("enables RLS with no policy and denies anon/authenticated every table", async () => {
    for (const table of SENSITIVE_TABLES) {
      const { rows } = await db.query<Record<string, boolean | number>>(
        `SELECT relrowsecurity AS rls,
                (SELECT count(*)::int FROM pg_policies p WHERE p.tablename=$1) AS policies,
                has_table_privilege('anon','public.'||$1,'SELECT') AS anon_select,
                has_table_privilege('authenticated','public.'||$1,'SELECT') AS auth_select,
                has_table_privilege('authenticated','public.'||$1,'INSERT') AS auth_insert,
                has_table_privilege('authenticated','public.'||$1,'UPDATE') AS auth_update,
                has_table_privilege('service_role','public.'||$1,'INSERT') AS service_insert
           FROM pg_class WHERE oid=('public.'||$1)::regclass`,
        [table],
      );
      expect({ table, ...rows[0] }).toEqual({
        table,
        rls: true,
        policies: 0,
        anon_select: false,
        auth_select: false,
        auth_insert: false,
        auth_update: false,
        service_insert: true,
      });
    }
  });

  it("grants every lifecycle function to service_role only", async () => {
    for (const signature of FUNCTION_SIGNATURES) {
      const { rows } = await db.query<Record<string, boolean>>(
        `SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon,
                has_function_privilege('authenticated',$1,'EXECUTE') AS signed_in,
                has_function_privilege('service_role',$1,'EXECUTE') AS service`,
        [signature],
      );
      expect({ signature, ...rows[0] }).toEqual({
        signature,
        anon: false,
        signed_in: false,
        service: true,
      });
    }
  });

  it("refuses direct table access to a signed-in role even with a valid mapping", async () => {
    await map("cus_live");
    await db.exec("SET ROLE authenticated");
    await expect(db.query("SELECT * FROM public.stripe_customers")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("SELECT public.stripe_purchased_working_seats($1)", [user]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});

/* -------- inherited default-ACL isolation (the production condition) ----- */

/**
 * RLS IS NOT ISOLATION FOR A ROLE THAT BYPASSES IT.
 *
 * Root verified that production carries a named `sandbox_exec` role which is
 * LOGIN and BYPASSRLS and not superuser, and that the schema's DEFAULT
 * PRIVILEGES grant it SELECT and INSERT on every table postgres creates. The
 * migration's PUBLIC/anon/authenticated revoke never touched that inherited
 * grant, so all five sensitive stores would have been readable and insertable
 * by that role from the moment they were created. The strict production
 * wrapper caught exactly this on a separate bounded migration and rolled back
 * before commit.
 *
 * The fixture reproduces the adversarial condition rather than asserting on the
 * migration's text: the role exists with those attributes and the default
 * grants are installed BEFORE the migration creates anything, and the checks
 * below are real `SET ROLE` reads and writes.
 */
describe("an inheriting sandbox_exec role is locked out of the sensitive stores", () => {
  let fixture: PGlite;
  const sql = <T>(text: string, params?: unknown[]) => fixture.query<T>(text, params);

  beforeAll(async () => {
    fixture = new PGlite();
    await fixture.exec(BOOTSTRAP_SQL);
    await fixture.exec(`CREATE ROLE sandbox_exec LOGIN BYPASSRLS;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO sandbox_exec;
      CREATE TABLE public.sentinel_unrelated(id integer PRIMARY KEY, note text);
      INSERT INTO public.sentinel_unrelated VALUES(1,'untouched');`);
    await fixture.exec(MIGRATION_SQL);
    // Created AFTER the install: proves the migration left the schema's own
    // default privileges in place for every future table.
    await fixture.exec("CREATE TABLE public.sentinel_after_install(id integer PRIMARY KEY)");
  }, 60000);
  afterAll(async () => {
    await fixture?.close();
  });
  afterEach(async () => {
    await fixture.exec("RESET ROLE");
  });

  it("really does inherit SELECT and INSERT on unrelated tables (the fixture is adversarial)", async () => {
    await fixture.exec("SET ROLE sandbox_exec");
    for (const table of ["sentinel_unrelated", "sentinel_after_install"]) {
      expect([
        table,
        (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n,
      ]).toEqual([table, table === "sentinel_unrelated" ? 1 : 0]);
      await sql(`INSERT INTO public.${table}(id) VALUES(99)`);
    }
    expect(
      (await sql<{ n: number }>("SELECT count(*)::int AS n FROM public.sentinel_unrelated")).rows[0]
        .n,
    ).toBe(2);
  });

  it.each([...SENSITIVE_TABLES])(
    "denies sandbox_exec an actual SELECT and an actual INSERT on %s",
    async (table) => {
      await fixture.exec("SET ROLE sandbox_exec");
      await expect(sql(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/);
      await expect(sql(`INSERT INTO public.${table} DEFAULT VALUES`)).rejects.toThrow(
        /permission denied/,
      );
    },
  );

  it("leaves no effective table right, column right or direct ACL entry behind", async () => {
    for (const table of SENSITIVE_TABLES) {
      const { rows } = await sql<Record<string, boolean | number>>(
        `SELECT has_table_privilege('sandbox_exec','public.'||$1,
                  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS classic,
                has_any_column_privilege('sandbox_exec','public.'||$1,
                  'SELECT,INSERT,UPDATE,REFERENCES') AS columns,
                (SELECT count(*)::int FROM pg_class c
                   JOIN pg_namespace s ON s.oid=c.relnamespace,
                   LATERAL aclexplode(c.relacl) a
                  WHERE s.nspname='public' AND c.relname=$1 AND c.relacl IS NOT NULL
                    AND a.grantee='sandbox_exec'::regrole) AS acl_entries`,
        [table],
      );
      expect({ table, ...rows[0] }).toEqual({
        table,
        classic: false,
        columns: false,
        acl_entries: 0,
      });
    }
  });

  it("keeps service_role's intended access and a working round trip", async () => {
    for (const table of SENSITIVE_TABLES) {
      const { rows } = await sql<Record<string, boolean>>(
        `SELECT has_table_privilege('service_role','public.'||$1,'SELECT') AS can_read,
                has_table_privilege('service_role','public.'||$1,'INSERT') AS can_write,
                has_table_privilege('service_role','public.'||$1,'UPDATE') AS can_update,
                has_table_privilege('service_role','public.'||$1,'DELETE') AS can_delete`,
        [table],
      );
      expect({ table, ...rows[0] }).toEqual({
        table,
        can_read: true,
        can_write: true,
        can_update: true,
        can_delete: true,
      });
    }
    await fixture.exec("SET ROLE service_role");
    await sql("INSERT INTO public.stripe_account_leases(account_id,mode) VALUES('acct_x','live')");
    expect(
      (await sql<{ n: number }>("SELECT count(*)::int AS n FROM public.stripe_account_leases"))
        .rows[0].n,
    ).toBe(1);
    await sql("DELETE FROM public.stripe_account_leases WHERE account_id='acct_x'");
  });

  it.each([...SENSITIVE_TABLES])("still refuses anon and authenticated on %s", async (table) => {
    const { rows } = await sql<Record<string, boolean>>(
      `SELECT has_table_privilege('anon','public.'||$1,'SELECT') AS anon_select,
              has_table_privilege('anon','public.'||$1,'INSERT') AS anon_insert,
              has_table_privilege('authenticated','public.'||$1,'SELECT') AS auth_select,
              has_table_privilege('authenticated','public.'||$1,'INSERT') AS auth_insert`,
      [table],
    );
    expect({ table, ...rows[0] }).toEqual({
      table,
      anon_select: false,
      anon_insert: false,
      auth_select: false,
      auth_insert: false,
    });
    await fixture.exec("SET ROLE authenticated");
    await expect(sql(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/);
  });

  it("alters no default privilege and no unrelated table's inherited access", async () => {
    // The schema's own DEFAULT PRIVILEGES are exactly as the environment set
    // them: SELECT and INSERT on relations, for this role, unchanged.
    expect(
      (
        await sql<{ privilege_type: string }>(
          `SELECT a.privilege_type FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
            WHERE d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='r'
              AND a.grantee='sandbox_exec'::regrole ORDER BY a.privilege_type`,
        )
      ).rows,
    ).toEqual([{ privilege_type: "INSERT" }, { privilege_type: "SELECT" }]);
    for (const table of ["sentinel_unrelated", "sentinel_after_install"]) {
      const { rows } = await sql<Record<string, boolean>>(
        `SELECT has_table_privilege('sandbox_exec','public.'||$1,'SELECT') AS can_read,
                has_table_privilege('sandbox_exec','public.'||$1,'INSERT') AS can_write`,
        [table],
      );
      expect({ table, ...rows[0] }).toEqual({ table, can_read: true, can_write: true });
    }
    // Role attributes and memberships are untouched: an optional environment
    // fixture is never created, altered or dropped by a migration.
    expect(
      (
        await sql<Record<string, boolean | number>>(
          `SELECT rolcanlogin, rolbypassrls, rolsuper,
                  (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) AS memberships
             FROM pg_roles r WHERE rolname='sandbox_exec'`,
        )
      ).rows[0],
    ).toEqual({ rolcanlogin: true, rolbypassrls: true, rolsuper: false, memberships: 0 });
  });

  it("executes none of the new RPCs as sandbox_exec, while service_role still can", async () => {
    for (const signature of FUNCTION_SIGNATURES) {
      const { rows } = await sql<Record<string, boolean>>(
        `SELECT has_function_privilege('sandbox_exec',$1,'EXECUTE') AS sandbox,
                has_function_privilege('service_role',$1,'EXECUTE') AS service`,
        [signature],
      );
      expect({ signature, ...rows[0] }).toEqual({ signature, sandbox: false, service: true });
    }
    // Not a textual claim: the call itself is refused.
    await fixture.exec("SET ROLE sandbox_exec");
    await expect(sql("SELECT public.stripe_purchased_working_seats($1)", [user])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("installing where sandbox_exec is absent changes no ACL at all", () => {
  let plain: PGlite;

  beforeAll(async () => {
    plain = new PGlite();
    await plain.exec(BOOTSTRAP_SQL);
    // No optional role, no default grants: the conditional block must be a
    // documented no-op rather than an installation failure.
    await plain.exec(MIGRATION_SQL);
  }, 60000);
  afterAll(async () => {
    await plain?.close();
  });

  it("installs the five stores with the unchanged restrictions and no sandbox ACL entry", async () => {
    expect(
      (
        await plain.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1",
          ["sandbox_exec"],
        )
      ).rows[0].n,
    ).toBe(0);
    for (const table of SENSITIVE_TABLES) {
      const { rows } = await plain.query<Record<string, boolean | number>>(
        `SELECT relrowsecurity AS rls,
                (SELECT count(*)::int FROM pg_policies p WHERE p.tablename=$1) AS policies,
                has_table_privilege('anon','public.'||$1,'SELECT') AS anon_select,
                has_table_privilege('authenticated','public.'||$1,'INSERT') AS auth_insert,
                has_table_privilege('service_role','public.'||$1,'INSERT') AS service_insert,
                (SELECT count(*)::int FROM pg_class c
                   JOIN pg_namespace s ON s.oid=c.relnamespace,
                   LATERAL aclexplode(c.relacl) a
                  WHERE s.nspname='public' AND c.relname=$1 AND c.relacl IS NOT NULL
                    AND a.grantee::regrole::text='sandbox_exec') AS sandbox_entries
           FROM pg_class WHERE oid=('public.'||$1)::regclass`,
        [table],
      );
      expect({ table, ...rows[0] }).toEqual({
        table,
        rls: true,
        policies: 0,
        anon_select: false,
        auth_insert: false,
        service_insert: true,
        sandbox_entries: 0,
      });
    }
  });
});

/* --------------------------- mode isolation ----------------------------- */

describe("test mode never reaches production entitlements (reproduced bug)", () => {
  it("leaves a live pro grant intact while test-mode activity is applied", async () => {
    expect(await grantLive()).toBe("applied_grant");
    const before = await entitlement();
    expect(before).toMatchObject({ plan_id: "pro", status: "active", provider: "stripe" });

    // Same user, a TEST customer, a test-mode active+paid projection.
    await map("cus_test", user, "test");
    const fence = await lease("holder-test", "test");
    await record("evt_test", { mode: "test", object: "sub_test" });
    expect(
      await apply({
        mode: "test",
        holder: "holder-test",
        fence,
        event: "evt_test",
        customer: "cus_test",
        subscription: "sub_test",
        planId: "starter",
        seats: 7,
        grants: false, // the pure resolver never grants outside live mode
      }),
    ).toBe("applied_no_grant");

    expect(await entitlement()).toEqual(before);
    expect(await projection(user, "test")).toMatchObject({
      subscription_id: "sub_test",
      plan_id: "starter",
      seat_quantity: 7,
    });
    expect(await projection(user, "live")).toMatchObject({ subscription_id: "sub_1" });
    // A test projection contributes no purchased seats to the live account.
    expect(await seats()).toBe(0);
  });

  it.each(["canceled", "unpaid", "past_due", "incomplete_expired"])(
    "cannot revoke the live entitlement with a test-mode %s subscription",
    async (status) => {
      await grantLive();
      await map("cus_test", user, "test");
      const fence = await lease("holder-test", "test");
      await record(`evt_${status}`, { mode: "test", object: "sub_test" });
      expect(
        await apply({
          mode: "test",
          holder: "holder-test",
          fence,
          event: `evt_${status}`,
          customer: "cus_test",
          subscription: "sub_test",
          status,
          grants: false,
          periodEnd: null,
          invoicePaid: false,
        }),
      ).toBe("applied_no_grant");
      expect(await entitlement()).toMatchObject({
        plan_id: "pro",
        status: "active",
        provider: "stripe",
      });
    },
  );

  it("keeps a live grant even when a test grant flag is forced by a caller", async () => {
    await grantLive();
    await map("cus_test", user, "test");
    const fence = await lease("holder-test", "test");
    await record("evt_forced", { mode: "test", object: "sub_test" });
    // Defence in depth: even a caller that wrongly asserts grants=true in test
    // mode cannot write an entitlement, because the whole block is mode-gated.
    expect(
      await apply({
        mode: "test",
        holder: "holder-test",
        fence,
        event: "evt_forced",
        customer: "cus_test",
        subscription: "sub_test",
        planId: "agency",
        grants: true,
      }),
    ).toBe("applied_grant");
    expect(await entitlement()).toMatchObject({ plan_id: "pro", provider: "stripe" });
  });
});

/* ------------------- manual / legacy access preservation ---------------- */

describe("manual and legacy access survive every Stripe outcome", () => {
  it.each(["manualBeta", "manualComped"])(
    "never overwrites %s, even on provider stripe",
    async (status) => {
      await db.query(
        "INSERT INTO public.entitlements(user_id,plan_id,status,provider,provider_subscription_id) VALUES($1,'agency',$2,'stripe','sub_1')",
        [user, status],
      );
      await map("cus_live");
      const fence = await lease("holder-a");
      await record("evt_1");
      expect(await apply({ fence, planId: "starter" })).toBe("grant_withheld_manual");
      expect(await entitlement()).toMatchObject({ plan_id: "agency", status });

      // The revoke path is equally refused for a manual row.
      const fence2 = await lease("holder-a");
      await record("evt_2");
      expect(
        await apply({
          fence: fence2,
          event: "evt_2",
          status: "canceled",
          grants: false,
          invoicePaid: false,
          periodEnd: null,
          observedAt: iso(1000),
        }),
      ).toBe("revoke_not_applicable");
      expect(await entitlement()).toMatchObject({ plan_id: "agency", status });
      expect(await receiptStatus("evt_2")).toMatchObject({ status: "applied" });
    },
  );

  it("never takes over a legacy provider row that currently grants paid access", async () => {
    await db.query(
      "INSERT INTO public.entitlements(user_id,plan_id,status,provider,provider_subscription_id) VALUES($1,'growth','active','paddle','sub_paddle')",
      [user],
    );
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_1");
    expect(await apply({ fence })).toBe("grant_withheld_manual");
    expect(await entitlement()).toMatchObject({
      plan_id: "growth",
      provider: "paddle",
      provider_subscription_id: "sub_paddle",
    });
  });

  it("takes over a non-granting legacy row (the default provider is paddle)", async () => {
    await db.query(
      "INSERT INTO public.entitlements(user_id,plan_id,status) VALUES($1,'freePreview','freePreview')",
      [user],
    );
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_1");
    expect(await apply({ fence })).toBe("applied_grant");
    expect(await entitlement()).toMatchObject({
      plan_id: "pro",
      status: "active",
      provider: "stripe",
    });
  });

  it("only the exact mapped subscription can revoke a stripe entitlement", async () => {
    await grantLive();
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_other");
    // A terminal event for a DIFFERENT subscription id, unverified as a
    // replacement, is superseded: it must not revoke the current one.
    expect(
      await apply({
        fence,
        event: "evt_other",
        subscription: "sub_old",
        status: "canceled",
        grants: false,
        invoicePaid: false,
        periodEnd: null,
        observedAt: iso(1000),
      }),
    ).toBe("superseded_ignored");
    expect(await entitlement()).toMatchObject({ plan_id: "pro", status: "active" });
    expect(await projection()).toMatchObject({ subscription_id: "sub_1" });
    expect(await receiptStatus("evt_other")).toMatchObject({ status: "ignored" });
  });
});

/* ---------------- current subscription / replacement rules -------------- */

describe("current-subscription resolution", () => {
  it("accepts an explicitly verified, strictly newer replacement only", async () => {
    await grantLive();
    await map("cus_live");

    // Unverified replacement (no p_replaces) is refused.
    let fence = await lease("holder-a");
    await record("evt_a", { object: "sub_2" });
    expect(
      await apply({ fence, event: "evt_a", subscription: "sub_2", observedAt: iso(2000) }),
    ).toBe("superseded_ignored");
    expect(await projection()).toMatchObject({ subscription_id: "sub_1" });

    // Naming the wrong predecessor is refused.
    fence = await lease("holder-a");
    await record("evt_b", { object: "sub_2" });
    expect(
      await apply({
        fence,
        event: "evt_b",
        subscription: "sub_2",
        replaces: "sub_wrong",
        observedAt: iso(2000),
      }),
    ).toBe("superseded_ignored");

    // Identical observation time is refused: the newer projection is preserved.
    const observed = (
      await db.query<{ observed_at: string }>(
        "SELECT observed_at::text FROM public.stripe_subscriptions WHERE user_id=$1 AND mode='live'",
        [user],
      )
    ).rows[0].observed_at;
    fence = await lease("holder-a");
    await record("evt_c", { object: "sub_2" });
    expect(
      await apply({
        fence,
        event: "evt_c",
        subscription: "sub_2",
        replaces: "sub_1",
        observedAt: observed,
      }),
    ).toBe("superseded_ignored");
    expect(await projection()).toMatchObject({ subscription_id: "sub_1" });

    // Verified and strictly newer: the replacement becomes current.
    fence = await lease("holder-a");
    await record("evt_d", { object: "sub_2" });
    expect(
      await apply({
        fence,
        event: "evt_d",
        subscription: "sub_2",
        replaces: "sub_1",
        planId: "agency",
        observedAt: iso(5000),
      }),
    ).toBe("applied_grant");
    expect(await projection()).toMatchObject({ subscription_id: "sub_2", plan_id: "agency" });
    expect(await entitlement()).toMatchObject({
      plan_id: "agency",
      provider_subscription_id: "sub_2",
    });
  });

  it("ignores a stale re-read of the same subscription", async () => {
    await grantLive();
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_stale");
    expect(
      await apply({
        fence,
        event: "evt_stale",
        planId: "starter",
        observedAt: iso(-60_000),
      }),
    ).toBe("stale_ignored");
    expect(await projection()).toMatchObject({ plan_id: "pro" });
    expect(await entitlement()).toMatchObject({ plan_id: "pro" });
    expect(await receiptStatus("evt_stale")).toMatchObject({ status: "ignored" });
  });

  it("refuses a replacement claim when the user has no current subscription", async () => {
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_1");
    expect(await apply({ fence, replaces: "sub_ghost" })).toBe("superseded_ignored");
    expect(await projection()).toBeUndefined();
    expect(await entitlement()).toBeUndefined();
  });

  it("keeps an unmapped customer retryable without granting anything", async () => {
    const fence = await lease("holder-a");
    await record("evt_1");
    expect(await apply({ fence, customer: "cus_unknown" })).toBe("unknown_customer");
    expect(await receiptStatus()).toMatchObject({ status: "uncertain" });
    expect(await entitlement()).toBeUndefined();
    expect(await projection()).toBeUndefined();
  });

  it("isolates users and accounts: a mapping in another account is not ownership", async () => {
    await map("cus_live", user, "live", OTHER_ACCOUNT);
    const fence = await lease("holder-a");
    await record("evt_1");
    expect(await apply({ fence })).toBe("unknown_customer");
    await map("cus_live", second);
    const fence2 = await lease("holder-a");
    await record("evt_2");
    expect(await apply({ fence: fence2, event: "evt_2", observedAt: iso(10) })).toBe(
      "applied_grant",
    );
    expect(await entitlement(user)).toBeUndefined();
    expect(await entitlement(second)).toMatchObject({ plan_id: "pro", status: "active" });
  });
});

describe("server-side ownership lookups", () => {
  it("returns ownership and the stored projection for a mapped customer only", async () => {
    const projectionFor = (customer: string, mode = "live", account = ACCOUNT) =>
      db.query<Record<string, unknown>>(
        "SELECT user_id,subscription_id,plan_id,status FROM public.stripe_customer_projection($1,$2,$3)",
        [account, mode, customer],
      );
    expect((await projectionFor("cus_live")).rows).toHaveLength(0);
    await map("cus_live");
    expect((await projectionFor("cus_live")).rows).toEqual([
      { user_id: user, subscription_id: null, plan_id: null, status: null },
    ]);
    await grantLive({ planId: "growth" });
    expect((await projectionFor("cus_live")).rows).toEqual([
      { user_id: user, subscription_id: "sub_1", plan_id: "growth", status: "active" },
    ]);
    // Another account or the other mode is not ownership.
    expect((await projectionFor("cus_live", "test")).rows).toHaveLength(0);
    expect((await projectionFor("cus_live", "live", OTHER_ACCOUNT)).rows).toHaveLength(0);
    await expect(projectionFor("cus_live", "sandbox")).rejects.toThrow(
      /stripe_customer_unavailable/,
    );
  });

  it("returns only the caller's own customer mapping and refuses to repoint it", async () => {
    const own = async (owner = user, mode = "live") =>
      (
        await db.query<{ customer: string | null }>(
          "SELECT public.stripe_owner_customer($1,$2,$3) AS customer",
          [owner, ACCOUNT, mode],
        )
      ).rows[0].customer;
    expect(await own()).toBeNull();
    await map("cus_live");
    expect(await own()).toBe("cus_live");
    expect(await own(second)).toBeNull();
    expect(await own(user, "test")).toBeNull();
    await expect(map("cus_other")).rejects.toThrow(/stripe_customer_conflict/);
    expect(await own()).toBe("cus_live");
  });
});

/* ------------------------ leases, receipts, replay ---------------------- */

describe("fenced lease and durable receipts", () => {
  it("reclaims an expired lease and fences out the previous holder", async () => {
    const first = await lease("holder-a", "live", 1);
    await db.query(
      "UPDATE public.stripe_account_leases SET leased_until=now()-interval '1 second'",
    );
    await expect(lease("holder-b", "live", 30)).resolves.toBe(first + 1);
    await map("cus_live");
    await record("evt_1");
    // The crashed holder's late write loses on both holder and fence.
    await expect(apply({ holder: "holder-a", fence: first })).rejects.toThrow(/stripe_lease_lost/);
    await expect(apply({ holder: "holder-b", fence: first })).rejects.toThrow(/stripe_lease_lost/);
    expect(await receiptStatus()).toMatchObject({ status: "pending" });
    expect(await apply({ holder: "holder-b", fence: first + 1 })).toBe("applied_grant");
  });

  it("refuses an overlapping holder while the lease is live, then after release", async () => {
    const fence = await lease("holder-a");
    await expect(lease("holder-b")).rejects.toThrow(/stripe_lease_held/);
    expect(await lease("holder-a")).toBe(fence + 1);
    await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-b',$2)", [
      ACCOUNT,
      fence + 1,
    ]);
    // A non-holder cannot release, so holder-a still owns it.
    await expect(lease("holder-b")).rejects.toThrow(/stripe_lease_held/);
    await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-a',$2)", [
      ACCOUNT,
      fence + 1,
    ]);
    expect(await lease("holder-b")).toBe(fence + 2);
    // A released lease is not live, so even the right fence cannot write.
    await map("cus_live");
    await record("evt_1");
    await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-b',$2)", [
      ACCOUNT,
      fence + 2,
    ]);
    await expect(apply({ holder: "holder-b", fence: fence + 2 })).rejects.toThrow(
      /stripe_lease_lost/,
    );
  });

  it("separates leases per account and per mode", async () => {
    await lease("holder-a", "live");
    await expect(lease("holder-b", "test")).resolves.toBe(1);
    await expect(lease("holder-b", "live", 30, OTHER_ACCOUNT)).resolves.toBe(1);
    await expect(lease("holder-b", "live")).rejects.toThrow(/stripe_lease_held/);
  });

  it("rejects malformed lease and receipt input", async () => {
    await expect(lease("holder-a", "live", 0)).rejects.toThrow(/stripe_lease_unavailable/);
    await expect(lease("holder-a", "live", 301)).rejects.toThrow(/stripe_lease_unavailable/);
    await expect(lease("", "live", 30)).rejects.toThrow(/stripe_lease_unavailable/);
    await expect(
      db.query("SELECT public.stripe_claim_account_lease($1,'sandbox','holder-a',30)", [ACCOUNT]),
    ).rejects.toThrow(/stripe_lease_unavailable/);
    await expect(record("")).rejects.toThrow(/stripe_receipt_unavailable/);
    await expect(record("evt_1", { fingerprint: "" })).rejects.toThrow(
      /stripe_receipt_unavailable/,
    );
  });

  it("distinguishes a new event, an uncompleted retry, a completed ack and a changed body", async () => {
    expect((await record("evt_1")).rows[0].result).toBe("recorded");
    // Still pending: a redelivery after a crash must be PROCESSED again.
    expect((await record("evt_1")).rows[0].result).toBe("retry");
    expect((await receiptStatus()).attempts).toBe(1);
    await expect(record("evt_1", { fingerprint: "b".repeat(64) })).rejects.toThrow(
      /stripe_receipt_conflict/,
    );
    await map("cus_live");
    const fence = await lease("holder-a");
    expect(await apply({ fence })).toBe("applied_grant");
    // Lost acknowledgment after the commit: the redelivery is safe to ack.
    expect((await record("evt_1")).rows[0].result).toBe("completed");
    await expect(apply({ fence })).rejects.toThrow(/stripe_receipt_settled/);
  });

  it("stops automatic re-attempts at the bounded limit without discarding the receipt", async () => {
    await record("evt_1");
    await db.query(
      "UPDATE public.stripe_webhook_receipts SET attempts=public.stripe_receipt_attempt_limit(), status='uncertain'",
    );
    expect((await record("evt_1")).rows[0].result).toBe("exhausted");
    expect(await claimReplay()).toHaveLength(0);
    expect(await receiptStatus()).toMatchObject({ status: "uncertain" });
  });

  it("never writes without a durable receipt for this exact event", async () => {
    await map("cus_live");
    const fence = await lease("holder-a");
    await expect(apply({ fence })).rejects.toThrow(/stripe_receipt_missing/);
    // A receipt for the same event id in the OTHER mode does not authorise a live apply.
    await record("evt_1", { mode: "test" });
    await expect(apply({ fence })).rejects.toThrow(/stripe_receipt_missing/);
    expect(await projection()).toBeUndefined();
    expect(await entitlement()).toBeUndefined();
  });

  it("rolls the whole transaction back when any step fails", async () => {
    await grantLive();
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_bad");
    // An out-of-range seat count hits the projection CHECK after the lease,
    // receipt and grant-verification steps have already passed.
    await expect(
      apply({ fence, event: "evt_bad", seats: 5000, observedAt: iso(5000) }),
    ).rejects.toThrow(/seat_quantity|violates check constraint/);
    expect(await receiptStatus("evt_bad")).toMatchObject({ status: "pending" });
    expect(await projection()).toMatchObject({ subscription_id: "sub_1", plan_id: "pro" });
    expect(await entitlement()).toMatchObject({ plan_id: "pro", status: "active" });
  });
});

describe("bounded replay after a failed provider read or a crash", () => {
  it("re-attempts an uncertain receipt and completes it to applied", async () => {
    await map("cus_live");
    // Delivery 1: the authoritative provider read failed → uncertain, no write.
    await record("evt_1");
    const failed = await lease("holder-failed");
    expect(await finish("evt_1", "uncertain", "holder-failed", failed)).toBe(true);
    await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-failed',$2)", [
      ACCOUNT,
      failed,
    ]);
    expect(await receiptStatus()).toMatchObject({ status: "uncertain" });
    expect(await entitlement()).toBeUndefined();

    // Replay claims the retained identifiers needed to re-fetch the object.
    const claimed = await db.query<{
      event_id: string;
      event_type: string;
      object_id: string;
      event_created: string;
      attempts: number;
    }>(
      `SELECT event_id,event_type,object_id,event_created::text AS event_created,attempts
         FROM public.stripe_claim_replay_receipt($1,'live')`,
      [ACCOUNT],
    );
    expect(claimed.rows).toEqual([
      {
        event_id: "evt_1",
        event_type: "customer.subscription.updated",
        object_id: "sub_fixture",
        event_created: "1000",
        attempts: 1,
      },
    ]);
    const fence = await lease("holder-replay");
    expect(await apply({ holder: "holder-replay", fence })).toBe("applied_grant");
    expect(await receiptStatus()).toMatchObject({ status: "applied" });
    expect(await entitlement()).toMatchObject({ plan_id: "pro", status: "active" });
    // Settled receipts are no longer claimable.
    expect(await claimReplay()).toHaveLength(0);
  });

  it("recovers a receipt left pending by a crash between claim and apply", async () => {
    await map("cus_live");
    await record("evt_1");
    await lease("holder-crashed", "live", 1); // crash: never applied, never released
    await expireLease();
    expect(await claimReplay()).toHaveLength(1);
    const fence = await lease("holder-replay");
    expect(await apply({ holder: "holder-replay", fence })).toBe("applied_grant");
  });

  it("charges exactly one attempt per claim and leaves unclaimed receipts alone", async () => {
    for (let n = 1; n <= 3; n++) await record(`evt_${n}`, { object: `sub_${n}` });
    // One claim = one receipt = one attempt. A batch claim would charge an
    // attempt to receipts that nothing ever processed.
    expect(await claimReplay()).toEqual([{ event_id: "evt_1", attempts: 1 }]);
    expect(await allAttempts()).toEqual([
      { event_id: "evt_1", attempts: 1 },
      { event_id: "evt_2", attempts: 0 },
      { event_id: "evt_3", attempts: 0 },
    ]);
    // A claim that EXCLUDES it moves on to the next oldest and charges only
    // that one; the skipped receipt is not read, locked or charged.
    expect(await claimReplay(ACCOUNT, "live", ["evt_1"])).toEqual([
      { event_id: "evt_2", attempts: 1 },
    ]);
    expect(await allAttempts()).toEqual([
      { event_id: "evt_1", attempts: 1 },
      { event_id: "evt_2", attempts: 1 },
      { event_id: "evt_3", attempts: 0 },
    ]);
    // Without an exclusion the oldest retryable receipt is claimed again — that
    // is correct for a LATER invocation, and it is exactly why one invocation
    // must pass its own exclusion set rather than relying on the ordering.
    expect((await claimReplay())[0]).toEqual({ event_id: "evt_1", attempts: 2 });
  });

  it("gives each receipt at most one turn per invocation (reproduced starvation)", async () => {
    await record("evt_old", { object: "sub_old" });
    await db.query(
      "UPDATE public.stripe_webhook_receipts SET received_at=now()-interval '1 hour' WHERE event_id='evt_old'",
    );
    await record("evt_new", { object: "sub_new" });

    // The reproduction: four passes with no exclusion spend the whole run on
    // evt_old, charging it attempts 1..4, while evt_new never gets a turn.
    for (let pass = 1; pass <= 4; pass++)
      expect((await claimReplay())[0]).toEqual({ event_id: "evt_old", attempts: pass });
    expect(await allAttempts()).toEqual([
      { event_id: "evt_new", attempts: 0 },
      { event_id: "evt_old", attempts: 4 },
    ]);

    // The correction: an invocation that has already processed evt_old excludes
    // it, so the newer pending row is next and each row is charged once.
    await db.exec("TRUNCATE public.stripe_webhook_receipts");
    await record("evt_old", { object: "sub_old" });
    await db.query(
      "UPDATE public.stripe_webhook_receipts SET received_at=now()-interval '1 hour' WHERE event_id='evt_old'",
    );
    await record("evt_new", { object: "sub_new" });
    expect((await claimReplay())[0]).toEqual({ event_id: "evt_old", attempts: 1 });
    expect((await claimReplay(ACCOUNT, "live", ["evt_old"]))[0]).toEqual({
      event_id: "evt_new",
      attempts: 1,
    });
    // Both have had their turn: this invocation has nothing left to claim, and
    // it stops instead of looping back onto either of them.
    expect(await claimReplay(ACCOUNT, "live", ["evt_old", "evt_new"])).toHaveLength(0);
    expect(await allAttempts()).toEqual([
      { event_id: "evt_new", attempts: 1 },
      { event_id: "evt_old", attempts: 1 },
    ]);
  });

  it("lets a LATER invocation complete the receipt a transient failure left behind", async () => {
    await map("cus_live");
    await record("evt_old");
    await db.query(
      "UPDATE public.stripe_webhook_receipts SET received_at=now()-interval '1 hour' WHERE event_id='evt_old'",
    );
    await record("evt_new", { object: "sub_new" });
    // Invocation 1: both receipts get one turn and both stay uncertain.
    expect((await claimReplay())[0].event_id).toBe("evt_old");
    const failed = await lease("holder-failed");
    expect(await finish("evt_old", "uncertain", "holder-failed", failed)).toBe(true);
    expect((await claimReplay(ACCOUNT, "live", ["evt_old"]))[0].event_id).toBe("evt_new");
    expect(await finish("evt_new", "uncertain", "holder-failed", failed)).toBe(true);
    await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-failed',$2)", [
      ACCOUNT,
      failed,
    ]);

    // Invocation 2 starts with an empty exclusion set: the receipt is retried
    // with its own fresh fenced lease, far from the attempt limit, and applies.
    expect(await claimReplay(ACCOUNT, "live", [])).toEqual([{ event_id: "evt_old", attempts: 2 }]);
    const fence = await lease("holder-replay");
    expect(await apply({ holder: "holder-replay", fence, event: "evt_old" })).toBe("applied_grant");
    expect(await receiptStatus("evt_old")).toMatchObject({ status: "applied", attempts: 2 });
    expect(Number((await receiptStatus("evt_new")).attempts)).toBeLessThan(
      Number(
        (await db.query<{ limit: number }>("SELECT public.stripe_receipt_attempt_limit() AS limit"))
          .rows[0].limit,
      ),
    );
    // A settled receipt is no longer claimable, excluded or not.
    expect(await claimReplay(ACCOUNT, "live", ["evt_new"])).toHaveLength(0);
  });

  it("validates the exclusion set instead of trusting it", async () => {
    await record("evt_1");
    for (const bad of [
      ["evt_1", "evt_1"],
      [""],
      [null],
      Array.from({ length: 26 }, (_, n) => `evt_x${n}`),
    ])
      await expect(claimReplay(ACCOUNT, "live", bad)).rejects.toThrow(
        /stripe_replay_exclusion_invalid/,
      );
    // A refused call claimed nothing and charged nothing.
    expect(await receiptStatus()).toMatchObject({ status: "pending", attempts: 0 });
    // The bound is exactly the replay exclusion limit, and the limit is 25.
    expect(
      Number(
        (
          await db.query<{ limit: number }>(
            "SELECT public.stripe_replay_exclusion_limit() AS limit",
          )
        ).rows[0].limit,
      ),
    ).toBe(25);
    expect(
      await claimReplay(
        ACCOUNT,
        "live",
        Array.from({ length: 25 }, (_, n) => `evt_x${n}`),
      ),
    ).toEqual([{ event_id: "evt_1", attempts: 1 }]);
  });

  it("keeps the exclusion scoped to this account and mode", async () => {
    await record("evt_same");
    await record("evt_same", { mode: "test" });
    await record("evt_same", { account: OTHER_ACCOUNT });
    // Excluding the id hides only this account/mode's row...
    expect(await claimReplay(ACCOUNT, "live", ["evt_same"])).toHaveLength(0);
    // ... the same id in the other mode or another account is untouched.
    expect((await claimReplay(ACCOUNT, "test"))[0]).toEqual({
      event_id: "evt_same",
      attempts: 1,
    });
    expect((await claimReplay(OTHER_ACCOUNT, "live"))[0]).toEqual({
      event_id: "evt_same",
      attempts: 1,
    });
    expect((await receiptStatus("evt_same")).attempts).toBe(0);
    await expect(claimReplay(ACCOUNT, "sandbox", ["evt_same"])).rejects.toThrow(
      /stripe_replay_unavailable/,
    );
  });

  it("scopes the replay claim and rejects malformed scope", async () => {
    await record("evt_live_1");
    await record("evt_test_1", { mode: "test" });
    await record("evt_other_1", { account: OTHER_ACCOUNT });
    const ids = async (account: string, mode: string) =>
      (await claimReplay(account, mode)).map((row) => row.event_id);
    expect(await ids(ACCOUNT, "live")).toEqual(["evt_live_1"]);
    expect(await ids(ACCOUNT, "test")).toEqual(["evt_test_1"]);
    expect(await ids(OTHER_ACCOUNT, "live")).toEqual(["evt_other_1"]);
    await expect(ids(ACCOUNT, "sandbox")).rejects.toThrow(/stripe_replay_unavailable/);
    await expect(ids("", "live")).rejects.toThrow(/stripe_replay_unavailable/);
  });

  it("stops claiming once a receipt reaches the attempt limit", async () => {
    await record("evt_1");
    await db.query(
      "UPDATE public.stripe_webhook_receipts SET attempts=public.stripe_receipt_attempt_limit()-1",
    );
    expect(await claimReplay()).toHaveLength(1);
    expect(await claimReplay()).toHaveLength(0);
    // Not discarded: the receipt is still there for an operator.
    expect(await receiptStatus()).toMatchObject({ status: "pending" });
  });

  it("stores no raw event or payment data", async () => {
    await record("evt_1");
    expect(
      (
        await db.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='stripe_webhook_receipts'
            ORDER BY column_name`,
        )
      ).rows.map((row) => row.column_name),
    ).toEqual([
      "account_id",
      "applied_at",
      "attempts",
      "event_created",
      "event_id",
      "event_type",
      "fingerprint",
      "mode",
      "object_id",
      "received_at",
      "status",
    ]);
  });
});

/* ------------------------- checkout request state ----------------------- */

describe("durable checkout/portal request idempotency", () => {
  const request = "00000000-0000-4000-8000-0000000000aa";
  const other = "00000000-0000-4000-8000-0000000000bb";
  const claim = (
    opts: {
      request?: string;
      owner?: string;
      account?: string;
      mode?: string;
      kind?: string;
      fingerprint?: string;
    } = {},
  ) =>
    db.query<{ status: string; session_id: string | null }>(
      "SELECT status,session_id FROM public.stripe_claim_checkout_request($1,$2,$3,$4,$5,$6)",
      [
        opts.request ?? request,
        opts.owner ?? user,
        opts.account ?? ACCOUNT,
        opts.mode ?? "test",
        opts.kind ?? "checkout",
        opts.fingerprint ?? "fp-pro-1-seat",
      ],
    );

  it("resumes the identical request and refuses any changed parameter", async () => {
    expect((await claim()).rows[0]).toEqual({ status: "pending", session_id: null });
    expect((await claim()).rows[0]).toEqual({ status: "pending", session_id: null });
    for (const changed of [
      { owner: second },
      { account: OTHER_ACCOUNT },
      { mode: "live" },
      { kind: "portal" },
      { fingerprint: "fp-agency-9-seats" },
    ])
      await expect(claim(changed)).rejects.toThrow(/stripe_checkout_mismatch/);
    await expect(claim({ mode: "sandbox" })).rejects.toThrow(/stripe_checkout_unavailable/);
  });

  it("keeps a successfully created session OPEN so no second checkout can start", async () => {
    await claim();
    expect(
      (
        await db.query<{ opened: boolean }>(
          "SELECT public.stripe_open_checkout_request($1,$2,$3,'test','checkout','cs_test_1') AS opened",
          [request, user, ACCOUNT],
        )
      ).rows[0].opened,
    ).toBe(true);
    expect((await claim()).rows[0]).toEqual({ status: "open", session_id: "cs_test_1" });
    // A different requestId (another tab, a re-navigation) cannot open a second one.
    await expect(claim({ request: other })).rejects.toThrow(/stripe_checkout_open/);
    // A different session id cannot overwrite the open session.
    expect(
      (
        await db.query<{ opened: boolean }>(
          "SELECT public.stripe_open_checkout_request($1,$2,$3,'test','checkout','cs_test_other') AS opened",
          [request, user, ACCOUNT],
        )
      ).rows[0].opened,
    ).toBe(false);
  });

  it("frees the slot only on terminal settlement and fences the settler", async () => {
    await claim();
    const settle = (status: string, owner = user, mode = "test") =>
      db.query<{ done: boolean }>(
        "SELECT public.stripe_settle_checkout_request($1,$2,$3,$4,'checkout',$5) AS done",
        [request, owner, ACCOUNT, mode, status],
      );
    expect((await settle("failed", second)).rows[0].done).toBe(false);
    expect((await settle("failed", user, "live")).rows[0].done).toBe(false);
    await expect(settle("pending")).rejects.toThrow(/stripe_checkout_unavailable/);
    expect((await settle("failed")).rows[0].done).toBe(true);
    expect((await settle("completed")).rows[0].done).toBe(false);
    expect((await claim()).rows[0].status).toBe("failed");
    // The owner may now start a fresh request with different parameters.
    expect((await claim({ request: other, fingerprint: "fp-agency-2" })).rows[0].status).toBe(
      "pending",
    );
  });

  it("separates checkout from portal and one owner from another", async () => {
    await claim();
    expect((await claim({ request: other, kind: "portal" })).rows[0].status).toBe("pending");
    expect(
      (await claim({ request: "00000000-0000-4000-8000-0000000000cc", owner: second })).rows[0]
        .status,
    ).toBe("pending");
  });
});

/* ---------------- independent grant verification (adversarial) ---------- */

describe("the database re-derives the grant instead of trusting p_grants", () => {
  /** A caller that asserts `grants: true` next to evidence that does not
   * support it — the exact shape of a compromised or buggy worker. */
  const forge = async (opts: ApplyOpts, event = "evt_forge") => {
    await map("cus_live");
    const fence = await lease("holder-forge");
    await record(event);
    const result = await apply({
      holder: "holder-forge",
      fence,
      event,
      grants: true,
      observedAt: iso(5000),
      ...opts,
    });
    await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-forge',$2)", [
      ACCOUNT,
      fence,
    ]);
    return result;
  };

  it.each([
    ["a canceled subscription", { status: "canceled" }],
    ["an unpaid latest invoice", { invoicePaid: false }],
    ["no billing period at all", { periodEnd: null }],
    ["an elapsed billing period", { periodEnd: PAST() }],
    ["an infinite billing period", { periodEnd: "infinity" }],
    ["an implausibly distant period", { periodEnd: iso(10 * 365 * 24 * 3600 * 1000) }],
    ["a plan that is not sellable", { planId: "freePreview" }],
    ["a non-granting past_due status", { status: "past_due" }],
    ["an unrecognised status", { status: "hibernating" }],
  ])("refuses a forged grant with %s", async (_label, opts) => {
    expect(await forge(opts as ApplyOpts)).toBe("grant_unverified");
    // Nothing at all was written, and the receipt is still retryable.
    expect(await entitlement()).toBeUndefined();
    expect(await projection()).toBeUndefined();
    expect(await receiptStatus("evt_forge")).toMatchObject({ status: "uncertain" });
  });

  it("cannot RESTORE access that was already revoked", async () => {
    await grantLive();
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_cancel");
    expect(
      await apply({
        fence,
        event: "evt_cancel",
        status: "canceled",
        grants: false,
        invoicePaid: false,
        periodEnd: null,
        observedAt: iso(1000),
      }),
    ).toBe("applied_no_grant");
    expect(await entitlement()).toMatchObject({ plan_id: "freePreview", status: "cancelled" });
    await db.query("SELECT public.stripe_release_account_lease($1,'live','holder-a',$2)", [
      ACCOUNT,
      fence,
    ]);
    // A forged "it is active again" with canceled evidence restores nothing.
    expect(await forge({ status: "canceled" }, "evt_restore")).toBe("grant_unverified");
    expect(await entitlement()).toMatchObject({ plan_id: "freePreview", status: "cancelled" });
  });

  it("cannot EXTEND an existing period with an elapsed or absent one", async () => {
    await grantLive();
    const before = await entitlement();
    expect(await forge({ periodEnd: PAST() }, "evt_extend")).toBe("grant_unverified");
    expect(await forge({ periodEnd: null }, "evt_extend_2")).toBe("grant_unverified");
    expect(await entitlement()).toEqual(before);
    expect(await projection()).toMatchObject({ subscription_id: "sub_1", plan_id: "pro" });
  });

  it("keeps a live entitlement safe from a forged TEST-mode grant", async () => {
    await grantLive();
    await map("cus_test", user, "test");
    const fence = await lease("holder-test", "test");
    await record("evt_test", { mode: "test", object: "sub_test" });
    expect(
      await apply({
        mode: "test",
        holder: "holder-test",
        fence,
        event: "evt_test",
        customer: "cus_test",
        subscription: "sub_test",
        status: "canceled",
        grants: true,
      }),
    ).toBe("grant_unverified");
    expect(await entitlement()).toMatchObject({ plan_id: "pro", status: "active" });
    expect(await projection(user, "test")).toBeUndefined();
  });

  it.each([
    ["past_due", "pastDue"],
    ["unpaid", "cancelled"],
    ["canceled", "cancelled"],
    ["incomplete_expired", "cancelled"],
    ["paused", "freePreview"],
    ["incomplete", "freePreview"],
  ])("revokes an explicit non-granting %s state", async (status, expected) => {
    await grantLive();
    await map("cus_live");
    const fence = await lease("holder-a");
    await record(`evt_${status}`);
    expect(
      await apply({
        fence,
        event: `evt_${status}`,
        status,
        grants: false,
        invoicePaid: false,
        periodEnd: null,
        observedAt: iso(1000),
      }),
    ).toBe("applied_no_grant");
    expect(await entitlement()).toMatchObject({ plan_id: "freePreview", status: expected });
  });

  it("changes no entitlement for a status whose meaning is unknown", async () => {
    await grantLive();
    await map("cus_live");
    const fence = await lease("holder-a");
    await record("evt_weird");
    expect(
      await apply({
        fence,
        event: "evt_weird",
        status: "hibernating",
        grants: false,
        invoicePaid: false,
        periodEnd: null,
        observedAt: iso(1000),
      }),
    ).toBe("revoke_not_applicable");
    // The projection mirrors the provider, but access is neither granted nor
    // taken away on the strength of a status nobody understands.
    expect(await projection()).toMatchObject({ status: "hibernating" });
    expect(await entitlement()).toMatchObject({ plan_id: "pro", status: "active" });
  });
});

/* ------------- lease wall clock and non-stale acknowledgement ----------- */

describe("lease liveness is judged by the wall clock, not transaction start", () => {
  it("refuses an expired holder's apply and its terminal acknowledgement", async () => {
    await map("cus_live");
    await record("evt_1");
    const stale = await lease("holder-stale");
    await expireLease();
    const fresh = await lease("holder-fresh");
    expect(fresh).toBe(stale + 1);

    // The expired holder can neither write nor acknowledge.
    await expect(apply({ holder: "holder-stale", fence: stale })).rejects.toThrow(
      /stripe_lease_lost/,
    );
    await expect(finish("evt_1", "ignored", "holder-stale", stale)).rejects.toThrow(
      /stripe_lease_lost/,
    );
    await expect(finish("evt_1", "applied", "holder-stale", fresh)).rejects.toThrow(
      /stripe_lease_lost/,
    );
    // The receipt the new worker owns is untouched and still processable.
    expect(await receiptStatus()).toMatchObject({ status: "pending" });
    expect(await apply({ holder: "holder-fresh", fence: fresh })).toBe("applied_grant");
  });

  it("renews only a lease this holder still owns, without advancing the fence", async () => {
    const fence = await lease("holder-a", "live", 1);
    expect(await renew("holder-a", fence, 60)).toBe(true);
    expect(await renew("holder-b", fence, 60)).toBe(false);
    expect(await renew("holder-a", fence + 1, 60)).toBe(false);
    expect(
      Number(
        (
          await db.query<{ fence: string }>(
            "SELECT fence::text AS fence FROM public.stripe_account_leases WHERE account_id=$1 AND mode='live'",
            [ACCOUNT],
          )
        ).rows[0].fence,
      ),
    ).toBe(fence);
    // An expired lease is dead: renewal cannot resurrect it, and the reclaiming
    // holder's lease cannot be stolen by the old one either.
    await expireLease();
    expect(await renew("holder-a", fence, 60)).toBe(false);
    const next = await lease("holder-b");
    expect(await renew("holder-a", fence, 60)).toBe(false);
    expect(await renew("holder-b", next, 60)).toBe(true);
    for (const ttl of [0, 301])
      await expect(renew("holder-b", next, ttl)).rejects.toThrow(/stripe_lease_unavailable/);
  });
});

/* ------------- fenced requests and authoritative settlement ------------- */

describe("ambiguous checkout attempts stay fenced, not failed", () => {
  const request = "00000000-0000-4000-8000-0000000000aa";
  const other = "00000000-0000-4000-8000-0000000000bb";
  const claim = (req = request, owner = user, fingerprint = "fp-pro") =>
    db.query<{ status: string; session_id: string | null }>(
      "SELECT status,session_id FROM public.stripe_claim_checkout_request($1,$2,$3,'test','checkout',$4)",
      [req, owner, ACCOUNT, fingerprint],
    );
  const fence = async (req = request, owner = user) =>
    (
      await db.query<{ done: boolean }>(
        "SELECT public.stripe_fence_checkout_request($1,$2,$3,'test','checkout') AS done",
        [req, owner, ACCOUNT],
      )
    ).rows[0].done;
  const read = async (req = request, owner = user) =>
    (
      await db.query<{ status: string; session_id: string | null }>(
        "SELECT status,session_id FROM public.stripe_read_checkout_request($1,$2,$3,'test','checkout')",
        [req, owner, ACCOUNT],
      )
    ).rows;
  const settle = (status: string, session: string | null = null, req = request, owner = user) =>
    db.query<{ done: boolean }>(
      "SELECT public.stripe_settle_checkout_request($1,$2,$3,'test','checkout',$4,$5) AS done",
      [req, owner, ACCOUNT, status, session],
    );

  it("keeps the unique slot held so no new request id can start a second checkout", async () => {
    await claim();
    expect(await fence()).toBe(true);
    expect((await read())[0]).toEqual({ status: "fenced", session_id: null });
    // The slot is still taken: a fresh request id cannot open a second one.
    await expect(claim(other, user, "fp-agency")).rejects.toThrow(/stripe_checkout_open/);
    // The identical request resumes as fenced rather than as a new attempt.
    expect((await claim()).rows[0]).toEqual({ status: "fenced", session_id: null });
    // Another owner is unaffected.
    expect((await claim("00000000-0000-4000-8000-0000000000cc", second)).rows[0].status).toBe(
      "pending",
    );
  });

  it("lets authoritative recovery adopt a session or fail the request", async () => {
    await claim();
    await fence();
    // Recovery found the session: the fenced request becomes open again.
    expect(
      (
        await db.query<{ opened: boolean }>(
          "SELECT public.stripe_open_checkout_request($1,$2,$3,'test','checkout','cs_test_1') AS opened",
          [request, user, ACCOUNT],
        )
      ).rows[0].opened,
    ).toBe(true);
    expect((await read())[0]).toEqual({ status: "open", session_id: "cs_test_1" });
    // A settlement must name the session the decision was made from.
    expect((await settle("expired", "cs_test_other")).rows[0].done).toBe(false);
    expect((await settle("expired", "cs_test_1")).rows[0].done).toBe(true);
    expect((await read())[0].status).toBe("expired");
  });

  it("fails a fenced request only when recovery proved no session exists", async () => {
    await claim();
    await fence();
    expect((await settle("failed")).rows[0].done).toBe(true);
    expect((await read())[0].status).toBe("failed");
    // The slot is free again for a genuinely new attempt.
    expect((await claim(other, user, "fp-agency")).rows[0].status).toBe("pending");
  });

  it("scopes reads and settlements to the owning user, account, mode and kind", async () => {
    await claim();
    expect(await read(request, second)).toHaveLength(0);
    expect((await settle("failed", null, request, second)).rows[0].done).toBe(false);
    expect(await fence(request, second)).toBe(false);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM public.stripe_read_checkout_request($1,$2,$3,'test','portal')",
          [request, user, ACCOUNT],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("SELECT public.stripe_read_checkout_request($1,$2,$3,'sandbox','checkout')", [
        request,
        user,
        ACCOUNT,
      ]),
    ).rejects.toThrow(/stripe_checkout_unavailable/);
  });

  it("settles a completed checkout atomically with the projection", async () => {
    const liveClaim = () =>
      db.query(
        "SELECT status FROM public.stripe_claim_checkout_request($1,$2,$3,'live','checkout','fp')",
        [request, user, ACCOUNT],
      );
    await liveClaim();
    await db.query(
      "SELECT public.stripe_open_checkout_request($1,$2,$3,'live','checkout','cs_live_1')",
      [request, user, ACCOUNT],
    );
    await map("cus_live");
    const fenceToken = await lease("holder-a");
    await record("evt_session");
    // A session id or owner that does not match settles nothing.
    expect(
      await apply({
        fence: fenceToken,
        event: "evt_session",
        sessionRequest: request,
        sessionId: "cs_live_other",
      }),
    ).toBe("applied_grant");
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM public.stripe_read_checkout_request($1,$2,$3,'live','checkout')",
          [request, user, ACCOUNT],
        )
      ).rows[0].status,
    ).toBe("open");

    await record("evt_session_2");
    expect(
      await apply({
        fence: fenceToken,
        event: "evt_session_2",
        sessionRequest: request,
        sessionId: "cs_live_1",
        observedAt: iso(1000),
      }),
    ).toBe("applied_grant");
    expect(
      (
        await db.query<{ status: string; completed_at: string | null }>(
          `SELECT status, completed_at::text AS completed_at
             FROM public.stripe_checkout_requests WHERE request_id=$1`,
          [request],
        )
      ).rows[0],
    ).toMatchObject({ status: "completed" });
    expect(await receiptStatus("evt_session_2")).toMatchObject({ status: "applied" });
  });

  it("expires only the exact mapped request/session, under a live lease", async () => {
    await db.query(
      "SELECT status FROM public.stripe_claim_checkout_request($1,$2,$3,'live','checkout','fp')",
      [request, user, ACCOUNT],
    );
    await db.query(
      "SELECT public.stripe_open_checkout_request($1,$2,$3,'live','checkout','cs_live_1')",
      [request, user, ACCOUNT],
    );
    const expire = (session: string, holder: string, token: number, owner = user, req = request) =>
      db.query<{ done: boolean }>(
        "SELECT public.stripe_expire_checkout_session($1,$2,$3,'live',$4,$5,$6) AS done",
        [req, owner, ACCOUNT, session, holder, token],
      );
    const token = await lease("holder-a");
    expect((await expire("cs_live_other", "holder-a", token)).rows[0].done).toBe(false);
    expect((await expire("cs_live_1", "holder-a", token, second)).rows[0].done).toBe(false);
    expect((await expire("cs_live_1", "holder-a", token, user, other)).rows[0].done).toBe(false);
    // A stale holder cannot release anyone's slot.
    await expireLease();
    await expect(expire("cs_live_1", "holder-a", token)).rejects.toThrow(/stripe_lease_lost/);
    const fresh = await lease("holder-fresh");
    expect((await expire("cs_live_1", "holder-fresh", fresh)).rows[0].done).toBe(true);
  });
});

/* ------------------------------ seat reads ------------------------------ */

describe("purchased working seats come only from a live, owned, current projection", () => {
  const purchase = async (seats = 3) => {
    await grantLive({ seats });
    return seats;
  };

  it("reports the live projection's seat quantity when the entitlement owns it", async () => {
    await purchase(3);
    expect(await seats()).toBe(3);
  });

  it("reports zero for every unowned, lapsed, unpaid or manual case", async () => {
    expect(await seats()).toBe(0); // no projection at all
    await purchase(4);
    expect(await seats()).toBe(4);

    const cases: Array<[string, string]> = [
      [
        "lapsed subscription period",
        `UPDATE public.stripe_subscriptions SET current_period_end='${PAST()}'`,
      ],
      [
        "missing subscription period",
        "UPDATE public.stripe_subscriptions SET current_period_end=NULL",
      ],
      ["unpaid latest invoice", "UPDATE public.stripe_subscriptions SET latest_invoice_paid=false"],
      ["non-current status", "UPDATE public.stripe_subscriptions SET status='past_due'"],
      ["test-mode projection", "UPDATE public.stripe_subscriptions SET mode='test'"],
      [
        "a different owned subscription",
        "UPDATE public.entitlements SET provider_subscription_id='sub_elsewhere'",
      ],
      ["a legacy provider", "UPDATE public.entitlements SET provider='paddle'"],
      ["a manual status", "UPDATE public.entitlements SET status='manualComped'"],
      ["a plan that disagrees", "UPDATE public.entitlements SET plan_id='agency'"],
      [
        "a lapsed entitlement period",
        `UPDATE public.entitlements SET current_period_end='${PAST()}'`,
      ],
      ["a missing entitlement period", "UPDATE public.entitlements SET current_period_end=NULL"],
    ];
    for (const [label, statement] of cases) {
      await db.exec("BEGIN");
      await db.exec(statement);
      expect([label, await seats()]).toEqual([label, 0]);
      await db.exec("ROLLBACK");
      expect(await seats()).toBe(4);
    }
  });

  it("isolates seats per user", async () => {
    await purchase(5);
    expect(await seats(second)).toBe(0);
  });

  /**
   * TWO CURRENT PERIODS, stated identically on both rows (the reproduced bug).
   *
   * The earlier clause read `e.current_period_end IS NULL OR
   * e.current_period_end>now()`, so a live pro subscription with a paid invoice
   * and four extra seats paid out while the entitlement that owns it had NO
   * billing period at all. A malformed period must never widen an allowance, so
   * absent, infinite and elapsed are all 0 — on the entitlement exactly as on
   * the projection.
   */
  describe("both billing periods must be present, finite and in the future", () => {
    it.each([
      ["an absent entitlement period", "UPDATE public.entitlements SET current_period_end=NULL"],
      [
        "an infinite entitlement period",
        "UPDATE public.entitlements SET current_period_end='infinity'",
      ],
      [
        "a negatively infinite entitlement period",
        "UPDATE public.entitlements SET current_period_end='-infinity'",
      ],
      [
        "an elapsed entitlement period",
        () => `UPDATE public.entitlements SET current_period_end='${PAST()}'`,
      ],
      [
        "an absent subscription period",
        "UPDATE public.stripe_subscriptions SET current_period_end=NULL",
      ],
      [
        "an infinite subscription period",
        "UPDATE public.stripe_subscriptions SET current_period_end='infinity'",
      ],
      [
        "a negatively infinite subscription period",
        "UPDATE public.stripe_subscriptions SET current_period_end='-infinity'",
      ],
      [
        "an elapsed subscription period",
        () => `UPDATE public.stripe_subscriptions SET current_period_end='${PAST()}'`,
      ],
    ])("yields no purchased seats for %s", async (_label, statement) => {
      // A fully valid purchase first: a live pro subscription, a paid invoice,
      // four extra seats and an active Stripe entitlement that owns it.
      await purchase(4);
      expect(await seats()).toBe(4);
      await db.exec(typeof statement === "function" ? statement() : statement);
      expect(await seats()).toBe(0);
    });

    it("still requires the exact mapped ownership on top of both periods", async () => {
      await purchase(4);
      for (const statement of [
        "UPDATE public.entitlements SET provider_subscription_id='sub_elsewhere'",
        "UPDATE public.entitlements SET provider='paddle'",
        "UPDATE public.entitlements SET status='manualBeta'",
        "UPDATE public.entitlements SET plan_id='agency'",
        "UPDATE public.stripe_subscriptions SET mode='test'",
        "UPDATE public.stripe_subscriptions SET latest_invoice_paid=false",
      ]) {
        await db.exec("BEGIN");
        await db.exec(statement);
        expect([statement, await seats()]).toEqual([statement, 0]);
        await db.exec("ROLLBACK");
      }
      // Both periods current and the ownership exact: the seats are real.
      expect(await seats()).toBe(4);
    });
  });
});
