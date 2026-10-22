/**
 * Boundary regressions for the Lovable email queue worker
 * (`src/routes/lovable/email/queue/process.ts`) after the 30 September Lovable
 * delta: error logging narrowed to `code`/`message` and bracketed env lookups.
 * The send, retry, DLQ and authorization semantics must be unchanged.
 * No network: `@lovable.dev/email-js` and `@supabase/supabase-js` are mocked and
 * every value is synthetic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  send: vi.fn(),
  calls: [] as Array<{ kind: string; table?: string; name?: string; args?: unknown }>,
  state: null as Record<string, unknown> | null,
  batches: {} as Record<string, { data: unknown; error: unknown }>,
  failedRows: { data: [] as unknown[], error: null as unknown },
  alreadySent: null as unknown,
  rpcErrors: {} as Record<string, unknown>,
}));

vi.mock("@lovable.dev/email-js", () => ({ sendLovableEmail: h.send }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@supabase/supabase-js", () => {
  const chain = (table: string) => {
    const filters: unknown[] = [];
    const q = {
      select: () => q,
      in: (...a: unknown[]) => (filters.push(["in", ...a]), q),
      eq: (...a: unknown[]) => (filters.push(["eq", ...a]), q),
      single: async () => ({ data: h.state, error: null }),
      maybeSingle: async () => ({ data: h.alreadySent, error: null }),
      insert: async (row: unknown) => {
        h.calls.push({ kind: "insert", table, args: row });
        return { error: null };
      },
      update: (row: unknown) => {
        h.calls.push({ kind: "update", table, args: row });
        return { eq: async () => ({ error: null }) };
      },
      then: (resolve: (v: unknown) => unknown) =>
        resolve(table === "email_send_log" ? h.failedRows : { data: null, error: null }),
    };
    return q;
  };
  return {
    createClient: (url: string, key: string) => {
      h.calls.push({ kind: "client", args: { url, key } });
      return {
        from: chain,
        rpc: async (name: string, args: Record<string, unknown>) => {
          h.calls.push({ kind: "rpc", name, args });
          if (name === "read_email_batch")
            return h.batches[args.queue_name as string] ?? { data: [], error: null };
          return { data: null, error: h.rpcErrors[name] ?? null };
        },
      };
    },
  };
});

import { Route } from "@/routes/lovable/email/queue/process";

const SERVICE = "service-role-test-key";
const handler = (
  Route as unknown as {
    options: { server: { handlers: { POST: (a: { request: Request }) => Promise<Response> } } };
  }
).options.server.handlers.POST;
const call = (auth: string | null = `Bearer ${SERVICE}`) =>
  handler({
    request: new Request("https://worker.test/lovable/email/queue/process", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    }),
  });
const message = (id: number, extra: Record<string, unknown> = {}) => ({
  msg_id: id,
  read_ct: 1,
  enqueued_at: new Date().toISOString(),
  message: {
    message_id: `m-${id}`,
    to: "recipient@example.invalid",
    from: "sender@example.invalid",
    subject: "Synthetic",
    label: "synthetic_label",
    ...extra,
  },
});
const rpcs = (name: string) => h.calls.filter((c) => c.kind === "rpc" && c.name === name);
const inserts = () => h.calls.filter((c) => c.kind === "insert");
const supabaseError = {
  code: "PGRST000",
  message: "synthetic failure",
  details: "row-level detail that must not be logged",
  hint: "hint that must not be logged",
};

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.send.mockReset();
  h.calls = [];
  h.state = null;
  h.batches = {};
  h.failedRows = { data: [], error: null };
  h.alreadySent = null;
  h.rpcErrors = {};
  vi.stubEnv("LOVABLE_API_KEY", "lovable-test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE);
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("LOVABLE_SEND_URL", "https://send.lovable.test");
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authorization and configuration (unchanged)", () => {
  it("refuses with 500 when an env value is missing, before any client or send", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await call();
    expect(res.status).toBe(500);
    expect(h.calls).toEqual([]);
    expect(h.send).not.toHaveBeenCalled();
  });
  it("401 without a bearer token and 403 for a wrong token", async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(403);
    expect(h.calls).toEqual([]);
  });
  it("reads the bracketed env values: client URL/key and send credentials", async () => {
    h.batches.auth_emails = { data: [message(1)], error: null };
    h.send.mockResolvedValue(undefined);
    const res = await call();
    expect(await res.json()).toEqual({ processed: 1 });
    expect(h.calls[0]).toEqual({
      kind: "client",
      args: { url: "https://project.supabase.test", key: SERVICE },
    });
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ message_id: "m-1" }), {
      apiKey: "lovable-test-key",
      sendUrl: "https://send.lovable.test",
    });
  });
});

describe("send / retry / DLQ semantics (unchanged)", () => {
  it("success: logs sent, deletes the message, auth queue before transactional", async () => {
    h.batches.auth_emails = { data: [message(1)], error: null };
    h.batches.transactional_emails = { data: [message(2)], error: null };
    h.send.mockResolvedValue(undefined);
    expect(await (await call()).json()).toEqual({ processed: 2 });
    expect(
      rpcs("read_email_batch").map((c) => (c.args as { queue_name: string }).queue_name),
    ).toEqual(["auth_emails", "transactional_emails"]);
    expect(inserts().map((c) => (c.args as { status: string }).status)).toEqual(["sent", "sent"]);
    expect(rpcs("delete_email")).toHaveLength(2);
  });

  it("rate limit (429): logs a failure, sets retry_after and stops the batch", async () => {
    h.batches.auth_emails = { data: [message(1), message(2)], error: null };
    h.send.mockRejectedValue(
      Object.assign(new Error("429"), { status: 429, retryAfterSeconds: 30 }),
    );
    expect(await (await call()).json()).toEqual({ processed: 0, stopped: "rate_limited" });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.calls.some((c) => c.kind === "update" && c.table === "email_send_state")).toBe(true);
    expect(rpcs("move_to_dlq")).toEqual([]);
  });

  it("forbidden (403): moves straight to DLQ and stops", async () => {
    h.batches.auth_emails = { data: [message(1), message(2)], error: null };
    h.send.mockRejectedValue(Object.assign(new Error("403"), { status: 403 }));
    expect(await (await call()).json()).toEqual({ processed: 0, stopped: "forbidden" });
    expect(rpcs("move_to_dlq")).toHaveLength(1);
  });

  it("other failure: logs failed, keeps the message for the next cycle", async () => {
    h.batches.auth_emails = { data: [message(1)], error: null };
    h.send.mockRejectedValue(new Error("boom"));
    expect(await (await call()).json()).toEqual({ processed: 0 });
    expect(inserts().map((c) => (c.args as { status: string }).status)).toEqual(["failed"]);
    expect(rpcs("delete_email")).toEqual([]);
    expect(rpcs("move_to_dlq")).toEqual([]);
  });

  it("max retries and TTL expiry go to DLQ without sending", async () => {
    h.failedRows = { data: Array.from({ length: 5 }, () => ({ message_id: "m-1" })), error: null };
    h.batches.auth_emails = {
      data: [message(1), message(2, { queued_at: new Date(Date.now() - 3_600_000).toISOString() })],
      error: null,
    };
    expect(await (await call()).json()).toEqual({ processed: 0 });
    expect(h.send).not.toHaveBeenCalled();
    expect(rpcs("move_to_dlq")).toHaveLength(2);
  });

  it("an already-sent message is deleted, not re-sent", async () => {
    h.batches.auth_emails = { data: [message(1)], error: null };
    h.alreadySent = { id: "x" };
    await call();
    expect(h.send).not.toHaveBeenCalled();
    expect(rpcs("delete_email")).toHaveLength(1);
  });
});

describe("narrowed error logging (the delta)", () => {
  const logged = (): Record<string, unknown>[] =>
    errors.mock.calls.map((c: unknown[]) => c[1] as Record<string, unknown>);

  it("logs only code and message for read, counter, delete and DLQ errors", async () => {
    h.batches.auth_emails = { data: null, error: supabaseError };
    h.batches.transactional_emails = { data: [message(1), message(2)], error: null };
    h.failedRows = { data: [], error: supabaseError };
    h.rpcErrors.delete_email = supabaseError;
    h.rpcErrors.move_to_dlq = supabaseError;
    h.send
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error("403"), { status: 403 }));
    await call();
    const entries = logged().filter(Boolean);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    for (const entry of entries.filter((e) => "code" in e)) {
      expect(entry).toMatchObject({ code: "PGRST000", message: "synthetic failure" });
      expect(entry).not.toHaveProperty("error");
      expect(JSON.stringify(entry)).not.toMatch(/row-level detail|hint that/);
    }
    expect(entries.filter((e) => "code" in e)).toHaveLength(4);
  });
});
