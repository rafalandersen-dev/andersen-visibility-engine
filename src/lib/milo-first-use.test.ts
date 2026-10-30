import { describe, expect, it } from "vitest";
import {
  FIRST_USE_TITLE_LIMIT,
  firstUseConsent,
  firstUseContext,
  firstUseTitle,
  type FirstUseWorkspace,
} from "./milo-first-use";

const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const own = { ownerId: actor, projectId: "p" };
const draft = (over: Partial<FirstUseWorkspace["content"][number]> = {}) => ({
  projectId: "p",
  title: "Winter boiler service guide",
  status: "Draft" as const,
  updatedAt: "2026-10-01T10:00:00Z",
  ...over,
});
const workspace = (over: Partial<FirstUseWorkspace> = {}): FirstUseWorkspace => ({
  userId: actor,
  hydrated: true,
  content: [draft()],
  ...over,
});
const ids = (result: ReturnType<typeof firstUseContext>) => result.suggestions.map((s) => s.id);
const named = (result: ReturnType<typeof firstUseContext>) =>
  result.suggestions.flatMap((s) => (s.vars ? [s.vars.title] : []));

describe("first-use suggestions only name verified own drafts", () => {
  it("names the latest working draft of the selected owned project", () => {
    const result = firstUseContext(
      actor,
      own,
      workspace({
        content: [
          draft({ title: "Older draft", updatedAt: "2026-09-01T00:00:00Z" }),
          draft({ title: "Newest draft", updatedAt: "2026-10-20T00:00:00Z", status: "In Review" }),
          draft({
            title: "Other project draft",
            projectId: "q",
            updatedAt: "2026-10-29T00:00:00Z",
          }),
          draft({
            title: "Already exported",
            status: "Exported",
            updatedAt: "2026-10-30T00:00:00Z",
          }),
        ],
      }),
    );
    expect(result.kind).toBe("ownedDraft");
    expect(ids(result)).toEqual(["draftReview", "businessGaps"]);
    expect(named(result)).toEqual(["Newest draft"]);
  });

  it("gives an empty owned project a useful task without presuming saved work", () => {
    for (const content of [
      [],
      [draft({ projectId: "q" })],
      [draft({ status: "Approved" }), draft({ status: "Rejected" }), draft({ status: "Exported" })],
      [draft({ title: "   " }), draft({ title: "\u202e\u200b" })],
    ]) {
      const result = firstUseContext(actor, own, workspace({ content }));
      expect(result.kind).toBe("ownedEmpty");
      expect(ids(result)).toEqual(["businessGaps", "goal"]);
      expect(named(result)).toEqual([]);
    }
  });

  it("stays generic while the workspace is unhydrated, stale or another account's", () => {
    for (const state of [
      workspace({ hydrated: false }),
      workspace({ userId: null }),
      workspace({ userId: other }),
      // A stale snapshot can still say hydrated for the previous account.
      workspace({ userId: other, hydrated: true }),
      undefined,
    ]) {
      const result = firstUseContext(actor, own, state);
      expect(result.kind).toBe("ownedUnverified");
      expect(ids(result)).toEqual(["businessGaps", "goal"]);
      expect(named(result)).toEqual([]);
    }
  });

  it("never exposes local owned data in a shared project with the same project ID", () => {
    // The actor owns project "p" locally AND is a member of another owner's "p".
    const result = firstUseContext(actor, { ownerId: other, projectId: "p" }, workspace());
    expect(result.kind).toBe("shared");
    expect(ids(result)).toEqual(["sharedOverview", "goal"]);
    expect(named(result)).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Winter boiler");
  });

  it("never names a draft for a cross-tenant owner even if that owner's workspace is in memory", () => {
    // Defensive: memory holds `other`'s workspace, actor views other's identical project ID.
    const result = firstUseContext(
      actor,
      { ownerId: other, projectId: "p" },
      workspace({ userId: other }),
    );
    expect(result.kind).toBe("shared");
    expect(named(result)).toEqual([]);
  });

  it("is neutral without an actor or project", () => {
    expect(firstUseContext(undefined, own, workspace())).toMatchObject({ kind: "none" });
    expect(firstUseContext(actor, undefined, workspace())).toMatchObject({ kind: "none" });
    expect(named(firstUseContext(undefined, own, workspace()))).toEqual([]);
  });

  it("keeps store order for equal or unreadable dates and ignores malformed entries", () => {
    const result = firstUseContext(
      actor,
      own,
      workspace({
        content: [
          draft({ title: "First", updatedAt: "not a date" }),
          draft({ title: "Second", updatedAt: "" }),
          { projectId: "p", title: 42, status: "Draft", updatedAt: "2027-01-01" } as never,
        ],
      }),
    );
    expect(named(result)).toEqual(["First"]);
  });
});

describe("draft titles are bounded and inert", () => {
  it("removes control and bidirectional characters and collapses whitespace", () => {
    expect(firstUseTitle("  Guide\u202e to\n\tboilers\u0007 ")).toBe("Guide to boilers");
    expect(firstUseTitle("\u2066{title}\u2069")).toBe("{title}");
    expect(firstUseTitle("")).toBeUndefined();
    expect(firstUseTitle(undefined)).toBeUndefined();
  });

  it("limits long titles by code point without splitting characters", () => {
    const long = "Å".repeat(40) + "😀".repeat(40);
    const shown = firstUseTitle(long)!;
    expect(Array.from(shown)).toHaveLength(FIRST_USE_TITLE_LIMIT);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    const exact = "x".repeat(FIRST_USE_TITLE_LIMIT);
    expect(firstUseTitle(exact)).toBe(exact);
  });
});

describe("consent controls follow the send contract", () => {
  it("shows draft generation to the owner only and site checks to owner or working roles", () => {
    expect(firstUseConsent(actor, own, false)).toEqual({ generation: true, checks: true });
    // An owner's checks never depend on the membership-derived flag.
    expect(firstUseConsent(actor, own, true)).toEqual({ generation: true, checks: true });
    const shared = { ownerId: other, projectId: "p" };
    expect(firstUseConsent(actor, shared, true)).toEqual({ generation: false, checks: true });
    expect(firstUseConsent(actor, shared, false)).toEqual({ generation: false, checks: false });
  });
});
