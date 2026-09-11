import { describe, expect, it } from "vitest";
import { projectTeamDraft, projectTeamList } from "./project-team-view";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const project = {
  id: "p",
  name: "Client",
  publishSecret: "fixture-only-secret",
  wordpress: { password: "fixture-only" },
  shopify: { token: "fixture-only" },
  gscOAuth: { googleAccountEmail: "private@example.test" },
  autoScheduler: { summaryEmail: "private@example.test" },
  futurePrivateField: { hidden: true },
};
const draft = {
  id: "a",
  projectId: "p",
  title: "Draft",
  status: "Draft",
  updatedAt: "2026-09-11T06:00:00Z",
  markdown: "Owner draft",
  images: [
    {
      id: "im",
      alt: "Product",
      url: "https://example.test/private?token=fixture",
      storagePath: "private/path",
      importReceipt: { hidden: true },
    },
  ],
  knowledgeReferences: [{ private: true }],
  sourceDependencies: [{ private: true }],
  futurePrivateField: { hidden: true },
};
describe("project collaborator projection", () => {
  it("projects existing drafts beyond 30 images while retaining the byte limit", () => {
    const images = Array.from({ length: 31 }, (_, i) => ({
      id: `im${i}`,
      alt: "Image",
      storagePath: "hidden",
    }));
    const result = projectTeamDraft(scope, "a", { ...draft, images });
    expect(result.images).toHaveLength(31);
    expect(JSON.stringify(result)).not.toContain("hidden");
  });
  it("exposes only explicit project/list fields, excluding current and future private configuration", () => {
    const result = projectTeamList(scope, project, [draft], 4);
    expect(Object.keys(result.project).sort()).toEqual([
      "businessName",
      "description",
      "id",
      "name",
      "primaryLanguage",
    ]);
    expect(Object.keys(result.drafts[0]).sort()).toEqual([
      "id",
      "projectId",
      "status",
      "title",
      "updatedAt",
    ]);
    expect(JSON.stringify(result)).not.toContain("fixture-only");
    expect(JSON.stringify(result)).not.toContain("private@example");
    expect(result.remaining).toBe(4);
  });
  it("returns editable content without media credentials, source internals or arbitrary extra fields", () => {
    const result = projectTeamDraft(scope, "a", draft);
    expect(result.markdown).toBe("Owner draft");
    expect(result.images).toEqual([{ id: "im", alt: "Product" }]);
    for (const field of ["knowledgeReferences", "sourceDependencies", "futurePrivateField"])
      expect(result).not.toHaveProperty(field);
    expect(JSON.stringify(result)).not.toContain("token=");
  });
  it("does not modify or alias owner records", () => {
    const source = structuredClone(draft);
    const result = projectTeamDraft(scope, "a", source);
    result.images[0].alt = "Changed";
    expect(source).toEqual(draft);
  });
  it("rejects a different project, mixed project rows and duplicate draft IDs", () => {
    expect(() => projectTeamList(scope, { ...project, id: "other" }, [draft], 0)).toThrow();
    expect(() => projectTeamList(scope, project, [{ ...draft, projectId: "other" }], 0)).toThrow();
    expect(() => projectTeamList(scope, project, [draft, draft], 0)).toThrow();
  });
  it("rejects detail for a different project or asset", () => {
    expect(() => projectTeamDraft(scope, "other", draft)).toThrow();
    expect(() => projectTeamDraft(scope, "a", { ...draft, projectId: "other" })).toThrow();
  });
  it("fails explicitly on unbounded reads or invalid remaining counts", () => {
    expect(() =>
      projectTeamList(
        scope,
        project,
        Array.from({ length: 101 }, (_, i) => ({ ...draft, id: `a${i}` })),
        0,
      ),
    ).toThrow();
    expect(() => projectTeamList(scope, project, [], -1)).toThrow();
    expect(() =>
      projectTeamDraft(scope, "a", { ...draft, markdown: "x".repeat(1000001) }),
    ).toThrow();
  });
});

it("preserves legacy image identifiers without exposing storage fields", () => {
  const result = projectTeamDraft(scope, "a", {
    ...draft,
    images: [{ id: "bad id)with paren", alt: "Legacy", storagePath: "hidden" }],
  });
  expect(result.images).toEqual([{ id: "bad id)with paren", alt: "Legacy" }]);
});
