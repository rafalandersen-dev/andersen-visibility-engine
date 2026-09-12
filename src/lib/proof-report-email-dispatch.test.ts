import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { proofReportEmailCopy } from "@/i18n/proof-report-email-copy";
const mocks = vi.hoisted(() => ({ preference: vi.fn(), workspace: vi.fn(), middleware: vi.fn() }));
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
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: 0, error: null }).then(resolve),
      };
      return q;
    },
  },
}));
import { emailProofReportFn } from "./proof-report.functions";
const context = { userId: "caller-id", claims: { email: "caller@example.test" } };
const call = (data: unknown, ctx: unknown = context) =>
  (emailProofReportFn as unknown as (args: unknown) => Promise<unknown>)({ data, context: ctx });
let provider = vi.fn();
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "unit-test-placeholder");
  vi.stubEnv("OUTREACH_FROM_EMAIL", "sender@example.test");
  mocks.preference.mockReset().mockResolvedValue("de");
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
