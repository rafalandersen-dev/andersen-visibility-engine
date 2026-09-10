import { describe, expect, it } from "vitest";
import { applyProfileFill, prepareProfileFill, profileFillSchema } from "./mcp-profile-fill";
import type { Project } from "./types";
const project = (patch: Record<string, unknown> = {}) =>
  ({
    id: "p1",
    businessName: "Owner",
    description: "",
    primaryLanguage: "English",
    targetLocations: [],
    setupComplete: false,
    ...patch,
  }) as unknown as Project;
const prepare = (payload: Record<string, unknown>, requestId = "r1", projectId = "p1") =>
  prepareProfileFill(profileFillSchema.parse({ projectId, requestId, payload }));
describe("profile field ownership and durable replay", () => {
  it("does not refill an explicitly owner-cleared brand field under a new request", async () => {
    const original = project({
      brandIntelligence: { voice: {} },
      brandOwnerFields: ["voice.tone"],
    });
    const result = applyProfileFill(
      { projects: [original] },
      await prepare({
        brandIntelligence: { voice: { tone: "Suggested", styleNotes: "Short sentences" } },
      }),
    );
    expect(result.result.filled).toEqual(["brandIntelligence.voice.styleNotes"]);
    expect(result.result.requiresProposal).toEqual(["brandIntelligence.voice.tone"]);
    expect((result.data.projects as Project[])[0].brandIntelligence?.voice?.tone).toBeUndefined();
  });
  it("fills blanks but reports owner-set values for a separate proposal", async () => {
    const original = project();
    const out = applyProfileFill(
      { projects: [original] },
      await prepare({
        projectFields: {
          businessName: "Replacement",
          description: "Research",
          targetLocations: ["Malmö"],
          primaryLanguage: "Swedish",
        },
      }),
    );
    expect(out.result).toMatchObject({
      filled: ["description", "targetLocations"],
      requiresProposal: ["businessName", "primaryLanguage"],
    });
    expect((out.data.projects as Project[])[0]).toMatchObject({
      businessName: "Owner",
      description: "Research",
      primaryLanguage: "English",
      setupComplete: false,
    });
    expect(original.description).toBe("");
  });
  it("merges brand leaves without overwriting non-empty lists or changing other project settings", async () => {
    const out = applyProfileFill(
      {
        projects: [
          project({
            brandIntelligence: {
              voice: { tone: "Owner tone", wordsToUse: [] },
              claims: { forbiddenClaims: ["Owner rule"] },
            },
          }),
        ],
      },
      await prepare({
        brandIntelligence: {
          voice: { tone: "New", wordsToUse: ["Clear"] },
          claims: { forbiddenClaims: ["New rule"] },
          proof: { credentials: ["Certificate"] },
        },
      }),
    );
    expect(out.result.requiresProposal).toEqual([
      "brandIntelligence.claims.forbiddenClaims",
      "brandIntelligence.voice.tone",
    ]);
    expect((out.data.projects as Project[])[0].brandIntelligence).toMatchObject({
      voice: { tone: "Owner tone", wordsToUse: ["Clear"] },
      claims: { forbiddenClaims: ["Owner rule"] },
      proof: { credentials: ["Certificate"] },
    });
  });
  it("does not treat false, zero or malformed objects as blank", async () => {
    for (const value of [false, 0, {}, [""]]) {
      const out = applyProfileFill(
        { projects: [project({ description: value })] },
        await prepare({ projectFields: { description: "New" } }),
      );
      expect(out.result.requiresProposal).toEqual(["description"]);
    }
  });
  it.each(["Legacy owner notes", { voice: false }, { voice: [] }, { voice: "Legacy voice" }])(
    "preserves malformed existing brand containers for review",
    async (currentBrand) => {
      const out = applyProfileFill(
        { projects: [project({ brandIntelligence: currentBrand })] },
        await prepare({ brandIntelligence: { voice: { tone: "New tone" } } }),
      );
      expect((out.data.projects as Project[])[0].brandIntelligence).toEqual(currentBrand);
      expect(out.result.filled).toEqual([]);
      expect(out.result.requiresProposal).toEqual(["brandIntelligence.voice.tone"]);
    },
  );
  it("ignores empty proposals and identical values", async () => {
    const out = applyProfileFill(
      { projects: [project({ brandIntelligence: { voice: { tone: "Owner" } } })] },
      await prepare({
        projectFields: { businessName: "Owner" },
        brandIntelligence: { voice: { tone: "", wordsToUse: [] } },
      }),
    );
    expect(out.result.filled).toEqual([]);
    expect(out.result.requiresProposal).toEqual([]);
    expect((out.data.projects as Project[])[0].brandIntelligence?.voice?.tone).toBe("Owner");
  });
  it.each([null, undefined, "  "])("fills a truly empty scalar %s", async (value) => {
    const out = applyProfileFill(
      { projects: [project({ description: value })] },
      await prepare({ projectFields: { description: "Research" } }),
    );
    expect(out.result.filled).toEqual(["description"]);
  });
  it("replay never refills an owner-cleared field and explicitly returns the historical result", async () => {
    const prepared = await prepare({ projectFields: { description: "Research" } });
    const first = applyProfileFill({ projects: [project()] }, prepared);
    (first.data.projects as Project[])[0].description = "";
    const replay = applyProfileFill(first.data, prepared);
    expect(replay.result).toMatchObject({
      deduped: true,
      status: "previously_processed",
      filled: ["description"],
    });
    expect((replay.data.projects as Project[])[0].description).toBe("");
  });
  it("rejects changed payload for a used request and scopes receipts to project", async () => {
    const first = applyProfileFill(
      { projects: [project(), project({ id: "p2" })] },
      await prepare({ projectFields: { description: "First" } }),
    );
    const changed = await prepare({ projectFields: { description: "Changed" } });
    expect(() => applyProfileFill(first.data, changed)).toThrow("conflict");
    const other = applyProfileFill(
      first.data,
      await prepare({ projectFields: { description: "Other" } }, "r1", "p2"),
    );
    expect(other.result.deduped).toBe(false);
  });
  it("canonicalizes object key order for safe retries", async () => {
    const a = await prepare({
      projectFields: { description: "A", businessName: "B" },
      brandIntelligence: { voice: { tone: "C" } },
    });
    const b = await prepare({
      brandIntelligence: { voice: { tone: "C" } },
      projectFields: { businessName: "B", description: "A" },
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
  it("rechecks owner edits against the latest revision snapshot", async () => {
    const prepared = await prepare({ projectFields: { description: "Assistant" } });
    expect(applyProfileFill({ projects: [project()] }, prepared).result.filled).toEqual([
      "description",
    ]);
    const retried = applyProfileFill(
      { projects: [project({ description: "Owner intervened" })] },
      prepared,
    );
    expect(retried.result.filled).toEqual([]);
    expect(retried.result.requiresProposal).toEqual(["description"]);
  });
  it("refuses unknown projects, malformed receipts and bounded history overflow", async () => {
    const prepared = await prepare({ projectFields: { description: "Research" } });
    expect(() => applyProfileFill({ projects: [] }, prepared)).toThrow("not_found");
    for (const receipts of [
      {},
      [
        {
          requestId: "r1",
          fingerprint: prepared.fingerprint,
          filled: ["PRIVATE-LOG-INJECTION"],
          requiresProposal: [],
        },
      ],
    ]) {
      expect(() =>
        applyProfileFill({ projects: [project({ mcpProfileFillRequests: receipts })] }, prepared),
      ).toThrow("conflict");
    }
    const receipts = Array.from({ length: 200 }, (_, i) => ({
      requestId: `old${i}`,
      fingerprint: prepared.fingerprint,
      filled: [],
      requiresProposal: [],
    }));
    expect(() =>
      applyProfileFill({ projects: [project({ mcpProfileFillRequests: receipts })] }, prepared),
    ).toThrow("capacity");
  });
  it.each([
    { projectFields: { setupComplete: true } },
    { projectFields: { websiteUrl: "https://other.example" } },
    { services: [{ name: "X", kind: "Service" }] },
    { brandIntelligence: { voice: { secret: "X" } } },
    {},
    { projectFields: { targetLocations: Array(11).fill("City") } },
  ])("rejects fields outside the bounded profile contract", (payload) => {
    expect(profileFillSchema.safeParse({ projectId: "p1", requestId: "r", payload }).success).toBe(
      false,
    );
  });
  it("enforces byte rather than character budget", () => {
    const payload = {
      brandIntelligence: { voice: { wordsToUse: Array(20).fill("界".repeat(400)) } },
    };
    expect(profileFillSchema.safeParse({ projectId: "p1", requestId: "r", payload }).success).toBe(
      false,
    );
  });
});
