/**
 * Pure change-evidence contracts (candidate 20260928120000): the enumerated non-secret field allow-list with its
 * EXACT nested shape (R1/1 mirrored client-side), the approval input's own head + request identity (R1/2), the
 * inspection input pairings, the fixed error-key allowlist and the owner-side chain fold.
 */
import { describe, expect, it } from "vitest";
import {
  CHANGE_ERROR_KEYS,
  changeApprovalInputSchema,
  changeApprovalProvenanceSchema,
  changeArtifactInputSchema,
  changeErrorKey,
  changeFieldsValid,
  inspectionChains,
  inspectionInputSchema,
  inspectionViewSchema,
} from "./citation-change";

const OWNER = "00000000-0000-4000-8000-000000000001";
const ART = "00000000-0000-4000-8000-0000000000aa";
const ROW = "00000000-0000-4000-8000-0000000000f1";
const SHA = "a".repeat(64);
const base = { expectedOwnerId: OWNER, projectId: "p" };

describe("enumerated non-secret fields", () => {
  it("accepts only the listed keys per kind with the exact {before, after} shape; refuses secrets, nested extras, structured values and credentials", () => {
    expect(changeFieldsValid("listing", { openingHours: { before: "9–17", after: "9–18" } })).toBe(
      true,
    );
    expect(changeFieldsValid("listing", { name: { before: null, after: "Acme" } })).toBe(true);
    expect(changeFieldsValid("configuration", { siteTitle: { after: "Acme" } })).toBe(true);
    for (const bad of [
      { apiKey: { after: "x" } },
      { applicationPassword: { after: "x" } },
      { openingHours: { after: "9–17", password: "DUMMY_NONSECRET_SENTINEL" } },
      { openingHours: { before: null, after: "9–17", token: "x" } },
      { openingHours: { after: { nested: "x" } } },
      { openingHours: { before: 12, after: "9–17" } },
      { openingHours: { before: "x" } },
      { openingHours: "just a string" },
      { website: { after: "https://user:secret@acme.example/" } },
      { name: { after: "" } },
      { name: { after: "a\u0000b" } },
      { name: { after: "x".repeat(501) } },
      {},
    ])
      expect(changeFieldsValid("listing", bad), JSON.stringify(bad)).toBe(false);
    expect(changeFieldsValid("configuration", { openingHours: { after: "x" } })).toBe(false);
    expect(
      changeFieldsValid(
        "configuration",
        Object.fromEntries(
          Array.from({ length: 13 }, (_, i) => ["k" + i, { after: "x" }]),
        ) as Record<string, unknown>,
      ),
    ).toBe(false);
    expect(
      changeArtifactInputSchema.safeParse({
        ...base,
        kind: "listing",
        reference: "google-business-profile:acme",
        fields: { openingHours: { after: "9–17", password: "DUMMY_NONSECRET_SENTINEL" } },
      }).success,
    ).toBe(false);
    expect(
      changeArtifactInputSchema.safeParse({
        ...base,
        kind: "public_url",
        reference: "x",
        fields: { name: { after: "x" } },
      }).success,
    ).toBe(false);
  });
});

describe("approval subject identity (R1/2, R2)", () => {
  it("an approval write names the reviewed revision and a frozen request id; provenance carries revision/currentRevision/replayed", () => {
    const ok = changeApprovalInputSchema.safeParse({
      ...base,
      artifactId: ART,
      expectedSha: SHA,
      approved: true,
      expectedRevision: 0,
      requestId: ROW,
    });
    expect(ok.success).toBe(true);
    for (const missing of ["expectedRevision", "requestId"]) {
      const v: Record<string, unknown> = {
        ...base,
        artifactId: ART,
        expectedSha: SHA,
        approved: true,
        expectedRevision: 1,
        requestId: ROW,
      };
      delete v[missing];
      expect(changeApprovalInputSchema.safeParse(v).success, missing).toBe(false);
    }
    expect(
      changeApprovalProvenanceSchema.safeParse({
        approved: true,
        approverKind: "delegate",
        approverId: OWNER,
        approvedAt: "2026-09-28T10:00:00Z",
        revision: 1,
        currentRevision: 2,
        replayed: true,
      }).success,
    ).toBe(true);
    expect(
      changeApprovalProvenanceSchema.safeParse({
        approved: false,
        approverKind: null,
        approverId: null,
        approvedAt: null,
      }).success,
    ).toBe(false);
  });
});

describe("inspection input and view", () => {
  it("pairs the instant with the result and the head id with the version; the view exposes head validity", () => {
    const target = { ownerId: OWNER, projectId: "p", improvementRowId: ROW, expectedSha: SHA };
    expect(
      inspectionInputSchema.safeParse({
        ...target,
        checkResult: "shows_approved_content",
        observedAt: "2026-09-28T10:00:00Z",
        expectedVersion: 0,
        expectedHeadId: null,
      }).success,
    ).toBe(true);
    expect(
      inspectionInputSchema.safeParse({
        ...target,
        checkResult: "withdrawn",
        observedAt: null,
        expectedVersion: 1,
        expectedHeadId: ART,
      }).success,
    ).toBe(true);
    for (const bad of [
      {
        checkResult: "withdrawn",
        observedAt: "2026-09-28T10:00:00Z",
        expectedVersion: 1,
        expectedHeadId: ART,
      },
      { checkResult: "does_not_show", observedAt: null, expectedVersion: 0, expectedHeadId: null },
      {
        checkResult: "does_not_show",
        observedAt: "2026-09-28T10:00:00Z",
        expectedVersion: 1,
        expectedHeadId: null,
      },
      {
        checkResult: "does_not_show",
        observedAt: "2026-09-28T10:00:00Z",
        expectedVersion: 0,
        expectedHeadId: ART,
      },
    ])
      expect(inspectionInputSchema.safeParse({ ...target, ...bad }).success, bad.checkResult).toBe(
        false,
      );
    const view = inspectionViewSchema.safeParse({
      id: ROW,
      improvementId: ART,
      version: 1,
      expectedSha: SHA,
      kind: "listing",
      destinationReference: "google-business-profile:acme",
      approvedVersion: SHA,
      approval: { known: true, approvedAt: "2026-09-28T10:00:00Z" },
      performer: { known: true, anchorAt: "2026-09-28T10:00:01Z" },
      independenceAvailable: true,
      approvedContent: { fields: { openingHours: { before: null, after: "9–18" } } },
      boundFindings: [],
      myHead: { version: 1, id: ART, effective: false, ineffectiveReason: "authority" },
      myInspections: [],
    });
    expect(view.success).toBe(true);
  });
  it("folds receipts per inspector with the head first and never surfaces a superseded receipt as the head", () => {
    const a = "00000000-0000-4000-8000-0000000000a1";
    const b = "00000000-0000-4000-8000-0000000000a2";
    const chains = inspectionChains([
      { inspectorId: a, version: 1, checkResult: "shows_approved_content" },
      { inspectorId: a, version: 2, checkResult: "withdrawn" },
      { inspectorId: b, version: 1, checkResult: "does_not_show" },
    ]);
    expect(chains.map((c) => [c.inspectorId, c.head.version, c.history.length])).toEqual([
      [a, 2, 1],
      [b, 1, 0],
    ]);
  });
});

describe("error keys", () => {
  it("maps every fixed outcome token to a citationChange key and collapses unknown codes to the generic one", () => {
    for (const [code, key] of Object.entries(CHANGE_ERROR_KEYS))
      expect(changeErrorKey(code)).toBe(key);
    expect(changeErrorKey("citation_inspection_identity_unavailable")).toBe(
      "citationChange.error.identityUnavailable",
    );
    expect(changeErrorKey("something_else")).toBe("citationChange.error.generic");
    expect(changeErrorKey("")).toBe("citationChange.error.generic");
  });
});
