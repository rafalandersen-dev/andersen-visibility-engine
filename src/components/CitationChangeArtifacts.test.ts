/**
 * Static-markup regressions for the owner artifact controls (Codex R3; node env, no DOM): a duplicate field row
 * is flagged accessibly and blocks the save; a frozen approval renders ONLY retry + explicit new-decision
 * controls (never a recomputed approve/revoke); a frozen declaration renders retry + explicit new performance.
 * The event transitions are covered in `citation-change-ui.test.ts`; the real events run in the harness.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FrozenWrites, FieldRow } from "@/lib/citation-change-ui";

vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key} ${Object.values(vars).join(" ")}` : key,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/citation-change.functions", () => ({
  saveChangeArtifactFn: vi.fn(),
  removeChangeArtifactFn: vi.fn(),
  setChangeApprovalFn: vi.fn(),
  saveChangeReceiptFn: vi.fn(),
  removeChangeReceiptFn: vi.fn(),
}));
import { CitationChangeArtifacts } from "./CitationChangeArtifacts";

const OWNER = "00000000-0000-4000-8000-000000000001";
const ART = "00000000-0000-4000-8000-0000000000aa";
const SHA = "d".repeat(64);
const ART_B = "00000000-0000-4000-8000-0000000000bb";
const artifact = (approved: boolean, id = ART, reference = "google-business-profile:acme") => ({
  id,
  kind: "listing" as const,
  reference,
  fields: { openingHours: { before: "9–17", after: "9–18" } },
  artifactSha256: SHA,
  createdBy: OWNER,
  createdAt: "2026-09-28T09:00:00Z",
  approval: approved
    ? {
        approved: true,
        current: true,
        revision: 1,
        approverKind: "owner" as const,
        approverId: OWNER,
        approvedAt: "2026-09-28T09:05:00Z",
      }
    : null,
  receipts: [],
});
const render = (over: {
  artifacts?: ReturnType<typeof artifact>[];
  initialFieldRows?: FieldRow[];
  initialFrozen?: FrozenWrites;
}) =>
  renderToStaticMarkup(
    createElement(CitationChangeArtifacts, {
      projectId: "proj_a",
      ownerId: OWNER,
      artifacts: over.artifacts ?? [],
      isError: false,
      isPending: false,
      selectedArtifactId: null,
      selectedReceiptId: null,
      onSelect: () => {},
      initialFieldRows: over.initialFieldRows,
      initialFrozen: over.initialFrozen,
    }),
  );

describe("artifact form — duplicate rows (R3/1)", () => {
  it("flags the second `name` row with aria-invalid + an alert and disables Save; a unique form enables it", () => {
    const dup = render({
      initialFieldRows: [
        { key: "name", before: "", after: "FIRST VALUE" },
        { key: "name", before: "", after: "SECOND VALUE" },
      ],
    });
    expect(dup).toContain('aria-invalid="true"');
    expect(dup).toContain('role="alert"');
    expect(dup).toContain('data-duplicate-field="name"');
    expect(dup).toContain("citationChange.artifact.duplicateField");
    expect(dup).toContain('aria-describedby="change-field-dup-1"');
    // Both draft values are still rendered (nothing discarded).
    expect(dup).toContain('value="FIRST VALUE"');
    expect(dup).toContain('value="SECOND VALUE"');
    const save = dup.slice(dup.lastIndexOf("citationChange.artifact.save") - 700);
    expect(save).toContain('disabled=""');
    const ok = render({
      initialFieldRows: [
        { key: "name", before: "", after: "FIRST VALUE" },
        { key: "phone", before: "", after: "SECOND VALUE" },
      ],
    });
    expect(ok).not.toContain('role="alert"');
    expect(ok).not.toContain("aria-invalid");
    // Adding a field is offered only while an unused key exists.
    expect(ok).toContain("citationChange.artifact.addField");
    const full = render({
      initialFieldRows: [
        "name",
        "address",
        "phone",
        "openingHours",
        "website",
        "description",
        "category",
        "priceRange",
      ].map((key) => ({ key, before: "", after: "x" })),
    });
    expect(full).toContain("citationChange.artifact.fieldsExhausted");
  });
});

describe("frozen writes (R3/2, R3/3)", () => {
  it("a pending approval renders retry + explicit new decision and the frozen request note — never a recomputed approve/revoke even when the read now shows it approved", () => {
    const html = render({
      artifacts: [artifact(true)], // current read: approved, revision 1
      initialFrozen: {
        approval: {
          projectId: "proj_a",
          artifactId: ART,
          expectedSha: SHA,
          approved: true,
          expectedRevision: 0,
          requestId: "11111111-1111-4111-8111-111111111111",
        },
        receipt: null,
      },
    });
    expect(html).toContain('data-action="approval-retry"');
    expect(html).toContain('data-action="approval-discard"');
    expect(html).not.toContain('data-action="approval-revoke"');
    expect(html).not.toContain('data-action="approval-approve"');
    expect(html).toContain('data-pending="approval"');
    // The note names the frozen decision (approve, revision 0), not the current read (revoke, revision 1).
    expect(html).toContain(
      `citationChange.approval.pendingNote ${SHA.slice(0, 12)} citationChange.approval.approve 0`,
    );
    // Without a frozen request the current read decides the offered decision.
    const fresh = render({ artifacts: [artifact(true)] });
    expect(fresh).toContain('data-action="approval-revoke"');
    expect(fresh).not.toContain('data-action="approval-retry"');
    expect(render({ artifacts: [artifact(false)] })).toContain('data-action="approval-approve"');
  });
  it("a pending declaration renders retry + explicit new performance with the frozen instant; otherwise the declare control (disabled without a current approval)", () => {
    const html = render({
      artifacts: [artifact(true)],
      initialFrozen: {
        approval: null,
        receipt: { projectId: "proj_a", artifactId: ART, performedAt: "2026-09-28T10:00:00.000Z" },
      },
    });
    expect(html).toContain('data-action="receipt-retry"');
    expect(html).toContain('data-action="receipt-discard"');
    expect(html).not.toContain('data-action="receipt-declare"');
    expect(html).toContain("citationChange.receipt.pendingNote 2026-09-28T10:00:00");
    const declare = render({ artifacts: [artifact(false)] });
    const btn = declare.slice(
      declare.indexOf('data-action="receipt-declare"') - 600,
      declare.indexOf('data-action="receipt-declare"'),
    );
    expect(btn).toContain('disabled=""');
  });
  it("Codex R4/1 A/B: while A's approval is unresolved, B's approve/revoke is disabled with a note naming A, A's deletion is disabled, and B's declaration is untouched; a frozen declaration blocks the other declaration only", () => {
    const frozenA = {
      approval: {
        projectId: "proj_a",
        artifactId: ART,
        expectedSha: SHA,
        approved: false,
        expectedRevision: 1,
        requestId: "11111111-1111-4111-8111-111111111111",
      },
      receipt: null,
    };
    const html = render({
      artifacts: [artifact(true), artifact(true, ART_B, "google-business-profile:codex-r3-B")],
      initialFrozen: frozenA,
    });
    const a = html.slice(
      html.indexOf("google-business-profile:acme"),
      html.indexOf("google-business-profile:codex-r3-B"),
    );
    const b = html.slice(html.indexOf("google-business-profile:codex-r3-B"));
    expect(a).toContain('data-action="approval-retry"');
    expect(a).toContain('data-action="approval-discard"');
    expect(b).not.toContain('data-action="approval-retry"');
    expect(b).toContain('data-blocked="approval"');
    expect(b).toContain("citationChange.approval.blockedBy google-business-profile:acme");
    const tagOf = (html: string, action: string) => {
      const at = html.indexOf(`data-action="${action}"`);
      return html.slice(html.lastIndexOf("<button", at), at);
    };
    expect(tagOf(b, "approval-revoke")).toContain('disabled=""');
    // B's declaration is a different kind: enabled (B is approved) and not labelled as blocked.
    expect(b).not.toContain('data-blocked="receipt"');
    expect(tagOf(b, "receipt-declare")).not.toContain('disabled=""');
    // B's deletion is not blocked by A's request; A's is.
    expect(tagOf(b, "artifact-delete")).not.toContain('disabled=""');
    expect(tagOf(a, "artifact-delete")).toContain('disabled=""');
    const html2 = render({
      artifacts: [artifact(true), artifact(true, ART_B, "google-business-profile:codex-r3-B")],
      initialFrozen: {
        approval: null,
        receipt: { projectId: "proj_a", artifactId: ART, performedAt: "2026-09-28T10:00:00.000Z" },
      },
    });
    const b2 = html2.slice(html2.indexOf("google-business-profile:codex-r3-B"));
    expect(b2).toContain('data-blocked="receipt"');
    expect(b2).not.toContain('data-blocked="approval"');
    expect(tagOf(b2, "receipt-declare")).toContain('disabled=""');
  });
});
