import { addProjectTeamComment } from "./project-team-comments.server";
import { afterEach, expect, it, vi } from "vitest";
import {
  admittedReadRpc,
  readAdmittedTeamProject,
  readAdmittedTeamComments,
} from "./project-team-read-admission.server";
const actor = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000002";
const lease = "00000000-0000-4000-8000-000000000003";
const input = { ownerId, projectId: "p" };
afterEach(() => vi.useRealTimers());
it("rejects invalid authority before any admission call", async () => {
  const rpc = vi.fn();
  await expect(readAdmittedTeamProject("invalid", input, rpc)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it("does not start snapshot work when admission is full", async () => {
  const rpc = vi.fn(async () => ({ data: null, error: { message: "team_preview_capacity" } }));
  await expect(readAdmittedTeamProject(actor, input, rpc)).rejects.toThrow();
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith("acquire_project_team_preview", {
    p_actor: actor,
    p_owner: ownerId,
    p_project: "p",
  });
});
it("retains the lease after the read deadline until the actual RPC settles", async () => {
  vi.useFakeTimers();
  let finish!: (value: { data: null; error: string }) => void;
  const work = new Promise<{ data: null; error: string }>((resolve) => {
    finish = resolve;
  });
  const rpc = vi.fn(async (name: string) => {
    if (name === "acquire_project_team_preview") return { data: lease, error: null };
    if (name === "read_project_team_snapshot") return work;
    return { data: null, error: null };
  });
  const result = expect(readAdmittedTeamProject(actor, input, rpc)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(10001);
  await result;
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "acquire_project_team_preview",
    "read_project_team_snapshot",
  ]);
  finish({ data: null, error: "unavailable" });
  await vi.advanceTimersByTimeAsync(1);
  expect(rpc).toHaveBeenLastCalledWith("release_project_team_preview", {
    p_actor: actor,
    p_owner: ownerId,
    p_lease: lease,
  });
});
it("releases late admission without starting snapshot work", async () => {
  vi.useFakeTimers();
  let grant!: (value: { data: string; error: null }) => void;
  const pending = new Promise<{ data: string; error: null }>((resolve) => {
    grant = resolve;
  });
  const rpc = vi.fn(async (name: string) =>
    name === "acquire_project_team_preview" ? pending : { data: null, error: null },
  );
  const result = expect(readAdmittedTeamProject(actor, input, rpc)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(10001);
  await result;
  grant({ data: lease, error: null });
  await vi.advanceTimersByTimeAsync(1);
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "acquire_project_team_preview",
    "release_project_team_preview",
  ]);
});

it("admits comment reads before the snapshot-backed comments RPC", async () => {
  const rpc = vi.fn(async (name: string) =>
    name === "acquire_project_team_preview"
      ? { data: lease, error: null }
      : { data: null, error: "unavailable" },
  );
  await expect(readAdmittedTeamComments(actor, { ...input, assetId: "a" }, rpc)).rejects.toThrow();
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "acquire_project_team_preview",
    "read_project_team_comments",
    "release_project_team_preview",
  ]);
});

it("refuses comment submissions before snapshot work when actor admission is exhausted", async () => {
  const rpc = vi.fn(async () => ({ data: null, error: { message: "team_preview_capacity" } }));
  await expect(
    addProjectTeamComment(
      actor,
      { ...input, assetId: "a", commentId: lease, expectedRevision: 1, body: "Comment" },
      admittedReadRpc(actor, rpc),
    ),
  ).rejects.toThrow();
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith("acquire_project_team_preview", {
    p_actor: actor,
    p_owner: ownerId,
    p_project: "p",
  });
});

it("uses the authenticated actor budget for discovery without a supplied project", async () => {
  const rpc = vi.fn(async (name: string) =>
    name === "acquire_project_team_preview"
      ? { data: lease, error: null }
      : { data: {}, error: null },
  );
  await admittedReadRpc(actor, rpc)("list_my_project_teams", { p_actor: actor });
  expect(rpc).toHaveBeenCalledWith("acquire_project_team_preview", {
    p_actor: actor,
    p_owner: actor,
    p_project: null,
  });
  expect(rpc).toHaveBeenLastCalledWith("release_project_team_preview", {
    p_actor: actor,
    p_owner: actor,
    p_lease: lease,
  });
});
