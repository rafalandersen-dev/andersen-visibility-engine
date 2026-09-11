import { describe, it, expect, vi } from "vitest";
import { technicalConnectionAdmission } from "./technical-crawl-admission.server";
const user = "00000000-0000-4000-8000-000000000001",
  run = "00000000-0000-4000-8000-000000000002",
  lease = "00000000-0000-4000-8000-000000000003",
  origin = "https://example.test";
const record = () => ({
  data: { lease, expiresAt: new Date(Date.now() + 20000).toISOString() },
  error: null,
});
describe("scoped connection admission", () => {
  it("holds on uncertain admission transport failure before any connection", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("private transport detail");
    });
    await expect(
      technicalConnectionAdmission(
        user,
        "p",
        run,
        lease,
        origin,
        rpc,
      )(origin, new AbortController().signal),
    ).rejects.toMatchObject({
      reason: "ownership",
      message: "technical_crawl_admission_ownership",
    });
  });

  it("uses server-bound run scope and releases its exact admitted token", async () => {
    const rpc = vi.fn(async () => record());
    const admit = technicalConnectionAdmission(user, "p", run, lease, origin, rpc);
    const release = await admit(origin + "/page?q=1", new AbortController().signal);
    expect(rpc).toHaveBeenCalledWith("acquire_technical_crawl_dispatch", {
      p_user: user,
      p_project: "p",
      p_run: run,
      p_run_lease: lease,
      p_origin: origin,
    });
    await release();
    expect(rpc).toHaveBeenLastCalledWith("release_technical_crawl_dispatch", {
      p_user: user,
      p_origin: origin,
      p_lease: lease,
    });
  });
  it("refuses foreign origins or already cancelled requests before RPC", async () => {
    const rpc = vi.fn(async () => record());
    const admit = technicalConnectionAdmission(user, "p", run, lease, origin, rpc);
    await expect(admit("https://other.test", new AbortController().signal)).rejects.toMatchObject({
      reason: "ownership",
    });
    await expect(admit(origin, AbortSignal.abort())).rejects.toMatchObject({ reason: "ownership" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { error: { code: "55P03" }, reason: "capacity" },
    { error: { message: "technical_dispatch_capacity" }, reason: "capacity" },
    { error: { code: "42501", message: "private" }, reason: "ownership" },
  ])("classifies admission refusal $reason", async ({ error, reason }) => {
    const rpc = vi.fn(async () => ({ data: null, error }));
    await expect(
      technicalConnectionAdmission(
        user,
        "p",
        run,
        lease,
        origin,
        rpc,
      )(origin, new AbortController().signal),
    ).rejects.toMatchObject({ reason });
  });
  it("releases a grant that arrives after cancellation without exposing it to transport", async () => {
    const controller = new AbortController();
    const rpc = vi.fn(async () => {
      controller.abort();
      return record();
    });
    await expect(
      technicalConnectionAdmission(user, "p", run, lease, origin, rpc)(origin, controller.signal),
    ).rejects.toMatchObject({ reason: "capacity" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
