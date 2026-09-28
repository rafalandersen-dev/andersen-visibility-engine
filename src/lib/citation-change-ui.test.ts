/**
 * Event-driven state of the owner's change-artifact controls (Codex R3): the exact transitions the component
 * dispatches on user events — add/change/remove field rows, decide/retry/discard an approval, declare/retry a
 * performed change, failures — asserted on the resulting state and the request that a retry would send.
 */
import { describe, expect, it } from "vitest";
import {
  addFieldRow,
  approvalOutcomeKey,
  approvalRequestFor,
  blockingWrite,
  deletionBlocked,
  recallFrozenWrites,
  rememberFrozenWrites,
  duplicateRowIndexes,
  fieldRowsValid,
  firstFieldRow,
  frozenWritesReducer,
  nextUnusedKey,
  noFrozenWrites,
  removeFieldRow,
  serializeFieldRows,
  setFieldRowKey,
  setFieldRowValue,
  type FrozenWrites,
} from "./citation-change-ui";
import { CITATION_CHANGE_FIELDS } from "./citation-change";

const ART = "00000000-0000-4000-8000-0000000000aa";
const SHA = "d".repeat(64);

describe("field rows: unique enumerated keys, never silently collapsed (R3/1)", () => {
  it("Codex reproduction: two `name` rows with distinct values are refused for serialization and flagged on the second row; the draft is kept", () => {
    let rows = [firstFieldRow("listing")]; // name
    rows = setFieldRowValue(rows, 0, "after", "FIRST VALUE");
    rows = addFieldRow("listing", rows); // next unused key: address
    expect(rows[1].key).toBe("address");
    rows = setFieldRowKey(rows, 1, "name"); // the owner changes the select back to a used key
    rows = setFieldRowValue(rows, 1, "after", "SECOND VALUE");
    expect([...duplicateRowIndexes(rows)]).toEqual([1]);
    expect(serializeFieldRows(rows)).toBeNull();
    expect(fieldRowsValid("listing", rows)).toBe(false);
    // Both values are still in the draft (nothing discarded); correcting the key restores validity.
    expect(rows.map((r) => r.after)).toEqual(["FIRST VALUE", "SECOND VALUE"]);
    const fixed = setFieldRowKey(rows, 1, "phone");
    expect(duplicateRowIndexes(fixed).size).toBe(0);
    expect(serializeFieldRows(fixed)).toEqual({
      name: { before: null, after: "FIRST VALUE" },
      phone: { before: null, after: "SECOND VALUE" },
    });
    // Removing the offending row also resolves it without touching the first row.
    const removed = removeFieldRow(rows, 1);
    expect(serializeFieldRows(removed)).toEqual({ name: { before: null, after: "FIRST VALUE" } });
  });
  it("add always picks the next UNUSED key and stops when the kind is exhausted; the single row cannot be removed", () => {
    let rows = [firstFieldRow("configuration")];
    const keys = CITATION_CHANGE_FIELDS.configuration;
    for (let i = 1; i < keys.length; i++) {
      rows = addFieldRow("configuration", rows);
      expect(rows[i].key).toBe(keys[i]);
    }
    expect(nextUnusedKey("configuration", rows)).toBeNull();
    expect(addFieldRow("configuration", rows)).toHaveLength(keys.length);
    expect(removeFieldRow([firstFieldRow("listing")], 0)).toHaveLength(1);
    // Listing has 8 keys: after 8 rows the add is exhausted well before the 12-row cap.
    let l = [firstFieldRow("listing")];
    for (let i = 1; i < 8; i++) l = addFieldRow("listing", l);
    expect(nextUnusedKey("listing", l)).toBeNull();
    expect(new Set(l.map((r) => r.key)).size).toBe(8);
  });
  it("serialization keeps `before` null when blank and the rows' own order; validity still applies the allow-list", () => {
    const rows = setFieldRowValue(
      setFieldRowValue([firstFieldRow("listing")], 0, "after", "Acme"),
      0,
      "before",
      "   ",
    );
    expect(serializeFieldRows(rows)).toEqual({ name: { before: null, after: "Acme" } });
    expect(fieldRowsValid("listing", rows)).toBe(true);
    expect(fieldRowsValid("listing", setFieldRowValue(rows, 0, "after", ""))).toBe(false);
  });
});

describe("frozen approval request (R3/2)", () => {
  const request = approvalRequestFor(
    "p",
    { id: ART, artifactSha256: SHA, approval: null },
    "11111111-1111-4111-8111-111111111111",
  );
  it("the first decision freezes the COMPLETE request; a lost response keeps it; a retry sends exactly it even when the current read shows the write landed (never a reversal)", () => {
    expect(request).toEqual({
      projectId: "p",
      artifactId: ART,
      expectedSha: SHA,
      approved: true,
      expectedRevision: 0,
      requestId: "11111111-1111-4111-8111-111111111111",
    });
    let s: FrozenWrites = frozenWritesReducer(noFrozenWrites, { type: "approvalDecided", request });
    s = frozenWritesReducer(s, { type: "approvalFailed", code: "Failed to fetch" });
    expect(s.approval).toBe(request);
    // Background refetch now shows approved/current revision 1. The component does NOT recompute: the frozen
    // request is what the retry button sends. A new decision from the fresher read would be a REVOKE (rev 1):
    const fresh = approvalRequestFor(
      "p",
      { id: ART, artifactSha256: SHA, approval: { current: true, revision: 1 } },
      "22222222-2222-4222-8222-222222222222",
    );
    expect(fresh.approved).toBe(false);
    // …but while the approval is pending, a decide event is ignored: the frozen one stays.
    expect(frozenWritesReducer(s, { type: "approvalDecided", request: fresh }).approval).toBe(
      request,
    );
    // An intervening decision by someone else changes nothing about the frozen request either.
    expect(s.approval?.approved).toBe(true);
    expect(s.approval?.expectedRevision).toBe(0);
    s = frozenWritesReducer(s, { type: "approvalSettled" });
    expect(s.approval).toBeNull();
  });
  it("terminal outcomes drop the frozen request (stale head, forbidden); uncertain ones keep it; discard is explicit", () => {
    for (const code of [
      "citation_change_stale",
      "citation_change_forbidden",
      "citation_change_unsupported",
    ]) {
      const s = frozenWritesReducer(
        frozenWritesReducer(noFrozenWrites, { type: "approvalDecided", request }),
        { type: "approvalFailed", code },
      );
      expect(s.approval, code).toBeNull();
    }
    for (const code of ["citation_change_unavailable", "Failed to fetch", ""]) {
      const s = frozenWritesReducer(
        frozenWritesReducer(noFrozenWrites, { type: "approvalDecided", request }),
        { type: "approvalFailed", code },
      );
      expect(s.approval, code).toBe(request);
    }
    const s = frozenWritesReducer(
      frozenWritesReducer(noFrozenWrites, { type: "approvalDecided", request }),
      { type: "approvalDiscarded" },
    );
    expect(s.approval).toBeNull();
  });
  it("a replayed result is reported as historical, never as a fresh approval", () => {
    expect(approvalOutcomeKey({ replayed: true, approved: true })).toBe(
      "citationChange.approval.replayed",
    );
    expect(approvalOutcomeKey({ replayed: false, approved: true })).toBe(
      "citationChange.approval.approved",
    );
    expect(approvalOutcomeKey({ replayed: false, approved: false })).toBe(
      "citationChange.approval.revoked",
    );
  });
});

describe("frozen performed declaration (R3/3)", () => {
  it("the declared instant is frozen on the first click; a lost-response retry re-sends the SAME instant; a new performance is a separate explicit action", () => {
    const request = { projectId: "p", artifactId: ART, performedAt: "2026-09-28T10:00:00.000Z" };
    let s = frozenWritesReducer(noFrozenWrites, { type: "receiptDeclared", request });
    s = frozenWritesReducer(s, { type: "receiptFailed", code: "Failed to fetch" });
    expect(s.receipt).toBe(request);
    // Another declare while pending is ignored (no second instant minted).
    const later = { ...request, performedAt: "2026-09-28T10:05:00.000Z" };
    expect(frozenWritesReducer(s, { type: "receiptDeclared", request: later }).receipt).toBe(
      request,
    );
    // Terminal: an unapproved artifact or an invalid instant drops it; unavailable keeps it.
    expect(
      frozenWritesReducer(s, { type: "receiptFailed", code: "citation_change_unapproved" }).receipt,
    ).toBeNull();
    expect(
      frozenWritesReducer(s, { type: "receiptFailed", code: "citation_change_receipt_invalid" })
        .receipt,
    ).toBeNull();
    expect(
      frozenWritesReducer(s, { type: "receiptFailed", code: "citation_change_unavailable" })
        .receipt,
    ).toBe(request);
    // Explicit discard → a new performance may be declared with a new instant.
    s = frozenWritesReducer(s, { type: "receiptDiscarded" });
    expect(frozenWritesReducer(s, { type: "receiptDeclared", request: later }).receipt).toBe(later);
    // Approval and receipt freezes are independent.
    const both = frozenWritesReducer(
      frozenWritesReducer(noFrozenWrites, { type: "receiptDeclared", request }),
      {
        type: "approvalDecided",
        request: approvalRequestFor(
          "p",
          { id: ART, artifactSha256: SHA, approval: null },
          "33333333-3333-4333-8333-333333333333",
        ),
      },
    );
    expect(both.receipt).toBe(request);
    expect(frozenWritesReducer(both, { type: "approvalSettled" }).receipt).toBe(request);
  });
});

describe("cross-artifact recovery (Codex R4/1)", () => {
  const A = "00000000-0000-4000-8000-0000000000aa";
  const B = "00000000-0000-4000-8000-0000000000bb";
  const approveA = approvalRequestFor(
    "p",
    { id: A, artifactSha256: SHA, approval: null },
    "11111111-1111-4111-8111-111111111111",
  );
  it("Codex reproduction: while A's approval is unresolved, B's approval is BLOCKED (never sent), so B can never settle A's identity; declarations are an independent kind", () => {
    let s = frozenWritesReducer(noFrozenWrites, { type: "approvalDecided", request: approveA });
    s = frozenWritesReducer(s, { type: "approvalFailed", code: "Failed to fetch" });
    expect(blockingWrite(s, "approval", B)).toBe(A);
    expect(blockingWrite(s, "approval", A)).toBeNull(); // A's own retry/discard stay available
    expect(blockingWrite(s, "receipt", B)).toBeNull(); // a different kind is not blocked
    // The old defect: B's decide was ignored but B's write was still sent and its success cleared A. The state
    // machine still ignores B's decide; the component now never sends it (blocked), so A survives B's actions.
    const approveB = approvalRequestFor(
      "p",
      { id: B, artifactSha256: "e".repeat(64), approval: null },
      "22222222-2222-4222-8222-222222222222",
    );
    expect(frozenWritesReducer(s, { type: "approvalDecided", request: approveB }).approval).toBe(
      approveA,
    );
    // Deletion of the subject of an unresolved write is blocked; other artifacts may be deleted.
    expect(deletionBlocked(s, A)).toBe(true);
    expect(deletionBlocked(s, B)).toBe(false);
    // A pending declaration on B blocks A's declaration and B's deletion, but not A's approval controls.
    const withReceipt = frozenWritesReducer(s, {
      type: "receiptDeclared",
      request: { projectId: "p", artifactId: B, performedAt: "2026-09-28T10:00:00.000Z" },
    });
    expect(blockingWrite(withReceipt, "receipt", A)).toBe(B);
    expect(deletionBlocked(withReceipt, B)).toBe(true);
    expect(blockingWrite(withReceipt, "approval", A)).toBeNull();
    // Only A's own settle/discard clears A.
    expect(frozenWritesReducer(withReceipt, { type: "approvalSettled" }).approval).toBeNull();
    expect(frozenWritesReducer(withReceipt, { type: "approvalSettled" }).receipt).not.toBeNull();
  });
  it("an unresolved request survives the form unmounting within the session and is forgotten only once resolved", () => {
    const key = "owner:project";
    const s = frozenWritesReducer(noFrozenWrites, { type: "approvalDecided", request: approveA });
    rememberFrozenWrites(key, s);
    expect(recallFrozenWrites(key).approval).toBe(approveA);
    expect(recallFrozenWrites("owner:other").approval).toBeNull();
    rememberFrozenWrites(key, frozenWritesReducer(s, { type: "approvalDiscarded" }));
    expect(recallFrozenWrites(key)).toEqual(noFrozenWrites);
  });
});
