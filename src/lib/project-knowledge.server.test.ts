import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetProjectKnowledge,
  loadProjectKnowledgeContext,
  readProjectKnowledge,
  writeProjectKnowledge,
} from "./project-knowledge.server";
import type { KnowledgeSource } from "./project-knowledge";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const source: KnowledgeSource = {
  ...scope,
  id: "00000000-0000-4000-8000-000000000002",
  revision: 1,
  kind: "owner",
  label: "Owner guidance",
  fingerprint: "a".repeat(64),
  observedAt: "2026-09-09T10:00:00Z",
  status: "active",
};
afterEach(() => vi.useRealTimers());
describe("server project-knowledge boundary", () => {
  it("always forwards the authenticated scope and refuses mismatched stored records", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { sources: [source], records: [] }, error: null });
    await readProjectKnowledge(scope, rpc);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_project_knowledge", {
      p_user: scope.ownerId,
      p_project: "p",
    });
    rpc.mockResolvedValue({
      data: { sources: [{ ...source, projectId: "other" }], records: [] },
      error: null,
    });
    await expect(readProjectKnowledge(scope, rpc)).rejects.toThrow("could not be confirmed");
  });
  it("does not write foreign ownership or an inconsistent revision", async () => {
    const rpc = vi.fn();
    await expect(
      writeProjectKnowledge(scope, "source", { ...source, projectId: "other" }, 0, rpc),
    ).rejects.toThrow();
    await expect(writeProjectKnowledge(scope, "source", source, 1, rpc)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("validates the exact save acknowledgement", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: source, error: null });
    await expect(writeProjectKnowledge(scope, "source", source, 0, rpc)).resolves.toEqual(source);
    rpc.mockResolvedValue({ data: { ...source, label: "Changed elsewhere" }, error: null });
    await expect(writeProjectKnowledge(scope, "source", source, 0, rpc)).rejects.toThrow(
      "could not be confirmed",
    );
  });
  it("never retries an uncertain write or returns infrastructure details", async () => {
    vi.useFakeTimers();
    const rpc = vi.fn(() => new Promise<never>(() => {}));
    const pending = expect(writeProjectKnowledge(scope, "source", source, 0, rpc)).rejects.toThrow(
      "could not be confirmed",
    );
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const failed = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "private connection detail" } });
    await expect(forgetProjectKnowledge(scope, "source", source.id, 1, failed)).rejects.toThrow(
      "could not be confirmed",
    );
  });
  it("reads fresh state on each context request rather than serving revoked cached knowledge", async () => {
    const record = {
      ...scope,
      id: "00000000-0000-4000-8000-000000000003",
      revision: 1,
      sourceId: source.id,
      sourceRevision: 1,
      key: "voice",
      category: "voice",
      appliesTo: "both",
      value: "Calm",
      locator: "Owner instruction",
      status: "accepted",
      updatedAt: source.observedAt,
      reviewedAt: source.observedAt,
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { sources: [source], records: [record] }, error: null })
      .mockResolvedValueOnce({
        data: { sources: [{ ...source, status: "revoked" }], records: [record] },
        error: null,
      });
    expect(
      (await loadProjectKnowledgeContext(scope, "text", source.observedAt, rpc)).context,
    ).toContain("Calm");
    expect(
      (await loadProjectKnowledgeContext(scope, "visual", source.observedAt, rpc)).context,
    ).toBe("");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
