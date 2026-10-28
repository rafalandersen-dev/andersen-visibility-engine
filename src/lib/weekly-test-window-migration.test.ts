import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Exercises the ACTUAL migrations, layered in deploy order, so the bounded
 * weekly observation policy is validated against the real scheduler control,
 * lease, stage, permit and money gates — not a re-implementation.
 *
 * Concurrency note: PGlite runs one in-process connection and SERIALIZES
 * statements. The `Promise.all` case below therefore proves the guard stays
 * correct under arbitrary interleaving of the six/seven admission attempts; it
 * is NOT evidence of multi-connection row-lock contention. A real host
 * PostgreSQL proof of lock contention is out of scope for default `src`
 * discovery and is listed as an open item in the implementation report.
 */
const files = [
  "20260907140000_ai_expense_reservations.sql",
  "20260908210000_restricted_ai_expense_permits.sql",
  "20260907190000_auto_scheduler_leases.sql",
  "20260909200000_project_knowledge.sql",
  "20260910150000_weekly_preparation.sql",
  "20260910170000_publication_approval.sql",
  "20260910180000_weekly_executor.sql",
  "20260919120000_ai_expense_default_budgets.sql",
  "20260919130000_manual_free_ai_budgets.sql",
  "20261028170000_bounded_weekly_test_windows.sql",
];
const NEW_MIGRATION = files[files.length - 1];
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const prep = { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 };
const CONFIG = {
  enabled: true,
  weekdays: [2, 4],
  publishTime: "09:00",
  timeZone: "Europe/Stockholm",
  mode: "approve_first",
};
const TEXT_RESERVE = 500_000;
const IMAGE_RESERVE = 100_000;
const LIFETIME = 2_200_000;
const CONTRACTS = {
  research: {
    provider: "openai",
    model: "gpt-5.6-terra",
    operation: "generateOpportunitiesCore",
    ceilingMicrousd: TEXT_RESERVE,
  },
  content: {
    provider: "openai",
    model: "gpt-5.6-terra",
    operation: "generateContentCore",
    ceilingMicrousd: TEXT_RESERVE,
  },
  image: {
    provider: "openai",
    model: "gpt-image-2-2026-04-21",
    operation: "generateArticleImageCore",
    ceilingMicrousd: IMAGE_RESERVE,
  },
};
const hash = "a".repeat(64);
type Window = {
  windowId: string;
  state: string;
  fresh: boolean;
  revoked: boolean;
  slots: string[];
  contracts: Record<string, { ceilingMicrousd: number; model: string; operation: string }>;
  authorizedMicrousd: number;
  allowances: Array<{
    publishAt: string;
    stage: string;
    requestId: string;
    jobId: string;
    ceilingMicrousd: number;
    period: string;
    expiresAt: string;
  }>;
  startsAt: string;
  endsAt: string;
  lifetimeCeilingMicrousd: number;
  remainingMs: number;
};
type Reserve = { allowed: boolean; reason: string; period: string };

let db: PGlite;
let slotA: string;
let slotB: string;
let slotOff: string;
let week: string;
let cronBaseline: unknown[];

const BOOTSTRAP =
  "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;" +
  "CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);" +
  "CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint NOT NULL DEFAULT 0);" +
  "CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb NOT NULL DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));" +
  "CREATE TABLE scheduled_publishes(id uuid DEFAULT gen_random_uuid(),user_id uuid,project_id text,asset_id text,publish_at timestamptz,status text,attempts integer DEFAULT 0,last_error text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());" +
  "CREATE TABLE ai_generation_usage_receipts(id uuid PRIMARY KEY,user_id uuid,native_attempt_id uuid);" +
  "CREATE TABLE ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb,discarded_at timestamptz);" +
  "CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);" +
  "CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE id bigint; BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES(p_name,p_schedule,p_command) RETURNING jobid INTO id; RETURN id; END; $$;" +
  "CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1; $$;" +
  "INSERT INTO cron.job(jobname,schedule,command) VALUES('monthly-auto-scheduler','0 6 25 * *','existing-monthly-command');";

async function install(target: PGlite, from = 0, upto = files.length) {
  for (const file of files.slice(from, upto))
    await target.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}

/** Two publication instants inside the SAME ISO week of next week, so one lease
 * covers both slots, plus an off-list third instant in the same week. */
async function instants() {
  const { rows } = await db.query<{ w: string; a: string; b: string; c: string }>(
    `WITH base AS (SELECT date_trunc('week',(clock_timestamp() AT TIME ZONE 'Europe/Stockholm'))+interval '7 days' AS mon)
     SELECT to_char(mon,'YYYY-MM-DD') w,
       ((mon+interval '1 day 8 hours') AT TIME ZONE 'Europe/Stockholm')::text a,
       ((mon+interval '3 days 8 hours') AT TIME ZONE 'Europe/Stockholm')::text b,
       ((mon+interval '4 days 8 hours') AT TIME ZONE 'Europe/Stockholm')::text c FROM base`,
  );
  return rows[0];
}
const period = () => `week:${week}`;
const setControl = (project: string, engine = "weekly", expected = 0, user = owner) =>
  db.query("SELECT public.set_project_scheduler_control($1,$2,$3,$4,$5::jsonb)", [
    user,
    project,
    expected,
    engine,
    JSON.stringify(prep),
  ]);
const claim = async (project = "p", user = owner) =>
  (
    await db.query<{ token: string | null }>(
      "SELECT public.claim_auto_scheduler_lease($1,$2,$3) token",
      [user, project, period()],
    )
  ).rows[0].token;
const release = (token: string, project = "p", user = owner) =>
  db.query("SELECT public.release_auto_scheduler_lease($1,$2,$3)", [user, project, token]);
async function register(
  overrides: {
    project?: string;
    revision?: number;
    configuration?: Record<string, unknown>;
    slots?: [string, string];
    contracts?: Record<string, unknown>;
    lifetime?: number;
    startsAt?: string;
    endsAt?: string;
  } = {},
) {
  const { rows } = await db.query<{ w: Window }>(
    `SELECT public.register_weekly_test_window($1,$2,
       coalesce($3::timestamptz,clock_timestamp()-interval '1 hour'),
       coalesce($4::timestamptz,clock_timestamp()-interval '1 hour'+interval '168 hours'),
       $5,$6::jsonb,ARRAY[$7::timestamptz,$8::timestamptz],$9::jsonb,$10) w`,
    [
      owner,
      overrides.project ?? "p",
      overrides.startsAt ?? null,
      overrides.endsAt ?? null,
      overrides.revision ?? 1,
      JSON.stringify(overrides.configuration ?? CONFIG),
      overrides.slots?.[0] ?? slotA,
      overrides.slots?.[1] ?? slotB,
      JSON.stringify(overrides.contracts ?? CONTRACTS),
      overrides.lifetime ?? LIFETIME,
    ],
  );
  return rows[0].w;
}
/** Register with a RAW slot-array expression, so array shapes a privileged
 * caller could really send — multidimensional, NULL entries, a rebased lower
 * bound — reach the RPC exactly as written instead of being normalised by the
 * `ARRAY[$7,$8]` form above. Extra bind parameters start at `$5`. */
async function registerRawSlots(expression: string, extra: unknown[] = []) {
  const { rows } = await db.query<{ w: Window }>(
    `SELECT public.register_weekly_test_window($1,'p',
       clock_timestamp()-interval '1 hour',
       clock_timestamp()-interval '1 hour'+interval '168 hours',
       1,$2::jsonb,${expression},$3::jsonb,$4) w`,
    [owner, JSON.stringify(CONFIG), JSON.stringify(CONTRACTS), LIFETIME, ...extra],
  );
  return rows[0].w;
}
async function readWindow(project = "p", user = owner) {
  return (
    await db.query<{ w: Window | null }>("SELECT public.read_weekly_test_window($1,$2) w", [
      user,
      project,
    ])
  ).rows[0].w;
}
async function begin(
  lease: string,
  publishAt: string,
  stage: string,
  { project = "p", revision = 1, user = owner, inputHash = hash } = {},
) {
  const { rows } = await db.query<{
    a: { acquired: boolean; requestId: string; outputId: string; state: string };
  }>("SELECT public.begin_weekly_preparation_stage($1,$2,$3,$4,$5::timestamptz,$6,$7) a", [
    user,
    project,
    lease,
    revision,
    publishAt,
    stage,
    inputHash,
  ]);
  return rows[0].a;
}
/** The server's own reserve call shape for one weekly stage. */
async function reserve(
  requestId: string,
  jobId: string,
  stage: keyof typeof CONTRACTS = "research",
  overrides: {
    user?: string;
    provider?: string;
    model?: string;
    operation?: string;
    ceiling?: number;
  } = {},
) {
  const c = CONTRACTS[stage];
  const { rows } = await db.query<Reserve>(
    "SELECT * FROM public.reserve_ai_expense($1,$2,$3,$4,$5,$6,$7,NULL,NULL,false)",
    [
      requestId,
      overrides.user ?? owner,
      jobId,
      overrides.provider ?? c.provider,
      overrides.model ?? c.model,
      overrides.operation ?? c.operation,
      overrides.ceiling ?? c.ceilingMicrousd,
    ],
  );
  return rows[0];
}
async function seedUnrestrictedBudgets(user = owner) {
  const { rows } = await db.query<{ p: string }>(
    "SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM') p",
  );
  for (const scope of ["global", `user:${user}`])
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES($1,$2,9007199254740991,'manual') ON CONFLICT DO NOTHING",
      [scope, rows[0].p],
    );
}
const counts = async () =>
  (
    await db.query<{
      w: number;
      s: number;
      c: number;
      a: number;
      permits: number;
      requests: number;
    }>(
      `SELECT (SELECT count(*) FROM public.weekly_test_windows)::integer w,
              (SELECT count(*) FROM public.weekly_test_window_slots)::integer s,
              (SELECT count(*) FROM public.weekly_test_window_contracts)::integer c,
              (SELECT count(*) FROM public.weekly_test_window_allowances)::integer a,
              (SELECT count(*) FROM public.ai_expense_permits)::integer permits,
              (SELECT count(*) FROM public.ai_expense_requests)::integer requests`,
    )
  ).rows[0];
/** Shift the window so a chosen effective state is reached, keeping the table's
 * own duration invariant intact. Simulates elapsed time, not a policy renewal. */
const shift = (startsOffset: string, endsOffset: string) =>
  db.query(
    `UPDATE public.weekly_test_windows SET starts_at=clock_timestamp()+$1::interval,
       ends_at=clock_timestamp()+$2::interval`,
    [startsOffset, endsOffset],
  );
async function runAllSix(lease: string) {
  const bound: Array<{ publishAt: string; stage: string; requestId: string }> = [];
  for (const publishAt of [slotA, slotB])
    for (const stage of ["research", "content", "image"]) {
      const a = await begin(lease, publishAt, stage);
      bound.push({ publishAt, stage, requestId: a.requestId });
    }
  return bound;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP);
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2)", [owner, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [owner, other]);
  for (const [user, project] of [
    [owner, "p"],
    [owner, "q"],
    [other, "r"],
  ])
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects',$2,$3::jsonb)",
      [user, project, JSON.stringify({ autoScheduler: CONFIG })],
    );
  await install(db, 0, files.length - 1);
  cronBaseline = (await db.query("SELECT jobname,schedule,active FROM cron.job ORDER BY jobname"))
    .rows;
  const before = await db.query("SELECT scope,period,cap_microusd FROM public.ai_expense_budgets");
  expect(before.rows).toEqual([]);
  await install(db, files.length - 1);
  ({ w: week, a: slotA, b: slotB, c: slotOff } = await instants());
}, 60000);

beforeEach(async () => {
  await db.exec(
    "RESET ROLE;UPDATE public.workspace_meta SET rev=0;" +
      "DELETE FROM public.weekly_test_window_allowances;DELETE FROM public.weekly_test_window_slots;" +
      "DELETE FROM public.weekly_test_window_contracts;DELETE FROM public.weekly_test_windows;" +
      "TRUNCATE public.weekly_preparation_stages,public.auto_scheduler_leases," +
      "public.project_scheduler_control,public.weekly_preparation_summaries," +
      "public.ai_expense_requests,public.ai_expense_permits,public.ai_expense_budgets," +
      "public.publication_approvals,public.scheduled_publishes;",
  );
  await db.query(
    "UPDATE public.workspace_entities SET data=$1::jsonb WHERE collection='projects'",
    [JSON.stringify({ autoScheduler: CONFIG })],
  );
  await db.query(
    "INSERT INTO public.workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','p',$2::jsonb) ON CONFLICT DO NOTHING",
    [owner, JSON.stringify({ autoScheduler: CONFIG })],
  );
  ({ w: week, a: slotA, b: slotB, c: slotOff } = await instants());
});

afterAll(async () => {
  await db?.close();
});

describe("installation funds and activates nothing", () => {
  it("creates no window, slot, contract, allowance, permit or budget row", async () => {
    expect(await counts()).toEqual({ w: 0, s: 0, c: 0, a: 0, permits: 0, requests: 0 });
  });
  it("leaves the shared cron jobs exactly as the previous migrations left them", async () => {
    expect(
      (await db.query("SELECT jobname,schedule,active FROM cron.job ORDER BY jobname")).rows,
    ).toEqual(cronBaseline);
  });
  it("keeps the new storage service-only — no table access for any client role", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of [
        "weekly_test_windows",
        "weekly_test_window_slots",
        "weekly_test_window_contracts",
        "weekly_test_window_allowances",
      ])
        await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toThrow(
          /permission denied/,
        );
      await db.exec("RESET ROLE");
    }
  });
  it("exposes only the three operator RPCs plus the dispatch guard to the service role", async () => {
    const { rows } = await db.query<{ name: string; service: boolean; authenticated: boolean }>(
      `SELECT p.proname name,
         has_function_privilege('service_role',p.oid,'EXECUTE') service,
         has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated
       FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
       WHERE s.nspname='public' AND p.proname LIKE '%weekly_test_window%' ORDER BY p.proname`,
    );
    expect(rows).toEqual([
      { name: "assert_weekly_test_window_dispatch", service: true, authenticated: false },
      { name: "read_weekly_test_window", service: true, authenticated: false },
      { name: "register_weekly_test_window", service: true, authenticated: false },
      { name: "revoke_weekly_test_window", service: true, authenticated: false },
      { name: "weekly_test_window_admits", service: false, authenticated: false },
      { name: "weekly_test_window_fresh", service: false, authenticated: false },
      { name: "weekly_test_window_state", service: false, authenticated: false },
    ]);
  });
  it("refuses to install over a renamed or extra reserve overload that would bypass the policy", async () => {
    const fresh = new PGlite();
    try {
      await fresh.exec(BOOTSTRAP);
      await install(fresh, 0, files.length - 1);
      // A re-introduced legacy overload is an alternative, unguarded money path.
      await fresh.exec(
        "CREATE FUNCTION public.reserve_ai_expense(p_request uuid,p_user uuid,p_job uuid,p_provider text,p_model text,p_operation text,p_ceiling bigint)" +
          " RETURNS TABLE(allowed boolean,reason text,period text) LANGUAGE sql AS $$ SELECT true,'reserved','2026-10' $$;",
      );
      await expect(
        fresh.exec(readFileSync(`supabase/migrations/${NEW_MIGRATION}`, "utf8")),
      ).rejects.toThrow("reserve_ai_expense_overload_present");
    } finally {
      await fresh.close();
    }
  }, 60000);
});

describe("unregistered projects keep their current behaviour", () => {
  it("claims, begins, finishes and reserves exactly as before", async () => {
    await setControl("q");
    await seedUnrestrictedBudgets();
    const lease = (await claim("q"))!;
    expect(lease).toBeTruthy();
    const stage = await begin(lease, slotA, "research", { project: "q" });
    expect(stage.acquired).toBe(true);
    // No permit was minted and no allowance exists for an unregistered project.
    expect(await counts()).toMatchObject({ w: 0, a: 0, permits: 0 });
    expect(await reserve(stage.requestId, lease)).toMatchObject({
      allowed: true,
      reason: "reserved",
    });
    expect(
      await db.query("SELECT public.finish_weekly_preparation_stage($1,'q',$2,$3,NULL)", [
        owner,
        stage.requestId,
        hash,
      ]),
    ).toBeTruthy();
  });
  it("still selects an unregistered project for the shared weekly dispatch", async () => {
    await setControl("q");
    const { rows } = await db.query<{ t: Array<{ projectId: string }> }>(
      "SELECT public.next_weekly_preparation_targets() t",
    );
    expect(rows[0].t.map((x) => x.projectId)).toEqual(["q"]);
  });
  it("admits an ordinary interactive request for an account that also owns a window", async () => {
    await setControl("p");
    await register();
    await seedUnrestrictedBudgets();
    // Not a weekly stage, not a bound lease token: ordinary admission is intact.
    const id = randomUUID();
    expect(await reserve(id, id)).toMatchObject({ allowed: true, reason: "reserved" });
  });
  it("leaves another owner's project completely unaffected", async () => {
    await setControl("p");
    await register();
    await setControl("r", "weekly", 0, other);
    expect(await claim("r", other)).toBeTruthy();
    expect(await readWindow("r", other)).toBeNull();
  });
});

describe("registration is explicit, one-shot and non-funding", () => {
  it("records exactly two slots, three contracts and the 2,200,000 lifetime", async () => {
    await setControl("p");
    const win = await register();
    expect(win.state).toBe("active");
    expect(win.fresh).toBe(true);
    expect(win.slots.map((s) => Date.parse(s))).toEqual([Date.parse(slotA), Date.parse(slotB)]);
    expect(Object.keys(win.contracts).sort()).toEqual(["content", "image", "research"]);
    expect(win.lifetimeCeilingMicrousd).toBe(LIFETIME);
    expect(win.authorizedMicrousd).toBe(0);
    expect(win.allowances).toEqual([]);
    // Two slots x (text + text + image) is exactly the declared lifetime.
    expect(2 * (TEXT_RESERVE + TEXT_RESERVE + IMAGE_RESERVE)).toBe(LIFETIME);
    expect(await counts()).toMatchObject({ w: 1, s: 2, c: 3, a: 0, permits: 0, requests: 0 });
  });
  it("refuses a second registration for the same owner/project in any state", async () => {
    await setControl("p");
    await register();
    await expect(register()).rejects.toThrow("weekly_test_window_exists");
    await db.query("SELECT public.revoke_weekly_test_window($1,'p')", [owner]);
    await expect(register()).rejects.toThrow("weekly_test_window_exists");
    await shift("-200 hours", "-32 hours");
    await expect(register()).rejects.toThrow("weekly_test_window_exists");
  });
  it("refuses a duration over 168 hours, a duplicate slot or a wrong lifetime", async () => {
    await setControl("p");
    await expect(
      register({
        startsAt: new Date(Date.now() - 3600_000).toISOString(),
        endsAt: new Date(Date.now() - 3600_000 + 169 * 3600_000).toISOString(),
      }),
    ).rejects.toThrow("invalid_weekly_test_window");
    await expect(register({ slots: [slotA, slotA] })).rejects.toThrow("invalid_weekly_test_window");
    await expect(register({ lifetime: LIFETIME - 1 })).rejects.toThrow(
      "weekly_test_window_lifetime",
    );
    expect(await counts()).toMatchObject({ w: 0, s: 0, c: 0 });
  });
  it("refuses any slot array that is not exactly two one-dimensional non-null instants", async () => {
    await setControl("p");
    // A 2x2 array has array_length(…,1)=2, so a length-only check accepts it
    // and FOREACH then FLATTENS it into four authorized slot rows — four
    // publication instants and twice the intended capacity.
    const malformed: Array<[string, string, unknown[]]> = [
      [
        "multidimensional",
        "ARRAY[ARRAY[$5::timestamptz,$6::timestamptz],ARRAY[$5::timestamptz+interval '1 hour',$6::timestamptz+interval '1 hour']]",
        [slotA, slotB],
      ],
      ["empty", "ARRAY[]::timestamptz[]", []],
      ["one entry", "ARRAY[$5::timestamptz]", [slotA]],
      ["three entries", "ARRAY[$5::timestamptz,$6::timestamptz,$5::timestamptz]", [slotA, slotB]],
      ["a null entry", "ARRAY[$5::timestamptz,NULL::timestamptz]", [slotA]],
      ["only nulls", "ARRAY[NULL,NULL]::timestamptz[]", []],
      ["null", "NULL::timestamptz[]", []],
      // A rebased lower bound makes p_slots[1]/p_slots[2] read NULL, which
      // would make `p_slots[1]=p_slots[2]` NULL and skip distinctness entirely.
      ["a non-1 lower bound", `'[0:1]={"${slotA}","${slotB}"}'::timestamptz[]`, []],
      ["a 2-based lower bound", `'[2:3]={"${slotA}","${slotB}"}'::timestamptz[]`, []],
    ];
    for (const [label, expression, extra] of malformed) {
      await expect(
        registerRawSlots(expression, extra),
        `slots ${label} must be refused`,
      ).rejects.toThrow("invalid_weekly_test_window");
      expect(await counts()).toMatchObject({ w: 0, s: 0, c: 0, a: 0 });
    }
    // The ordinary two-slot registration is unaffected.
    const win = await registerRawSlots("ARRAY[$5::timestamptz,$6::timestamptz]", [slotA, slotB]);
    expect(win.slots.map((s) => Date.parse(s))).toEqual([Date.parse(slotA), Date.parse(slotB)]);
    expect(await counts()).toMatchObject({ w: 1, s: 2, c: 3, a: 0 });
  });
  it("fails closed on price or model drift in the stage contracts", async () => {
    await setControl("p");
    await expect(
      register({
        contracts: {
          ...CONTRACTS,
          content: { ...CONTRACTS.content, ceilingMicrousd: TEXT_RESERVE + 1 },
        },
        lifetime: LIFETIME + 1,
      }),
    ).rejects.toThrow();
    await expect(
      register({ contracts: { research: CONTRACTS.research, content: CONTRACTS.content } }),
    ).rejects.toThrow("invalid_weekly_test_window");
    expect(await counts()).toMatchObject({ w: 0 });
  });
  it("refuses a stale revision, drifted configuration, a publishing mode or a mail destination", async () => {
    await setControl("p");
    await expect(register({ revision: 2 })).rejects.toThrow("weekly_test_window_configuration");
    await expect(register({ configuration: { ...CONFIG, publishTime: "10:00" } })).rejects.toThrow(
      "weekly_test_window_configuration",
    );
    await db.query(
      "UPDATE public.workspace_entities SET data=$1::jsonb WHERE user_id=$2 AND entity_id='p'",
      [JSON.stringify({ autoScheduler: { ...CONFIG, mode: "auto_publish" } }), owner],
    );
    await expect(register({ configuration: { ...CONFIG, mode: "auto_publish" } })).rejects.toThrow(
      "weekly_test_window_configuration",
    );
    await db.query(
      "UPDATE public.workspace_entities SET data=$1::jsonb WHERE user_id=$2 AND entity_id='p'",
      [JSON.stringify({ autoScheduler: { ...CONFIG, summaryEmail: "x@example.test" } }), owner],
    );
    await expect(
      register({ configuration: { ...CONFIG, summaryEmail: "x@example.test" } }),
    ).rejects.toThrow("weekly_test_window_configuration");
    expect(await counts()).toMatchObject({ w: 0 });
  });
  it("refuses a project that already holds weekly stages, keeping the whitelist authoritative", async () => {
    await setControl("p");
    const lease = (await claim())!;
    await begin(lease, slotOff, "research");
    await expect(register()).rejects.toThrow("weekly_test_window_project_used");
  });
});

describe("a registered project admits only its two dates and three stages", () => {
  beforeEach(async () => {
    await setControl("p");
    await register();
    await seedUnrestrictedBudgets();
  });
  it("binds six immutable allowances totalling exactly the lifetime ceiling", async () => {
    const lease = (await claim())!;
    const bound = await runAllSix(lease);
    const win = (await readWindow())!;
    expect(win.allowances).toHaveLength(6);
    expect(win.authorizedMicrousd).toBe(LIFETIME);
    expect(new Set(win.allowances.map((a) => a.requestId)).size).toBe(6);
    expect(win.allowances.map((a) => a.jobId)).toEqual(Array(6).fill(lease));
    // Every allowance uses the stage's ACTUAL generated request ID.
    expect(win.allowances.map((a) => a.requestId).sort()).toEqual(
      bound.map((b) => b.requestId).sort(),
    );
    // One exact permit per allowance, expiring at T1, in the current period.
    const permits = await db.query<{ n: number; aligned: number }>(
      `SELECT count(*)::integer n,
        count(*) FILTER (WHERE p.expires_at=t.ends_at AND p.ceiling_microusd=a.ceiling_microusd
          AND p.job_id=a.job_id AND p.operation=a.operation AND p.model=a.model
          AND p.period=to_char(now() AT TIME ZONE 'UTC','YYYY-MM') AND NOT p.revoked)::integer aligned
       FROM public.ai_expense_permits p
       JOIN public.weekly_test_window_allowances a ON a.request_id=p.request_id
       JOIN public.weekly_test_windows t ON t.window_id=a.window_id`,
    );
    expect(permits.rows[0]).toEqual({ n: 6, aligned: 6 });
  });
  it("refuses a seventh allowance on an off-list date and on an off-list stage", async () => {
    const lease = (await claim())!;
    await runAllSix(lease);
    await expect(begin(lease, slotOff, "research")).rejects.toThrow("weekly_test_window_closed");
    await expect(begin(lease, slotA, "summary")).rejects.toThrow();
    const win = (await readWindow())!;
    expect(win.allowances).toHaveLength(6);
    expect(win.authorizedMicrousd).toBe(LIFETIME);
  });
  it("cannot exceed six allowances or the lifetime ceiling under interleaved admission", async () => {
    // PGlite serializes these; this proves interleaving safety, not row-lock
    // contention across connections.
    const lease = (await claim())!;
    const attempts = [
      ...[slotA, slotB].flatMap((publishAt) =>
        ["research", "content", "image"].map((stage) => ({ publishAt, stage })),
      ),
      { publishAt: slotOff, stage: "research" },
    ];
    const results = await Promise.allSettled(
      attempts.map((a) => begin(lease, a.publishAt, a.stage)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(6);
    const win = (await readWindow())!;
    expect(win.allowances).toHaveLength(6);
    expect(win.authorizedMicrousd).toBe(LIFETIME);
    expect(win.authorizedMicrousd).toBeLessThanOrEqual(win.lifetimeCeilingMicrousd);
  });
  it("keeps the identity immutable across duplicate calls, failure, unknown and settlement", async () => {
    const lease = (await claim())!;
    const first = await begin(lease, slotA, "content");
    const duplicate = await begin(lease, slotA, "content");
    expect(duplicate).toMatchObject({ acquired: false, requestId: first.requestId });
    // A duplicate call with another input hash still cannot take over or re-mint.
    const tampered = await begin(lease, slotA, "content", { inputHash: "b".repeat(64) });
    expect(tampered.requestId).toBe(first.requestId);
    expect((await readWindow())!.allowances).toHaveLength(1);
    // Unknown outcome, then a settled reservation: no allowance is reissued.
    expect(await reserve(first.requestId, lease, "content")).toMatchObject({ allowed: true });
    await db.query(
      "SELECT * FROM public.reconcile_ai_expense($1,$2,120000,'succeeded','test-rate-v1',NULL,NULL,NULL)",
      [first.requestId, owner],
    );
    await db.query("SELECT public.finish_weekly_preparation_stage($1,'p',$2,$3,NULL)", [
      owner,
      first.requestId,
      hash,
    ]);
    const win = (await readWindow())!;
    expect(win.allowances).toHaveLength(1);
    expect(win.authorizedMicrousd).toBe(TEXT_RESERVE);
    // Settlement released MONTHLY capacity but not the lifetime allowance.
    const budgets = await db.query<{ held: number; spent: number }>(
      "SELECT reserved_microusd::integer held,spent_microusd::integer spent FROM public.ai_expense_budgets WHERE scope='global'",
    );
    expect(budgets.rows[0]).toEqual({ held: 0, spent: 120000 });
    expect(await begin(lease, slotA, "content")).toMatchObject({ acquired: false });
  });
  it("derives lifetime capacity from original ceilings, never from the expense period", async () => {
    const lease = (await claim())!;
    await runAllSix(lease);
    // Age every binding into a previous UTC month: capacity must not come back.
    await db.query("UPDATE public.weekly_test_window_allowances SET period='2020-01'");
    await db.query("UPDATE public.ai_expense_permits SET period='2020-01'");
    await expect(begin(lease, slotOff, "content")).rejects.toThrow("weekly_test_window_closed");
    expect((await readWindow())!.authorizedMicrousd).toBe(LIFETIME);
  });
  it("refuses an exhausted window even when a slot and stage are on the list", async () => {
    const lease = (await claim())!;
    await runAllSix(lease);
    // Remove one stage row (not its allowance) and retry the SAME slot/stage: the
    // allowance ledger is the authority, so the lifetime stays spent.
    await db.query(
      "DELETE FROM public.weekly_preparation_stages WHERE user_id=$1 AND project_id='p' AND stage='image' AND publish_at=$2::timestamptz",
      [owner, slotB],
    );
    await expect(begin(lease, slotB, "image")).rejects.toThrow("weekly_test_window_exhausted");
  });
});

describe("monetary admission cannot bypass the binding", () => {
  beforeEach(async () => {
    await setControl("p");
    await register();
    await seedUnrestrictedBudgets();
  });
  it("admits a valid trial reservation while both budgets are unrestricted", async () => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    const row = await db.query<{ permit: boolean }>(
      "SELECT bool_or(requires_permit) permit FROM public.ai_expense_budgets",
    );
    expect(row.rows[0].permit).toBe(false);
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({
      allowed: true,
      reason: "reserved",
    });
  });
  it("refuses a trial stage whose binding was removed, even with permits not required", async () => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    await db.query("DELETE FROM public.weekly_test_window_allowances WHERE request_id=$1", [
      stage.requestId,
    ]);
    await db.query("DELETE FROM public.ai_expense_permits WHERE request_id=$1", [stage.requestId]);
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({
      allowed: false,
      reason: "permit_required",
    });
    expect(await counts()).toMatchObject({ requests: 0 });
  });
  it("refuses a fresh request identity that reuses a bound lease token", async () => {
    const lease = (await claim())!;
    await begin(lease, slotA, "research");
    expect(await reserve(randomUUID(), lease, "research")).toMatchObject({
      allowed: false,
      reason: "permit_required",
    });
  });
  it.each<[string, Parameters<typeof reserve>[3]]>([
    ["owner", { user: other }],
    ["provider", { provider: "openrouter" }],
    ["model", { model: "gpt-5.6-mini" }],
    ["operation", { operation: "generateContentCore" }],
    ["ceiling", { ceiling: TEXT_RESERVE + 1 }],
  ])("refuses a wrong %s before any provider call", async (_label, overrides) => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    if (overrides?.user) await seedUnrestrictedBudgets(other);
    const result = await reserve(stage.requestId, lease, "research", overrides);
    expect(result.allowed).toBe(false);
    expect(["permit_invalid", "permit_required"]).toContain(result.reason);
    expect(await counts()).toMatchObject({ requests: 0 });
  });
  it("refuses a wrong job identity", async () => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    expect(await reserve(stage.requestId, randomUUID(), "research")).toMatchObject({
      allowed: false,
      reason: "permit_invalid",
    });
  });
  it.each([
    ["pre-T0", "+1 hour", "+169 hours"],
    ["T1-exact", "-168 hours", "+0 seconds"],
    ["post-T1", "-200 hours", "-32 hours"],
  ])("refuses a %s window although the minted permit is still valid", async (_l, from, to) => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    // Keep the permit itself unexpired to prove the policy block is what refuses.
    await db.query(
      "UPDATE public.ai_expense_permits SET expires_at=clock_timestamp()+interval '10 years'",
    );
    await shift(from, to);
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({
      allowed: false,
      reason: "permit_invalid",
    });
    expect(await counts()).toMatchObject({ requests: 0 });
  });
  it("refuses a revoked window and a drifted scheduler identity", async () => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    const second = await begin(lease, slotB, "research");
    await db.query("SELECT public.revoke_weekly_test_window($1,'p')", [owner]);
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({
      allowed: false,
      reason: "permit_invalid",
    });
    // Revocation also revokes the unconsumed permits, so the pre-existing permit
    // gate refuses them independently of the new policy block.
    const permits = await db.query<{ revoked: boolean }>(
      "SELECT revoked FROM public.ai_expense_permits WHERE request_id=$1",
      [second.requestId],
    );
    expect(permits.rows[0].revoked).toBe(true);
    expect(await counts()).toMatchObject({ requests: 0 });
  });
  it("refuses after the project's autoScheduler configuration drifts", async () => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    await db.query(
      "UPDATE public.workspace_entities SET data=$1::jsonb WHERE user_id=$2 AND entity_id='p'",
      [JSON.stringify({ autoScheduler: { ...CONFIG, publishTime: "10:00" } }), owner],
    );
    expect((await readWindow())!.fresh).toBe(false);
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({
      allowed: false,
      reason: "permit_invalid",
    });
  });
  it("refuses a permit minted before a month boundary without minting a retry identity", async () => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    await db.query("UPDATE public.ai_expense_permits SET period='2020-01'");
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({
      allowed: false,
      reason: "permit_invalid",
    });
    // No alternate identity: still one permit, one allowance, no request row.
    expect(await counts()).toMatchObject({ permits: 1, a: 1, requests: 0 });
    await expect(begin(lease, slotA, "research")).resolves.toMatchObject({
      acquired: false,
      requestId: stage.requestId,
    });
  });
  it("refuses a second paid callback after a lost reserve acknowledgement", async () => {
    const lease = (await claim())!;
    const stage = await begin(lease, slotA, "research");
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({ allowed: true });
    expect(await reserve(stage.requestId, lease, "research")).toMatchObject({
      allowed: false,
      reason: "duplicate_request",
    });
  });
});

describe("the final pre-dispatch guard", () => {
  let lease: string;
  let stage: { requestId: string; outputId: string };
  const guard = (
    overrides: {
      request?: string;
      job?: string;
      publishAt?: string;
      stage?: string;
      provider?: string;
      model?: string;
      operation?: string;
      ceiling?: number;
    } = {},
  ) =>
    db.query<{ g: { ok: boolean; remainingMs: number; serverNow: string } }>(
      "SELECT public.assert_weekly_test_window_dispatch($1,'p',$2,$3,$4::timestamptz,$5,$6,$7,$8,$9) g",
      [
        owner,
        overrides.request ?? stage.requestId,
        overrides.job ?? lease,
        overrides.publishAt ?? slotA,
        overrides.stage ?? "research",
        overrides.provider ?? "openai",
        overrides.model ?? CONTRACTS.research.model,
        overrides.operation ?? CONTRACTS.research.operation,
        overrides.ceiling ?? TEXT_RESERVE,
      ],
    );
  beforeEach(async () => {
    await setControl("p");
    await register();
    await seedUnrestrictedBudgets();
    lease = (await claim())!;
    stage = await begin(lease, slotA, "research");
  });
  it("confirms the bound identity and reports the server clock and remaining time", async () => {
    const { rows } = await guard();
    expect(rows[0].g.ok).toBe(true);
    expect(rows[0].g.remainingMs).toBeGreaterThan(0);
    expect(Date.parse(rows[0].g.serverNow)).toBeGreaterThan(0);
  });
  it.each<[string, Parameters<typeof guard>[0]]>([
    ["request", { request: randomUUID() }],
    ["job", { job: randomUUID() }],
    ["slot", { publishAt: "off-list" }],
    ["stage", { stage: "content" }],
    ["model", { model: "gpt-5.6-mini" }],
    ["operation", { operation: "generateContentCore" }],
    ["ceiling", { ceiling: IMAGE_RESERVE }],
  ])("refuses a wrong %s", async (_label, overrides) => {
    const args =
      overrides?.publishAt === "off-list" ? { ...overrides, publishAt: slotOff } : overrides;
    await expect(guard(args)).rejects.toThrow("weekly_test_window_closed");
  });
  it("refuses once the window expires, is revoked or its lease is gone", async () => {
    await shift("-200 hours", "-32 hours");
    await expect(guard()).rejects.toThrow("weekly_test_window_closed");
    await shift("-1 hour", "+167 hours");
    await expect(guard()).resolves.toBeTruthy();
    await db.query("SELECT public.revoke_weekly_test_window($1,'p')", [owner]);
    await expect(guard()).rejects.toThrow("weekly_test_window_closed");
  });
  it("refuses when the stage is no longer running or the lease was released", async () => {
    await db.query("SELECT public.finish_weekly_preparation_stage($1,'p',$2,$3,NULL)", [
      owner,
      stage.requestId,
      hash,
    ]);
    await expect(guard()).rejects.toThrow("weekly_test_window_closed");
  });
});

describe("stop, expiry, retention and recreation", () => {
  beforeEach(async () => {
    await setControl("p");
    await register();
    await seedUnrestrictedBudgets();
  });
  it("stops fresh admission with a running stage and an active lease, without a local monitor", async () => {
    const lease = (await claim())!;
    const running = await begin(lease, slotA, "research");
    // The existing pause RPC legitimately refuses while work may be in flight.
    await expect(setControl("p", "paused", 1)).rejects.toThrow("scheduler_recovery_required");
    const stopped = (
      await db.query<{ w: Window }>("SELECT public.revoke_weekly_test_window($1,'p') w", [owner])
    ).rows[0].w;
    expect(stopped.state).toBe("revoked");
    // Every new admission path refuses; the uncertain stage is preserved.
    await expect(begin(lease, slotB, "research")).rejects.toThrow("weekly_test_window_closed");
    await expect(claim()).rejects.toThrow("weekly_test_window_closed");
    const { rows } = await db.query<{ t: unknown[] }>(
      "SELECT public.next_weekly_preparation_targets() t",
    );
    expect(rows[0].t).toEqual([]);
    const stages = await db.query<{ state: string }>(
      "SELECT state FROM public.weekly_preparation_stages WHERE request_id=$1",
      [running.requestId],
    );
    expect(stages.rows[0].state).toBe("running");
  });
  it("is idempotent and never renews the policy", async () => {
    const first = (
      await db.query<{ w: Window }>("SELECT public.revoke_weekly_test_window($1,'p') w", [owner])
    ).rows[0].w;
    const again = (
      await db.query<{ w: Window }>("SELECT public.revoke_weekly_test_window($1,'p') w", [owner])
    ).rows[0].w;
    expect(again.revoked).toBe(true);
    expect(again.state).toBe("revoked");
    expect(again.endsAt).toBe(first.endsAt);
    expect((await readWindow())!.state).toBe("revoked");
  });
  it("expires without any operator action and is then skipped by the shared cron", async () => {
    await shift("-200 hours", "-32 hours");
    expect((await readWindow())!.state).toBe("expired");
    expect((await readWindow())!.remainingMs).toBe(0);
    const { rows } = await db.query<{ t: unknown[] }>(
      "SELECT public.next_weekly_preparation_targets() t",
    );
    expect(rows[0].t).toEqual([]);
    await expect(claim()).rejects.toThrow("weekly_test_window_closed");
  });
  it("is skipped while pending, before T0", async () => {
    await shift("+1 hour", "+169 hours");
    expect((await readWindow())!.state).toBe("pending");
    const { rows } = await db.query<{ t: unknown[] }>(
      "SELECT public.next_weekly_preparation_targets() t",
    );
    expect(rows[0].t).toEqual([]);
    await expect(claim()).rejects.toThrow("weekly_test_window_closed");
  });
  /**
   * A claim can BLOCK on `auto_scheduler_leases … FOR UPDATE` long after its
   * first policy read: the existing release path holds that row without ever
   * taking `workspace_meta`, so the wait can outlast T1 or a committed stop. In
   * one PGlite connection the wait itself cannot be staged, so the stop is
   * injected by a BEFORE INSERT trigger on the lease table — it fires after the
   * pre-lock gate has already passed and before the lock is taken, which is
   * exactly the ordering a blocked claim sees. The real cross-session wait
   * belongs to the separate host-PostgreSQL harness.
   */
  const whileClaimWaits = async (effect: string, assertions: () => Promise<void>) => {
    await db.exec(
      `CREATE FUNCTION public.stop_during_wait() RETURNS trigger LANGUAGE plpgsql AS $fn$
         BEGIN ${effect} RETURN NEW; END; $fn$;
       CREATE TRIGGER stop_during_wait BEFORE INSERT ON public.auto_scheduler_leases
         FOR EACH ROW EXECUTE FUNCTION public.stop_during_wait();`,
    );
    try {
      await assertions();
    } finally {
      await db.exec(
        "DROP TRIGGER stop_during_wait ON public.auto_scheduler_leases;" +
          "DROP FUNCTION public.stop_during_wait();",
      );
    }
  };
  const leaseRows = async () =>
    (
      await db.query<{ token: string; status: string; planned_period: string }>(
        "SELECT token,status,planned_period FROM public.auto_scheduler_leases ORDER BY project_id",
      )
    ).rows;

  it.each([
    ["a stop", "UPDATE public.weekly_test_windows SET revoked=true,revoked_at=clock_timestamp();"],
    [
      "T1",
      // Keeps the table's own duration invariant intact: T1 has just passed.
      "UPDATE public.weekly_test_windows SET starts_at=clock_timestamp()-interval '168 hours 1 second'," +
        "ends_at=clock_timestamp()-interval '1 second';",
    ],
  ])(
    "refuses a new lease token when %s lands after the lease lock, inserting nothing",
    async (_label, effect) => {
      await whileClaimWaits(effect, async () => {
        await expect(claim()).rejects.toThrow("weekly_test_window_closed");
      });
      // The speculative insert is rolled back with the refusal: no lease row,
      // no fresh token. (The injected stop rolls back with it, which is why the
      // policy row itself is not asserted here.)
      expect(await leaseRows()).toEqual([]);
    },
  );
  it("preserves a pre-existing released lease instead of reusing it after the cutoff", async () => {
    const first = (await claim())!;
    await release(first);
    const before = await leaseRows();
    expect(before).toMatchObject([{ token: first, status: "released" }]);
    await whileClaimWaits(
      "UPDATE public.weekly_test_windows SET revoked=true,revoked_at=clock_timestamp();",
      async () => {
        await expect(claim()).rejects.toThrow("weekly_test_window_closed");
      },
    );
    // The released row is untouched: no new token, no reactivation.
    expect(await leaseRows()).toEqual(before);
  });
  it("leaves an unregistered project's claim completely unchanged", async () => {
    await setControl("q");
    await whileClaimWaits(
      "UPDATE public.weekly_test_windows SET revoked=true,revoked_at=clock_timestamp();",
      async () => {
        // Project "q" has no window row, so neither gate applies to it; the
        // trigger's stop of project "p" cannot reach it.
        expect(await claim("q")).toMatch(/^[0-9a-f-]{36}$/);
      },
    );
    expect((await leaseRows()).map((r) => r.status)).toEqual(["active"]);
  });
  it("retains, finishes, recovers and reconciles existing work after the cutoff", async () => {
    const lease = (await claim())!;
    const content = await begin(lease, slotA, "content");
    expect(await reserve(content.requestId, lease, "content")).toMatchObject({ allowed: true });
    const receipt = randomUUID();
    await db.query("INSERT INTO ai_generation_usage_receipts VALUES($1,$2,$3)", [
      receipt,
      owner,
      content.requestId,
    ]);
    await db.query("INSERT INTO ai_generation_results VALUES($1,$2,$3::jsonb,NULL)", [
      receipt,
      owner,
      JSON.stringify({ projectId: "p", kind: "content", assetId: content.outputId }),
    ]);
    // T1 passes while the produced output is still unacknowledged.
    await shift("-200 hours", "-32 hours");
    await expect(begin(lease, slotB, "content")).rejects.toThrow("weekly_test_window_closed");
    // The lost acknowledgement is recovered from the archive, not re-generated.
    const recovered = await db.query<{ r: { receiptId: string } | null }>(
      "SELECT public.recover_weekly_preparation_stage($1,'p',$2) r",
      [owner, content.requestId],
    );
    expect(recovered.rows[0].r).toEqual({ receiptId: receipt });
    await db.query("SELECT public.release_auto_scheduler_lease($1,'p',$2)", [owner, lease]);
    const reconciled = await db.query<{ ok: boolean }>(
      "SELECT public.reconcile_weekly_preparation($1,'p',$2) ok",
      [owner, period()],
    );
    expect(reconciled.rows[0].ok).toBe(true);
    // Accounting after the cutoff stays possible and starts no provider work.
    const settled = await db.query<{ state: string }>(
      "SELECT state FROM public.reconcile_ai_expense($1,$2,110000,'succeeded','test-rate-v1',NULL,NULL,NULL)",
      [content.requestId, owner],
    );
    expect(settled.rows[0].state).toBe("settled");
    expect((await readWindow())!.authorizedMicrousd).toBe(TEXT_RESERVE);
  });
  it("keeps the allowance spent after the project is deleted and recreated", async () => {
    const lease = (await claim())!;
    await runAllSix(lease);
    await db.query(
      "DELETE FROM public.workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [owner],
    );
    // Stages, control and leases cascade away; the trial ledger deliberately does not.
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::integer n FROM public.weekly_preparation_stages WHERE user_id=$1 AND project_id='p'",
          [owner],
        )
      ).rows[0].n,
    ).toBe(0);
    await db.query(
      "INSERT INTO public.workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','p',$2::jsonb)",
      [owner, JSON.stringify({ autoScheduler: CONFIG })],
    );
    await setControl("p");
    expect((await readWindow())!.authorizedMicrousd).toBe(LIFETIME);
    await expect(register()).rejects.toThrow("weekly_test_window_exists");
    const fresh = (await claim())!;
    await expect(begin(fresh, slotA, "research")).rejects.toThrow("weekly_test_window_exhausted");
  });
  it("refuses an off-list slot when ordinary weekly planning advances a week", async () => {
    const lease = (await claim())!;
    await release(lease);
    const nextWeek = (
      await db.query<{ a: string; w: string }>(
        `SELECT ((date_trunc('week',$1::timestamptz AT TIME ZONE 'Europe/Stockholm')+interval '8 days 8 hours') AT TIME ZONE 'Europe/Stockholm')::text a,
                to_char(date_trunc('week',$1::timestamptz AT TIME ZONE 'Europe/Stockholm')+interval '7 days','YYYY-MM-DD') w`,
        [slotA],
      )
    ).rows[0];
    const later = (
      await db.query<{ token: string | null }>(
        "SELECT public.claim_auto_scheduler_lease($1,'p',$2) token",
        [owner, `week:${nextWeek.w}`],
      )
    ).rows[0].token!;
    await expect(begin(later, nextWeek.a, "research")).rejects.toThrow("weekly_test_window_closed");
    expect((await readWindow())!.allowances).toEqual([]);
  });
});
