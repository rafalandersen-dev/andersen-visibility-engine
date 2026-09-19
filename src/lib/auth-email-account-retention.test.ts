import { EMAIL_LANGUAGE_CODES } from "./email-languages";
import { authEmailPresentation } from "./auth-email-presentation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  generateLink: vi.fn(),
  deleteUser: vi.fn(),
  send: vi.fn(),
  render: vi.fn(),
  log: vi.fn(),
  tokens: vi.fn(),
  insertToken: vi.fn(),
  admit: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (value: unknown) => value;
    const builder = {
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler:
        (fn: (args: { data: unknown }) => Promise<unknown>) => async (args: { data: unknown }) =>
          fn({ data: parse(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { admin: { generateLink: h.generateLink, deleteUser: h.deleteUser } },
    from: (table: string) => {
      if (table === "email_send_log") return { insert: h.log };
      if (table === "email_unsubscribe_tokens")
        return {
          select: () => ({ eq: () => ({ maybeSingle: h.tokens }) }),
          insert: h.insertToken,
        };
      throw new Error("Unexpected test table");
    },
  }),
}));
vi.mock("./auth-email-admission.server", () => ({ admitAuthEmail: h.admit }));
vi.mock("@lovable.dev/email-js", () => ({ sendLovableEmail: h.send }));
vi.mock("react-email", () => ({ render: h.render }));

import {
  signupWithBrandedEmailFn,
  requestPasswordResetWithBrandedEmailFn,
} from "./auth-email.functions";

// Synthetic metadata only. No authentication, mail or database transport is used.
const now = Date.parse("2026-09-12T08:00:00Z");
const signup = {
  email: "person@example.invalid",
  password: "x".repeat(16),
  displayName: "Test account",
  redirectTo: "https://app.example.invalid/app",
};
function linkResult(createdAt: string | undefined) {
  return {
    data: {
      user: { id: "returned-account", created_at: createdAt },
      properties: { action_link: "https://auth.example.invalid/confirm" },
    },
    error: null,
  };
}
const call = (fn: unknown, data: unknown = signup) =>
  (fn as (args: { data: unknown }) => Promise<unknown>)({ data });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SUPABASE_URL", "https://auth.example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-placeholder");
  vi.stubEnv("LOVABLE_API_KEY", "test-only-placeholder");
  h.generateLink.mockResolvedValue(linkResult(new Date(now - 10_000).toISOString()));
  h.deleteUser.mockResolvedValue({ error: null });
  h.send.mockResolvedValue({});
  h.render.mockResolvedValue("Test email body");
  h.log.mockResolvedValue({ error: null });
  h.tokens.mockResolvedValue({ data: { token: "test-only-unsubscribe-placeholder" }, error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("confirmation-email failure never authorizes account deletion", () => {
  it.each([
    ["an existing account created ten seconds ago", new Date(now - 10_000).toISOString()],
    ["a newly created account", new Date(now).toISOString()],
    ["a future account timestamp", new Date(now + 60_000).toISOString()],
    ["an older account", new Date(now - 120_000).toISOString()],
    ["missing creation metadata", undefined],
    ["invalid creation metadata", "invalid"],
  ])("retains %s when delivery fails", async (_description, createdAt) => {
    h.generateLink.mockResolvedValue(linkResult(createdAt));
    h.send.mockRejectedValue(new Error("Synthetic email failure"));
    await expect(call(signupWithBrandedEmailFn)).rejects.toThrow(
      "We could not send the email right now",
    );
    expect(h.generateLink).toHaveBeenCalledOnce();
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.log.mock.calls.map(([entry]) => entry.status)).toEqual(["pending", "failed"]);
  });

  it("does not delete a shared returned account when one overlapping request succeeds", async () => {
    h.send.mockRejectedValueOnce(new Error("Synthetic email failure")).mockResolvedValueOnce({});
    const results = await Promise.allSettled([
      call(signupWithBrandedEmailFn),
      call(signupWithBrandedEmailFn),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(h.generateLink).toHaveBeenCalledTimes(2);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("retains the account if the renderer fails before delivery", async () => {
    h.render.mockRejectedValue(new Error("Synthetic rendering failure"));
    await expect(call(signupWithBrandedEmailFn)).rejects.toThrow("Synthetic rendering failure");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses signup before generating a link if email configuration is unavailable", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    await expect(call(signupWithBrandedEmailFn)).rejects.toThrow("Email service is not configured");
    expect(h.generateLink).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("keeps successful signup parameters and the success response", async () => {
    await expect(call(signupWithBrandedEmailFn)).resolves.toEqual({ ok: true });
    expect(h.generateLink).toHaveBeenCalledExactlyOnceWith({
      type: "signup",
      email: signup.email,
      password: signup.password,
      options: { redirectTo: signup.redirectTo, data: { display_name: signup.displayName } },
    });
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.log.mock.calls.map(([entry]) => entry.status)).toEqual(["pending", "sent"]);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("stops on link-generation failure without sending or deleting", async () => {
    h.generateLink.mockResolvedValue({ data: null, error: { message: "Synthetic link failure" } });
    await expect(call(signupWithBrandedEmailFn)).rejects.toThrow("Synthetic link failure");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("preserves the generic recovery response when no link is returned", async () => {
    h.generateLink.mockResolvedValue({
      data: null,
      error: { message: "Synthetic missing account" },
    });
    await expect(
      call(requestPasswordResetWithBrandedEmailFn, {
        email: signup.email,
        redirectTo: "https://app.example.invalid/reset-password",
      }),
    ).resolves.toEqual({ ok: true });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses recovery before generating a link when email configuration is missing", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    await expect(
      call(requestPasswordResetWithBrandedEmailFn, {
        email: signup.email,
        redirectTo: "https://app.example.invalid/reset-password",
      }),
    ).rejects.toThrow("Email service is not configured");
    expect(h.generateLink).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.log).not.toHaveBeenCalled();
  });

  it.each([signupWithBrandedEmailFn, requestPasswordResetWithBrandedEmailFn])(
    "keeps raw delivery errors out of persisted diagnostics and returned errors",
    async (fn) => {
      const marker = "synthetic-private-payload-marker";
      h.send.mockRejectedValue(new Error(marker));
      await expect(call(fn)).rejects.toThrow("We could not send the email right now");
      expect(h.log.mock.calls.map(([entry]) => entry.status)).toEqual(["pending", "failed"]);
      expect(h.log.mock.calls.at(-1)?.[0].error_message).toBe("auth_email_delivery_failed");
      expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
      expect(h.deleteUser).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid signup input before any administrative operation", async () => {
    await expect(call(signupWithBrandedEmailFn, { ...signup, email: "invalid" })).rejects.toThrow();
    expect(h.generateLink).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });
});

describe("authentication request email language", () => {
  it.each(EMAIL_LANGUAGE_CODES)(
    "dispatches explicit %s only as message presentation",
    async (emailLanguage) => {
      for (const [fn, kind] of [
        [signupWithBrandedEmailFn, "signup"],
        [requestPasswordResetWithBrandedEmailFn, "reset"],
      ] as const) {
        h.generateLink.mockClear();
        h.send.mockClear();
        h.render.mockClear();
        await expect(call(fn, { ...signup, emailLanguage })).resolves.toEqual({ ok: true });
        expect(h.render).toHaveBeenCalledTimes(2);
        for (const [element] of h.render.mock.calls)
          expect(element.props.language).toBe(emailLanguage);
        expect(h.send.mock.calls[0][0]).toMatchObject({
          to: signup.email,
          from: "Milo Growth <noreply@milogrowth.com>",
          subject: authEmailPresentation(emailLanguage, kind, "Milo Growth").subject,
        });
        const args = h.generateLink.mock.calls[0][0];
        expect(args.email).toBe(signup.email);
        expect(args.options.redirectTo).toBe(signup.redirectTo);
        expect(JSON.stringify(args)).not.toContain("emailLanguage");
        expect(h.deleteUser).not.toHaveBeenCalled();
      }
    },
  );
  it.each([signupWithBrandedEmailFn, requestPasswordResetWithBrandedEmailFn])(
    "rejects unsupported language before account or delivery calls",
    async (fn) => {
      await expect(call(fn, { ...signup, emailLanguage: "xx" })).rejects.toThrow();
      expect(h.generateLink).not.toHaveBeenCalled();
      expect(h.send).not.toHaveBeenCalled();
    },
  );
});

describe("provider acceptance survives a later diagnostic failure", () => {
  it.each([
    ["signup", signupWithBrandedEmailFn],
    ["recovery", requestPasswordResetWithBrandedEmailFn],
  ])("keeps %s successful when the sent-log request rejects", async (_kind, fn) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.log
      .mockResolvedValueOnce({ error: null })
      .mockRejectedValueOnce(new Error("Synthetic private diagnostic detail"));
    await expect(call(fn)).resolves.toEqual({ ok: true });
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.generateLink).toHaveBeenCalledOnce();
    expect(h.log.mock.calls.map(([entry]) => entry.status)).toEqual(["pending", "sent"]);
    expect(warn.mock.calls).toEqual([["auth_email_sent_log_failed"]]);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["signup", signupWithBrandedEmailFn],
    ["recovery", requestPasswordResetWithBrandedEmailFn],
  ])("keeps %s successful when the sent-log response contains an error", async (_kind, fn) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.log.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({
      error: { message: "Synthetic private diagnostic detail" },
    });
    await expect(call(fn)).resolves.toEqual({ ok: true });
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.log.mock.calls.map(([entry]) => entry.status)).toEqual(["pending", "sent"]);
    expect(warn.mock.calls).toEqual([["auth_email_sent_log_failed"]]);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });
});

describe("private token diagnostics remain bounded", () => {
  const privateDetail = "Synthetic recipient and token diagnostic";
  for (const [kind, fn] of [
    ["signup", signupWithBrandedEmailFn],
    ["recovery", requestPasswordResetWithBrandedEmailFn],
  ] as const) {
    it.each([
      "lookup response",
      "lookup rejection",
      "insert response",
      "insert rejection",
      "race rejection",
    ])(`${kind} sanitizes %s failures before sending`, async (failure) => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = { message: privateDetail };
      if (failure === "lookup response") h.tokens.mockResolvedValueOnce({ data: null, error });
      else if (failure === "lookup rejection")
        h.tokens.mockRejectedValueOnce(new Error(privateDetail));
      else {
        h.tokens.mockResolvedValueOnce({ data: null, error: null });
        if (failure === "insert rejection")
          h.insertToken.mockRejectedValueOnce(new Error(privateDetail));
        else {
          h.insertToken.mockResolvedValueOnce({ error });
          if (failure === "race rejection")
            h.tokens.mockRejectedValueOnce(new Error(privateDetail));
          else h.tokens.mockResolvedValueOnce({ data: null, error });
        }
      }
      await expect(call(fn)).rejects.toThrow("Email service is not configured correctly.");
      expect(errorLog.mock.calls).toEqual([
        [
          failure.startsWith("lookup")
            ? "auth_email_token_lookup_failed"
            : "auth_email_token_create_failed",
        ],
      ]);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.log).not.toHaveBeenCalled();
      expect(h.deleteUser).not.toHaveBeenCalled();
    });
    it(`${kind} reuses the winning token after an insert race`, async () => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      h.tokens.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({
        data: { token: "synthetic-winning-token" },
        error: null,
      });
      h.insertToken.mockResolvedValueOnce({ error: { message: privateDetail } });
      await expect(call(fn)).resolves.toEqual({ ok: true });
      expect(h.send.mock.calls[0][0].unsubscribe_token).toBe("synthetic-winning-token");
      expect(h.send).toHaveBeenCalledOnce();
      expect(errorLog).not.toHaveBeenCalled();
    });
  }
});

it.each([signupWithBrandedEmailFn, requestPasswordResetWithBrandedEmailFn])(
  "refuses admission before administrative link generation and email sending",
  async (fn) => {
    h.admit.mockRejectedValueOnce(new Error("Too many email requests."));
    await expect(call(fn)).rejects.toThrow("Too many email requests.");
    expect(h.admit).toHaveBeenCalledOnce();
    expect(h.generateLink).not.toHaveBeenCalled();
    expect(h.render).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.tokens).not.toHaveBeenCalled();
  },
);
