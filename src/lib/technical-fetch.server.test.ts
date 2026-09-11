import { TechnicalPolicyRefusedError } from "./technical-crawl-admission";
import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./homepage-fetch.server", () => ({ fetchPinnedResource: mocks.fetch }));
import {
  fetchTechnicalRobots,
  technicalPageFetcher,
  technicalSitemapFetcher,
} from "./technical-fetch.server";
import { robotsEvidence } from "./technical-robots";
const origin = "https://example.test",
  admit = vi.fn(async () => async () => {});
describe("technical transport policy boundary", () => {
  it("keeps unaccepted headerless successful robots responses unknown", async () => {
    mocks.fetch.mockResolvedValue({
      status: 200,
      contentAccepted: false,
      truncated: false,
      body: "",
      headers: {},
    });
    expect(await fetchTechnicalRobots(origin, admit)).toEqual({
      state: "unknown",
      reason: "content_type",
    });
  });
  it("retains unavailable policy semantics for a genuine 404", async () => {
    mocks.fetch.mockResolvedValue({
      status: 404,
      contentAccepted: false,
      truncated: false,
      body: "",
      headers: {},
    });
    expect(await fetchTechnicalRobots(origin, admit)).toEqual({
      state: "unavailable",
      status: 404,
    });
  });
  it("parses an accepted disallow policy and carries admission to every transport", async () => {
    mocks.fetch.mockResolvedValue({
      status: 200,
      contentAccepted: true,
      truncated: false,
      body: "User-agent: *\nDisallow: /",
      headers: { "content-type": "text/plain" },
    });
    expect((await fetchTechnicalRobots(origin, admit)).state).toBe("read");
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      origin + "/robots.txt",
      expect.objectContaining({ admit }),
    );
    const robots = robotsEvidence(404);
    await technicalPageFetcher(origin, robots, admit)(origin + "/page");
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      origin + "/page",
      expect.objectContaining({ admit, authorize: expect.any(Function) }),
    );
    await technicalSitemapFetcher(origin, robots, admit)(origin + "/sitemap.xml");
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      origin + "/sitemap.xml",
      expect.objectContaining({ admit, authorize: expect.any(Function) }),
    );
  });
});

it("preserves a policy-refused redirect destination", async () => {
  mocks.fetch.mockRejectedValueOnce(new TechnicalPolicyRefusedError(origin + "/private"));
  const policy = robotsEvidence(200, "User-agent: *\nDisallow: /private", "text/plain");
  await expect(technicalPageFetcher(origin, policy, admit)(origin + "/start")).resolves.toEqual({
    state: "policy_refused",
    url: origin + "/private",
  });
});

it.each([
  { status: 206, headers: { "content-type": "text/plain" } },
  { status: 226, headers: { "content-type": "text/plain" } },
  { status: 200, headers: { "content-type": "text/plain", "Content-Range": "bytes 50-99/100" } },
])(
  "refuses partial robots evidence before it can grant crawl permission: %j",
  async ({ status, headers }) => {
    mocks.fetch.mockResolvedValue({
      status,
      headers,
      contentAccepted: true,
      truncated: false,
      body: "User-agent: *\nAllow: /",
    });
    expect(await fetchTechnicalRobots(origin, admit)).toEqual({
      state: "unknown",
      reason: "partial",
    });
  },
);
