import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ read: vi.fn(), fetch: vi.fn(), save: vi.fn() }));
vi.mock("./project-knowledge.server", () => ({
  readProjectKnowledge: h.read,
  writeProjectKnowledgePair: h.save,
  KnowledgeUnavailableError: Error,
}));
vi.mock("./ai.functions", () => ({ fetchSiteContext: h.fetch }));
import { captureProjectWebsiteKnowledge } from "./project-knowledge-website.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const text = "Source-reported business description. ".repeat(5);
beforeEach(() => {
  vi.resetAllMocks();
  h.read.mockResolvedValue({ sources: [], records: [] });
  h.fetch.mockResolvedValue({ ok: true, title: "Example", text });
  h.save.mockImplementation(async (_scope, source, record) => ({ source, record }));
});
describe("website reference proposals", () => {
  it("captures bare onboarding hostnames under the same HTTPS source identity", async () => {
    const first = await captureProjectWebsiteKnowledge(scope, "  example.com  ");
    expect(h.fetch).toHaveBeenCalledWith("https://example.com");
    expect(first.source.url).toBe("https://example.com");
    h.read.mockResolvedValue({ sources: [first.source], records: [] });
    h.save.mockClear();
    expect((await captureProjectWebsiteKnowledge(scope, "https://example.com")).changed).toBe(
      false,
    );
    expect(h.save).not.toHaveBeenCalled();
  });
  it.each(["http://example.com", "javascript:alert(1)", "user:password@example.com", ""])(
    "rejects unsupported or credential-bearing input %s before fetching",
    async (url) => {
      await expect(captureProjectWebsiteKnowledge(scope, url)).rejects.toThrow();
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.save).not.toHaveBeenCalled();
    },
  );
  it("authorizes before fetching and stores actual excerpt as an unaccepted proposal", async () => {
    await captureProjectWebsiteKnowledge(scope, "https://example.com");
    expect(h.read).toHaveBeenCalledExactlyOnceWith(scope);
    expect(h.read.mock.invocationCallOrder[0]).toBeLessThan(h.fetch.mock.invocationCallOrder[0]);
    expect(h.save).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ kind: "website", url: "https://example.com", revision: 1 }),
      expect.objectContaining({ status: "proposed", value: text, excerpt: text }),
      0,
      0,
    );
  });
  it("does not fetch an unowned project or unsafe source URL", async () => {
    h.read.mockRejectedValue(new Error("not owned"));
    await expect(captureProjectWebsiteKnowledge(scope, "https://example.com")).rejects.toThrow();
    await expect(
      captureProjectWebsiteKnowledge(scope, "https://user:password@example.com"),
    ).rejects.toThrow();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });
  it("does not replace saved evidence when a source cannot be read", async () => {
    h.fetch.mockResolvedValue({ ok: false, text: "" });
    await expect(captureProjectWebsiteKnowledge(scope, "https://example.com")).rejects.toThrow(
      "Saved knowledge has not been replaced",
    );
    expect(h.save).not.toHaveBeenCalled();
  });
  it("does not create duplicate proposals for an unchanged captured excerpt", async () => {
    const first = await captureProjectWebsiteKnowledge(scope, "https://example.com");
    h.read.mockResolvedValue({ sources: [first.source], records: [] });
    h.save.mockClear();
    expect((await captureProjectWebsiteKnowledge(scope, "https://example.com")).changed).toBe(
      false,
    );
    expect(h.save).not.toHaveBeenCalled();
  });
});
