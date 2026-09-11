import { expect, it, vi } from "vitest";
import { createTeamRequestQueue } from "./team-request-queue";
it("admits normal five-panel fan-out two at a time and releases failures", async () => {
  const queue = createTeamRequestQueue(),
    releases: Array<() => void> = [];
  let active = 0,
    peak = 0;
  const work = vi.fn(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
    return "done";
  });
  const results = Array.from({ length: 5 }, () => queue(work));
  await Promise.resolve();
  expect(work).toHaveBeenCalledTimes(2);
  releases.shift()!();
  releases.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(work).toHaveBeenCalledTimes(4);
  releases.shift()!();
  releases.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(work).toHaveBeenCalledTimes(5);
  releases.shift()!();
  expect(await Promise.all(results)).toEqual(Array(5).fill("done"));
  expect(peak).toBe(2);
  await expect(
    queue(async () => {
      throw new Error("failed");
    }),
  ).rejects.toThrow("failed");
  expect(await queue(async () => "recovered")).toBe("recovered");
});
it("drops cancelled waiting work without releasing an active request early", async () => {
  const queue = createTeamRequestQueue();
  let finish!: () => void;
  const active = new AbortController(),
    waiting = new AbortController();
  const first = queue(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    active.signal,
  );
  let secondFinish!: () => void;
  const second = queue(
    () =>
      new Promise<void>((resolve) => {
        secondFinish = resolve;
      }),
  );
  const skipped = vi.fn(async () => "never");
  const pending = expect(queue(skipped, waiting.signal)).rejects.toBeDefined();
  await Promise.resolve();
  waiting.abort();
  active.abort();
  await pending;
  const next = vi.fn(async () => "next");
  const last = queue(next);
  await Promise.resolve();
  expect(next).not.toHaveBeenCalled();
  finish();
  await first;
  secondFinish();
  await second;
  expect(await last).toBe("next");
  expect(skipped).not.toHaveBeenCalled();
});
