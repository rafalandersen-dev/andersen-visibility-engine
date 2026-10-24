import { afterEach, expect, it, vi } from "vitest";
import { readTeamReviewContext } from "./project-team-context.server";
import { readTeamReviewAuthority } from "./project-team-authority.server";
import { readProjectTeamReviewHistory } from "./project-team-review.server";
import { recoverTeamReviewRead } from "./project-team-review-read-recovery.server";

const actor = "00000000-0000-4000-8000-000000000001";
const scope = { ownerId: "00000000-0000-4000-8000-000000000002", projectId: "p", assetId: "a" };
const busy = { data: null, error: { code: "55P03", message: "private row detail" } };
const fixtures = [
  {
    name: "context",
    read: readTeamReviewContext,
    data: {
      ...scope,
      actorId: actor,
      workspaceRevision: 1,
      membershipRevision: 1,
      draftHash: "a".repeat(64),
      project: { id: "p" },
      asset: { id: "a", projectId: "p" },
      links: [],
    },
  },
  {
    name: "authority",
    read: readTeamReviewAuthority,
    data: { ...scope, actorId: actor, policyRevision: 1, canReview: true },
  },
  { name: "history", read: readProjectTeamReviewHistory, data: { ...scope, reviews: [] } },
];
afterEach(() => vi.useRealTimers());
it.each(fixtures)(
  "recovers the actual $name read after one confirmed row-lock refusal",
  async ({ read, data }) => {
    const rpc = vi.fn().mockResolvedValueOnce(busy).mockResolvedValue({ data, error: null });
    const result = await read(actor, scope, rpc);
    expect(result).toMatchObject(scope);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  },
);
it.each(fixtures)(
  "caps persistent contention in the actual $name read at three attempts",
  async ({ read }) => {
    const rpc = vi.fn().mockResolvedValue(busy);
    await expect(read(actor, scope, rpc)).rejects.toThrow("Team access is busy");
    expect(rpc).toHaveBeenCalledTimes(3);
  },
);
it.each(["42501", "40001", "40P01", "57014", "P0001"])(
  "does not repeat non-NOWAIT error %s",
  async (code) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "private" } });
    await expect(readTeamReviewContext(actor, scope, rpc)).rejects.toThrow("could not be updated");
    expect(rpc).toHaveBeenCalledOnce();
  },
);
it("rechecks access and refuses a member revoked between attempts", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce(busy)
    .mockResolvedValue({ data: null, error: { code: "42501" } });
  await expect(readTeamReviewContext(actor, scope, rpc)).rejects.toThrow("could not be updated");
  expect(rpc).toHaveBeenCalledTimes(2);
});
it("does not repeat thrown transport failures", async () => {
  const rpc = vi.fn().mockRejectedValue(new Error("network outcome unknown"));
  await expect(readTeamReviewContext(actor, scope, rpc)).rejects.toThrow("could not be updated");
  expect(rpc).toHaveBeenCalledOnce();
});
it("does not start a read after its deadline", async () => {
  vi.useFakeTimers();
  const rpc = vi.fn();
  const result = await recoverTeamReviewRead(rpc, Date.now())(
    "read_project_team_review_context",
    {},
  );
  expect(result.error).toMatchObject({ code: "55P03" });
  expect(rpc).not.toHaveBeenCalled();
});
it("does not retry a slow row-lock refusal that consumed the budget", async () => {
  vi.useFakeTimers();
  const rpc = vi.fn(async () => {
    vi.setSystemTime(Date.now() + 1501);
    return busy;
  });
  expect(await recoverTeamReviewRead(rpc)("read_project_team_review_context", {})).toBe(busy);
  expect(rpc).toHaveBeenCalledOnce();
});
it("checks the deadline again after delayed backoff resumes", async () => {
  vi.useFakeTimers();
  const rpc = vi.fn().mockResolvedValue(busy);
  const result = recoverTeamReviewRead(rpc)("read_project_team_review_context", {});
  await vi.advanceTimersByTimeAsync(0);
  vi.setSystemTime(Date.now() + 1501);
  await vi.advanceTimersByTimeAsync(30);
  expect((await result).error).toMatchObject({ code: "55P03" });
  expect(rpc).toHaveBeenCalledOnce();
});
it.each([
  "save_project_team_approval",
  "set_project_team_notification_recipient",
  "accept_project_team_invitation",
  "acquire_project_team_preview",
  "release_project_team_preview",
  "read_project_team_snapshot",
])("passes %s through exactly once, outside the read retry/deadline", async (name) => {
  const rpc = vi.fn().mockResolvedValue(busy);
  expect(await recoverTeamReviewRead(rpc, 0)(name, {})).toBe(busy);
  expect(rpc).toHaveBeenCalledOnce();
});
