import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  address: vi.fn(),
  enabled: vi.fn(),
  query: vi.fn(),
  filters: vi.fn(),
  middleware: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { kind: "authenticated" },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    const builder = {
      middleware: (value: unknown) => {
        mocks.middleware(value);
        return builder;
      },
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data?: unknown; context: unknown }) =>
        fn({ ...args, data: args.data === undefined ? undefined : validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./operational-email.server", () => ({
  operationalEmailEnabled: mocks.enabled,
  readOperationalEmailAddress: mocks.address,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          mocks.filters(table, column, value);
          return q;
        },
        maybeSingle: () => q,
        order: () => q,
        limit: () => q,
        then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) =>
          mocks.query(table).then(resolve, reject),
      };
      return q;
    },
  },
}));
import {
  getOperationalEmailSettingsFn,
  setOperationalEmailSettingsFn,
  setOperationalEmailLanguageFn,
} from "./operational-email.functions";
import { EMAIL_LANGUAGE_CODES } from "./email-languages";
const userId = "00000000-0000-4000-8000-000000000011";
const call = (fn: unknown, ctx: unknown, data?: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ context: ctx, data });
const context = () => ({
  userId,
  supabase: { rpc: vi.fn(async () => ({ data: true, error: null })) },
});
beforeEach(() => {
  mocks.address
    .mockReset()
    .mockResolvedValue({ status: "verified", email: "private@example.test" });
  mocks.enabled.mockReset().mockReturnValue(true);
  mocks.filters.mockClear();
  mocks.query.mockReset().mockImplementation(async (table) => ({
    data: table === "operational_email_outbox" ? [] : { enabled: false, locale: "en" },
    error: null,
  }));
});
describe("operational email settings recipient boundary", () => {
  it("keeps authentication middleware on both settings actions", () => {
    expect(mocks.middleware.mock.calls).toHaveLength(3);
    for (const [middlewares] of mocks.middleware.mock.calls)
      expect(middlewares).toEqual([{ kind: "authenticated" }]);
  });
  it("reports only verification status and owner-scoped settings, never the email or identity payload", async () => {
    const result = await call(getOperationalEmailSettingsFn, context());
    expect(result).toEqual({
      ready: true,
      addressVerification: "verified",
      preference: { enabled: false, locale: "en" },
      history: [],
    });
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(mocks.address).toHaveBeenCalledWith(userId);
    expect(mocks.filters).toHaveBeenCalledWith("operational_email_preferences", "user_id", userId);
    expect(mocks.filters).toHaveBeenCalledWith("operational_email_outbox", "user_id", userId);
  });
  it.each(["unverified", "unavailable"])(
    "keeps settings readable during %s address status",
    async (status) => {
      mocks.address.mockResolvedValue({ status });
      expect(await call(getOperationalEmailSettingsFn, context())).toMatchObject({
        addressVerification: status,
        history: [],
      });
    },
  );
  it.each(["unverified", "unavailable"])(
    "rejects enabling while the current address is %s before preference mutation",
    async (status) => {
      const ctx = context();
      mocks.address.mockResolvedValue({ status });
      await expect(
        call(setOperationalEmailSettingsFn, ctx, { enabled: true, locale: "pl" }),
      ).rejects.toThrow("Confirm your current account email");
      expect(ctx.supabase.rpc).not.toHaveBeenCalled();
    },
  );
  it("rechecks the current address on enable rather than trusting the earlier settings read", async () => {
    const ctx = context();
    await call(getOperationalEmailSettingsFn, ctx);
    mocks.address.mockResolvedValue({ status: "unverified" });
    await expect(
      call(setOperationalEmailSettingsFn, ctx, { enabled: true, locale: "en" }),
    ).rejects.toThrow();
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
  });
  it("preserves the activation flag and skips recipient work when delivery is disabled", async () => {
    const ctx = context();
    mocks.enabled.mockReturnValue(false);
    await expect(
      call(setOperationalEmailSettingsFn, ctx, { enabled: true, locale: "en" }),
    ).rejects.toThrow("not activated");
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
    expect(mocks.address).not.toHaveBeenCalled();
  });
  it("always allows turning summaries off without a verification dependency", async () => {
    const ctx = context();
    mocks.enabled.mockReturnValue(false);
    mocks.address.mockResolvedValue({ status: "unavailable" });
    expect(
      await call(setOperationalEmailSettingsFn, ctx, { enabled: false, locale: "pl" }),
    ).toEqual({ saved: true });
    expect(mocks.address).not.toHaveBeenCalled();
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("set_operational_email_preference", {
      p_enabled: false,
      p_locale: "pl",
    });
  });
  it("only enables after a fresh verified address and through the caller-scoped RPC", async () => {
    const ctx = context();
    expect(await call(setOperationalEmailSettingsFn, ctx, { enabled: true, locale: "pl" })).toEqual(
      { saved: true },
    );
    expect(mocks.address).toHaveBeenCalledWith(userId);
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("set_operational_email_preference", {
      p_enabled: true,
      p_locale: "pl",
    });
  });
  it("rejects a client-supplied recipient or account override", () => {
    const ctx = context();
    expect(() =>
      call(setOperationalEmailSettingsFn, ctx, {
        enabled: true,
        locale: "en",
        userId: "other",
        email: "other@example.test",
      }),
    ).toThrow();
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
  });
});
it.each(EMAIL_LANGUAGE_CODES)(
  "saves %s as a language-only preference without enabling, resolving a recipient or checking the delivery gate",
  async (locale) => {
    const ctx = context();
    mocks.enabled.mockReturnValue(false);
    mocks.address.mockResolvedValue({ status: "unavailable" });
    await expect(call(setOperationalEmailLanguageFn, ctx, { locale })).resolves.toEqual({
      saved: true,
    });
    expect(ctx.supabase.rpc).toHaveBeenCalledExactlyOnceWith("set_operational_email_language", {
      p_locale: locale,
    });
    expect(mocks.enabled).not.toHaveBeenCalled();
    expect(mocks.address).not.toHaveBeenCalled();
  },
);
it("refuses enabling or addressing fields in a language-only save", () => {
  const ctx = context();
  for (const data of [
    { locale: "de", enabled: true },
    { locale: "de", userId },
    { locale: "de", email: "foreign@example.test" },
    { locale: "xx" },
    { locale: "en-US" },
  ])
    expect(() => call(setOperationalEmailLanguageFn, ctx, data)).toThrow();
  expect(ctx.supabase.rpc).not.toHaveBeenCalled();
});
it("withholds private RPC errors from a language-only response", async () => {
  const ctx = context();
  ctx.supabase.rpc.mockRejectedValue(new Error("private database and credential information"));
  await expect(call(setOperationalEmailLanguageFn, ctx, { locale: "de" })).rejects.toThrow(
    "Email language could not be confirmed.",
  );
  expect(ctx.supabase.rpc).toHaveBeenCalledOnce();
});
it("bounds a lost language-save response without retrying the uncertain mutation", async () => {
  vi.useFakeTimers();
  try {
    const ctx = context();
    ctx.supabase.rpc.mockImplementation(() => new Promise(() => {}));
    const pending = call(setOperationalEmailLanguageFn, ctx, { locale: "de" });
    const assertion = expect(pending).rejects.toThrow("Reload the saved settings");
    await vi.advanceTimersByTimeAsync(10001);
    await assertion;
    expect(ctx.supabase.rpc).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
