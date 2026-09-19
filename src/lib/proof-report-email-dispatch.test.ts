import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { proofReportEmailCopy } from "@/i18n/proof-report-email-copy";
const mocks = vi.hoisted(() => ({
  preference: vi.fn(),
  workspace: vi.fn(),
  middleware: vi.fn(),
  entitlement: vi.fn(),
  scope: vi.fn(),
  links: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { kind: "authenticated" },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    const b = {
      middleware: (v: unknown) => {
        mocks.middleware(v);
        return b;
      },
      inputValidator: (v: typeof validate) => {
        validate = v;
        return b;
      },
      handler: (fn: (v: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return b;
  },
}));
vi.mock("./proof-report-email-preference.server", () => ({
  readProofReportEmailLocale: mocks.preference,
}));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: mocks.workspace }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          if (table === "entitlements") mocks.scope(column, value);
          return q;
        },
        maybeSingle: mocks.entitlement,
        then: (resolve: (v: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          mocks.links().then(resolve, reject),
      };
      return q;
    },
  },
}));
import { emailProofReportFn, getProofLinksLiveFn } from "./proof-report.functions";
const context = { userId: "caller-id", claims: { email: "caller@example.test" } };
const call = (data: unknown, ctx: unknown = context) =>
  (emailProofReportFn as unknown as (args: unknown) => Promise<unknown>)({ data, context: ctx });
let provider = vi.fn();
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "unit-test-placeholder");
  vi.stubEnv("OUTREACH_FROM_EMAIL", "sender@example.test");
  mocks.preference.mockReset().mockResolvedValue("de");
  mocks.scope.mockReset();
  mocks.links.mockReset().mockResolvedValue({ count: 0, error: null });
  mocks.entitlement.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.workspace.mockReset().mockResolvedValue({
    data: {
      projects: [{ id: "p1", name: "Project", appLanguage: "sv" }],
      content: [],
      calendar: [],
    },
  });
  provider = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", provider);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("retains authentication middleware", () => {
  expect(
    mocks.middleware.mock.calls.every(([v]) => JSON.stringify(v).includes("authenticated")),
  ).toBe(true);
  expect(mocks.middleware).toHaveBeenCalledTimes(2);
});
it("uses only the authenticated caller's saved language and recipient despite request extras", async () => {
  await expect(
    call({ projectId: "p1", monthKey: "2026-09", locale: "fr", recipient: "other@example.test" }),
  ).resolves.toEqual({ sent: true });
  expect(mocks.workspace).toHaveBeenCalledWith("caller-id");
  expect(mocks.preference).toHaveBeenCalledExactlyOnceWith("caller-id");
  expect(provider).toHaveBeenCalledOnce();
  const [url, options] = provider.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  const body = JSON.parse(options.body);
  expect(body.to).toEqual(["caller@example.test"]);
  expect(body.from).toBe("Milo Growth <sender@example.test>");
  expect(body.html).toContain('lang="de"');
  expect(body.subject).toContain(proofReportEmailCopy.de["report.title"]);
  expect(body.html).not.toContain('lang="sv"');
  expect(body.html).not.toContain("other@example.test");
});
it("stops before provider dispatch when preference confirmation fails", async () => {
  mocks.preference.mockRejectedValue(new Error("Report email language could not be confirmed."));
  await expect(call({ projectId: "p1", monthKey: "2026-09" })).rejects.toThrow(
    "could not be confirmed",
  );
  expect(provider).not.toHaveBeenCalled();
  expect(mocks.preference).toHaveBeenCalledOnce();
});
it("does not read preferences or send for a project outside the caller workspace", async () => {
  await expect(call({ projectId: "other-project", monthKey: "2026-09" })).rejects.toThrow(
    "Project not found",
  );
  expect(mocks.preference).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  expect(mocks.entitlement).not.toHaveBeenCalled();
});
it("retains the configuration and caller-address guards before preference reads", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  await expect(call({ projectId: "p1", monthKey: "2026-09" })).rejects.toThrow("not configured");
  expect(mocks.preference).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  await expect(
    call({ projectId: "p1", monthKey: "2026-09" }, { userId: "caller-id", claims: { email: "" } }),
  ).rejects.toThrow("no email address");
  expect(provider).not.toHaveBeenCalled();
});

const brand = "Caller Agency Branding";
const setWorkspaceSubscription = (subscription: unknown) => {
  mocks.workspace.mockResolvedValue({
    data: {
      projects: [{ id: "p1", name: "Project" }],
      content: [],
      calendar: [],
      subscription,
      agencyBranding: { agencyName: brand, logoUrl: "https://example.test/logo.png" },
    },
  });
};
it.each([
  ["missing", null],
  ["free", { plan_id: "freePreview", status: "freePreview" }],
  ["other paid tier", { plan_id: "pro", status: "active" }],
  ["cancelled", { plan_id: "agency", status: "cancelled" }],
  ["past due", { plan_id: "agency", status: "pastDue" }],
  ["expired", { plan_id: "agency", status: "active", current_period_end: "2000-01-01T00:00:00Z" }],
  [
    "expired manual",
    { plan_id: "agency", status: "manualComped", current_period_end: "2000-01-01T00:00:00Z" },
  ],
  ["unknown status", { plan_id: "agency", status: "invented" }],
])(
  "ignores an Agency workspace claim when authoritative entitlement is %s",
  async (_name, data) => {
    setWorkspaceSubscription({ planId: "agency", status: "active" });
    mocks.entitlement.mockResolvedValue({ data, error: null });
    await call({ projectId: "p1", monthKey: "2026-09", userId: "other-user" });
    expect(mocks.scope).toHaveBeenCalledExactlyOnceWith("user_id", "caller-id");
    expect(JSON.parse(provider.mock.calls[0][1].body).html).not.toContain(brand);
  },
);
it.each(["active", "manualBeta", "manualComped"])(
  "honors authoritative %s Agency despite missing or stale workspace subscription",
  async (status) => {
    mocks.entitlement.mockResolvedValue({ data: { plan_id: "agency", status }, error: null });
    for (const subscription of [undefined, { planId: "freePreview", status: "freePreview" }]) {
      setWorkspaceSubscription(subscription);
      await call({ projectId: "p1", monthKey: "2026-09" });
      expect(JSON.parse(provider.mock.calls.at(-1)![1].body).html).toContain(brand);
    }
  },
);
it("retains Agency until its scheduled cancellation period ends", async () => {
  setWorkspaceSubscription(undefined);
  mocks.entitlement.mockResolvedValue({
    data: {
      plan_id: "agency",
      status: "active",
      cancel_at_period_end: true,
      current_period_end: "2999-01-01T00:00:00Z",
    },
    error: null,
  });
  await call({ projectId: "p1", monthKey: "2026-09" });
  expect(JSON.parse(provider.mock.calls[0][1].body).html).toContain(brand);
});
it.each(["error", "throw"])(
  "fails closed to unbranded email on entitlement read %s",
  async (failure) => {
    setWorkspaceSubscription({ planId: "agency", status: "active" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      if (failure === "throw") mocks.entitlement.mockRejectedValue(new Error("unavailable"));
      else
        mocks.entitlement.mockResolvedValue({
          data: { plan_id: "agency", status: "active" },
          error: { message: "unavailable" },
        });
      await call({ projectId: "p1", monthKey: "2026-09" });
      expect(JSON.parse(provider.mock.calls[0][1].body).html).not.toContain(brand);
    } finally {
      log.mockRestore();
    }
  },
);

it.each([
  ["missing", null, null],
  ["omitted", undefined, null],
  ["negative", -1, null],
  ["fractional", 1.5, null],
  ["non-finite", Infinity, null],
  ["unsafe", Number.MAX_SAFE_INTEGER + 1, null],
  ["string", "3", null],
  ["known zero", 0, 0],
  ["known positive", 3, 3],
])("preserves %s link-count evidence in screen and email", async (_label, count, expected) => {
  mocks.links.mockResolvedValue({ count, error: null });
  await expect(
    (getProofLinksLiveFn as unknown as (args: unknown) => Promise<unknown>)({
      data: { projectId: "p1" },
      context,
    }),
  ).resolves.toEqual({ linksLive: expected });
  await call({ projectId: "p1", monthKey: "2026-09" });
  const html = JSON.parse(provider.mock.calls[0][1].body).html;
  const label = proofReportEmailCopy.de["report.stat.linksLive"];
  if (expected === null) expect(html).not.toContain(label);
  else {
    expect(html).toContain(label);
    expect(html).toContain(`>${expected}</td>`);
  }
});

it.each(["query error", "rejection"])("keeps %s link counts unknown", async (failure) => {
  if (failure === "query error")
    mocks.links.mockResolvedValue({ count: 9, error: { message: "unavailable" } });
  else mocks.links.mockRejectedValue(new Error("unavailable"));
  await expect(
    (getProofLinksLiveFn as unknown as (args: unknown) => Promise<unknown>)({
      data: { projectId: "p1" },
      context,
    }),
  ).resolves.toEqual({ linksLive: null });
});

it.each(["screen", "email"])("bounds a stalled link lookup for the %s", async (surface) => {
  vi.useFakeTimers();
  let settle!: (value: { count: number; error: null }) => void;
  mocks.links.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  try {
    const pending =
      surface === "screen"
        ? (getProofLinksLiveFn as unknown as (args: unknown) => Promise<unknown>)({
            data: { projectId: "p1" },
            context,
          })
        : call({ projectId: "p1", monthKey: "2026-09" });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(mocks.links).toHaveBeenCalledOnce();
    expect(provider).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual(
      surface === "screen" ? { linksLive: null } : { sent: true },
    );
    if (surface === "email") {
      expect(provider).toHaveBeenCalledOnce();
      expect(JSON.parse(provider.mock.calls[0][1].body).html).not.toContain(
        proofReportEmailCopy.de["report.stat.linksLive"],
      );
    }
    settle({ count: 7, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(provider).toHaveBeenCalledTimes(surface === "email" ? 1 : 0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("clears the link lookup deadline after a prompt response", async () => {
  vi.useFakeTimers();
  try {
    await (getProofLinksLiveFn as unknown as (args: unknown) => Promise<unknown>)({
      data: { projectId: "p1" },
      context,
    });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
