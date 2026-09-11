import { expect, it, vi } from "vitest";
import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
const actor = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const lease = "00000000-0000-4000-8000-000000000003";
it("keeps preview admission scoped and does not expose raw error details", async () => {
  const rpc = vi.fn(async () => ({ data: lease, error: null as unknown }));
  expect(await acquireTeamPreview(actor, owner, "p", rpc)).toBe(lease);
  expect(rpc).toHaveBeenCalledWith("acquire_project_team_preview", {
    p_actor: actor,
    p_owner: owner,
    p_project: "p",
  });
  for (const error of [
    { message: "team_preview_capacity" },
    { code: "55P03", message: "private" },
  ]) {
    rpc.mockResolvedValue({ data: lease, error });
    await expect(acquireTeamPreview(actor, owner, "p", rpc)).rejects.toBeInstanceOf(
      TeamAdmissionBusyError,
    );
  }
  rpc.mockResolvedValue({ data: lease, error: { code: "42501", message: "private" } });
  await expect(acquireTeamPreview(actor, owner, "p", rpc)).rejects.toThrow(
    "could not be confirmed",
  );
  await expect(acquireTeamPreview(actor, owner, "p", rpc)).rejects.not.toBeInstanceOf(
    TeamAdmissionBusyError,
  );
});
it("releases only the acquired actor/owner token", async () => {
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  await releaseTeamPreview(actor, owner, lease, rpc);
  expect(rpc).toHaveBeenCalledWith("release_project_team_preview", {
    p_actor: actor,
    p_owner: owner,
    p_lease: lease,
  });
});
it("retries contended release with the same token and stops after three attempts", async () => {
  vi.useFakeTimers();
  try {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "55P03" } })
      .mockResolvedValueOnce({ data: null, error: { code: "55P03" } })
      .mockResolvedValue({ data: null, error: null });
    const pending = releaseTeamPreview(actor, owner, lease, rpc);
    await vi.runAllTimersAsync();
    await pending;
    expect(rpc.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        "release_project_team_preview",
        { p_actor: actor, p_owner: owner, p_lease: lease },
      ]),
    );
    rpc.mockClear().mockResolvedValue({ data: null, error: { code: "55P03" } });
    const rejected = expect(releaseTeamPreview(actor, owner, lease, rpc)).rejects.toThrow(
      "preview_release_unavailable",
    );
    await vi.runAllTimersAsync();
    await rejected;
    expect(rpc).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});
