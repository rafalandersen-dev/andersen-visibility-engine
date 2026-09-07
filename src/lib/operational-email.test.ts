import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  deliverOneOperationalDigest,
  renderOperationalDigest,
  runOperationalEmailWorker,
  type OperationalEmailDependencies,
} from "./operational-email.server";
vi.mock("./operational-notifications.server", () => ({ refreshOperationalNotifications: vi.fn() }));
const id = "00000000-0000-4000-8000-000000000010",
  user = "00000000-0000-4000-8000-000000000031",
  lease = "00000000-0000-4000-8000-000000000050";
const digest = {
  locale: "pl",
  items: [
    {
      id,
      projectId: "p",
      targetId: "a",
      kind: "approval_due",
      title: '<script>alert("x")</script>',
      dueAt: "2026-09-07T12:00:00Z",
      detail: { timeZone: "Europe/Stockholm" },
    },
  ],
};
let rpc: Mock<OperationalEmailDependencies["rpc"]>,
  refresh: Mock<OperationalEmailDependencies["refresh"]>,
  recipient: Mock<OperationalEmailDependencies["recipient"]>,
  send: Mock<OperationalEmailDependencies["send"]>,
  deps: OperationalEmailDependencies;
beforeEach(() => {
  vi.unstubAllEnvs();
  rpc = vi.fn(async (name: string) => ({
    data:
      name === "claim_operational_email_digest"
        ? [{ id, user_id: user, lease_token: lease }]
        : name === "begin_operational_email_delivery"
          ? digest
          : true,
    error: null,
  }));
  refresh = vi.fn(async () => true);
  recipient = vi.fn(async () => ({
    email: "recipient@example.test",
    unsubscribeToken: "test-unsubscribe-token",
  }));
  send = vi.fn(async () => ({ success: true }));
  deps = { rpc, refresh, recipient, send };
});
describe("operational digest delivery boundary", () => {
  it("does nothing when the release gate is absent", async () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "");
    expect(await runOperationalEmailWorker()).toEqual({ enabled: false, processed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("stops on an empty queue", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await deliverOneOperationalDigest(deps)).toBe("empty");
    expect(send).not.toHaveBeenCalled();
  });
  it("fails closed for malformed claims", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id }], error: null });
    await expect(deliverOneOperationalDigest(deps)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("refreshes the claimed account and resolves its recipient before beginning transport", async () => {
    expect(await deliverOneOperationalDigest(deps)).toBe("accepted");
    expect(refresh).toHaveBeenCalledWith(user);
    expect(recipient).toHaveBeenCalledWith(user);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ id, email: "recipient@example.test" }),
    );
    expect(rpc).toHaveBeenLastCalledWith("finish_operational_email_delivery", {
      p_id: id,
      p_lease: lease,
      p_outcome: "accepted",
    });
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(recipient.mock.invocationCallOrder[0]);
    expect(recipient.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
  });
  it.each([false, "throw"])(
    "defers without email when a fresh scan is unavailable (%s)",
    async (mode) => {
      if (mode === false) refresh.mockResolvedValueOnce(false);
      else refresh.mockRejectedValueOnce(new Error("private snapshot"));
      expect(await deliverOneOperationalDigest(deps)).toBe("deferred");
      expect(send).not.toHaveBeenCalled();
      expect(recipient).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenLastCalledWith("finish_operational_email_delivery", {
        p_id: id,
        p_lease: lease,
        p_outcome: "preflight_unavailable",
      });
    },
  );
  it("never sends when recipient/suppression preflight fails", async () => {
    recipient.mockRejectedValueOnce(new Error("suppressed"));
    expect(await deliverOneOperationalDigest(deps)).toBe("deferred");
    expect(send).not.toHaveBeenCalled();
  });
  it("does not send a digest cancelled by the last state check", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "claim_operational_email_digest"
          ? [{ id, user_id: user, lease_token: lease }]
          : null,
      error: null,
    }));
    expect(await deliverOneOperationalDigest(deps)).toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
  });
  it("records an ambiguous provider error without retrying", async () => {
    send.mockRejectedValueOnce(new Error("private provider response"));
    expect(await deliverOneOperationalDigest(deps)).toBe("unknown");
    expect(send).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenLastCalledWith("finish_operational_email_delivery", {
      p_id: id,
      p_lease: lease,
      p_outcome: "unknown",
    });
  });
  it("does not mislabel a provider success:false as accepted", async () => {
    send.mockResolvedValueOnce({ success: false });
    expect(await deliverOneOperationalDigest(deps)).toBe("unknown");
  });
  it("does not resend when accepted-result reconciliation fails", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "claim_operational_email_digest"
          ? [{ id, user_id: user, lease_token: lease }]
          : name === "begin_operational_email_delivery"
            ? digest
            : false,
      error: null,
    }));
    await expect(deliverOneOperationalDigest(deps)).rejects.toThrow(
      "email_reconciliation_unavailable",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed prepared content after durable sending state", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "claim_operational_email_digest"
          ? [{ id, user_id: user, lease_token: lease }]
          : name === "begin_operational_email_delivery"
            ? {}
            : true,
      error: null,
    }));
    expect(await deliverOneOperationalDigest(deps)).toBe("unknown");
    expect(send).not.toHaveBeenCalled();
  });
});
describe("operational digest rendering", () => {
  it("escapes supplied titles and keeps links on the authenticated notifications page", () => {
    const rendered = renderOperationalDigest(digest);
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain('href="https://milogrowth.com/app/notifications"');
    expect(rendered.text).toContain("Europe/Stockholm");
    expect(rendered.html).not.toContain("/api/");
  });
  it.each(["en", "pl", "sv", "da"])("provides complete copy for %s", (locale) => {
    const rendered = renderOperationalDigest({ ...digest, locale });
    expect(rendered.subject).toBeTruthy();
    expect(rendered.html).not.toContain("undefined");
    expect(rendered.text.length).toBeGreaterThan(100);
  });
  it("rejects an unsupported language instead of sending an invented fallback", () => {
    expect(() => renderOperationalDigest({ ...digest, locale: "xx" })).toThrow();
  });
});
