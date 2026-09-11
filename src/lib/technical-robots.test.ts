import { describe, expect, it } from "vitest";
import { evaluateRobots, parseRobots, robotsEvidence, ROBOTS_MAX_BYTES } from "./technical-robots";
const decision = (body: string, path: string, token = "MiloGrowthAuditBot") =>
  evaluateRobots(robotsEvidence(200, body), token, `https://example.test${path}`).decision;
describe("technical crawl robots evidence", () => {
  it("bounds consecutive agents and preserves explicit unknown policy", () => {
    const text = "User-agent: a\n".repeat(20001);
    const parsed = parseRobots(text);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].agents).toHaveLength(20000);
    expect(parsed.complete).toBe(false);
    expect(decision(text, "/")).toBe("unknown");
  });
  it("combines matching groups and uses wildcard only as fallback", () => {
    const text =
      "User-agent: *\nDisallow: /\nUser-agent: milogrowthauditbot\nDisallow: /private\nUser-agent: MiloGrowthAuditBot\nAllow: /private/public";
    expect(decision(text, "/elsewhere")).toBe("allowed");
    expect(decision(text, "/private")).toBe("disallowed");
    expect(decision(text, "/private/public")).toBe("allowed");
    expect(decision(text, "/elsewhere", "OtherBot")).toBe("disallowed");
  });
  it("preserves consecutive agents, empty directives, comments and sitemap extensions", () => {
    const text =
      "\uFEFFUser-agent: OtherBot\rUser-agent: MiloGrowthAuditBot\rSitemap: https://example.test/sitemap.xml\rDisallow: # no restriction\rDisallow: /private # comment";
    expect(decision(text, "/private")).toBe("disallowed");
    expect(decision(text, "/open")).toBe("allowed");
    expect(parseRobots(text).sitemaps).toEqual(["https://example.test/sitemap.xml"]);
  });
  it("uses longest rules with allow winning a tie", () => {
    expect(decision("User-agent: *\nDisallow: /a\nAllow: /a", "/abc")).toBe("allowed");
    expect(decision("User-agent: *\nAllow: /a\nDisallow: /abc", "/abc")).toBe("disallowed");
  });
  it("matches wildcards and end anchors against case-sensitive paths and queries", () => {
    const text = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?*private=1";
    expect(decision(text, "/a/b.pdf")).toBe("disallowed");
    expect(decision(text, "/a.pdf?q=1")).toBe("allowed");
    expect(decision(text, "/a.PDF")).toBe("allowed");
    expect(decision(text, "/search?q=x&private=1")).toBe("disallowed");
  });
  it("normalizes UTF8 and encoded unreserved characters while preserving encoded slashes", () => {
    expect(decision("User-agent: *\nDisallow: /café", "/caf%C3%A9")).toBe("disallowed");
    expect(decision("User-agent: *\nDisallow: /abc", "/%61bc")).toBe("disallowed");
    expect(decision("User-agent: *\nDisallow: /a/b", "/a%2Fb")).toBe("allowed");
  });
  it.each([null, 429, 500, 503, 302])(
    "holds crawling when retrieval is unresolved: %s",
    (status) => {
      expect(
        evaluateRobots(robotsEvidence(status), "MiloGrowthAuditBot", "https://example.test/")
          .decision,
      ).toBe("unknown");
    },
  );
  it("records 404 as unavailable and refuses oversized or HTML responses", () => {
    expect(robotsEvidence(404).state).toBe("unavailable");
    expect(
      evaluateRobots(robotsEvidence(404), "MiloGrowthAuditBot", "https://example.test/").decision,
    ).toBe("allowed");
    expect(robotsEvidence(200, "x".repeat(ROBOTS_MAX_BYTES + 1)).state).toBe("unknown");
    expect(robotsEvidence(200, "<html>", "text/html").state).toBe("unknown");
  });
  it("does not match a product token by unrelated substring", () => {
    expect(decision("User-agent: AuditBot\nDisallow: /", "/")).toBe("allowed");
  });
});
