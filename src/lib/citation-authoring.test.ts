import { describe, expect, it } from "vitest";
import {
  authoringIdentity,
  authoringReducer,
  authoringErrorKey,
  canContinueOnHead,
  draftFromRecord,
  draftToFinding,
  emptyAccuracy,
  emptySupport,
  headRows,
  headVersionOf,
  initialAuthoringState,
  instantDisplayDiffers,
  instantFromUtcInput,
  instantToUtcInput,
  newFindingDraft,
  staleSelections,
  type AuthoringState,
} from "./citation-authoring";
import { findingSchema } from "./citation-finding";

const owner = "00000000-0000-4000-8000-000000000001";
const ANSWER = "10000000-0000-4000-8000-000000000001";
const SOURCE = "80000000-0000-4000-8000-000000000001";
const RECORD = "b1000000-0000-4000-8000-000000000001";
const FACT_ROW = "a1000000-0000-4000-8000-000000000001";
const FACT = "a2000000-0000-4000-8000-000000000001";
const scope = {
  panelId: "40000000-0000-4000-8000-000000000001",
  panelVersion: 2,
  client: { name: "Acme", market: "SE" },
};
const now = "2026-09-26T10:00:00Z";
const capturedAt = "2026-09-10T09:00:00Z";

describe("draftToFinding — exact findingSchema records for both families", () => {
  it("family A: observation + support claim with an exact selected-record pin, no default approval", () => {
    const d = newFindingDraft("60000000-0000-4000-8000-000000000001", "citation_source");
    d.scope = scope;
    d.answerId = ANSWER;
    d.sourceId = SOURCE;
    d.observation = "The answer cites a competitor for opening hours.";
    d.competitorCited = "yes";
    d.ownCited = "no";
    d.support = [
      {
        ...emptySupport(),
        claimSpan: "open every Saturday until 18:00",
        citedUrl: "https://competitor.example/hours",
        status: "partly_supports",
        sourcePassage: "Saturday 10–18",
        sourceCapturedAt: "2026-09-10T09:30",
        selectedRecord: {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 3,
          recordRevision: 1,
        },
      },
    ];
    const out = draftToFinding(d, owner, now, capturedAt);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(findingSchema.safeParse(out.finding).success).toBe(true);
    expect(out.finding.evidence).toEqual([
      { kind: "answer", id: ANSWER },
      { kind: "source", id: SOURCE },
    ]);
    expect(out.finding.review).toEqual({ reviewer: owner, reviewedAt: now });
    expect(out.finding.decision).toBe("needs_second_review");
    expect(out.finding.support[0]).toMatchObject({
      answerCapturedAt: capturedAt,
      sourceCapturedAt: "2026-09-10T09:30:00Z",
      selectedRecord: { sourceId: SOURCE, recordId: RECORD, sourceRevision: 3, recordRevision: 1 },
      review: { reviewer: owner },
    });
    expect(out.finding.recommendation).toBeNull();
    expect(out.scope).toBe(scope);
  });
  it("family B: recommendation + accuracy claim pinned to the exact fact row, anchored to the answer", () => {
    const d = newFindingDraft("60000000-0000-4000-8000-000000000002", "recommendation_accuracy");
    d.scope = scope;
    d.answerId = ANSWER;
    d.observation = "The answer recommends us with an outdated price.";
    d.recommendation = {
      enabled: true,
      status: "recommended",
      passage: "Acme is a good option.",
      target: "Acme",
      suitability: "fits",
    };
    d.accuracy = [
      {
        ...emptyAccuracy(),
        claimSpan: "60 minutes costs 500 SEK",
        status: "outdated_now",
        fact: { factRowId: FACT_ROW, factId: FACT, factVersion: 2, factKind: "price" },
      },
    ];
    const out = draftToFinding(d, owner, now, capturedAt);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.finding.accuracy[0]).toMatchObject({
      factKind: "price",
      status: "outdated_now",
      factId: FACT,
      factRowId: FACT_ROW,
      factVersion: 2,
      captureEvidenceId: ANSWER,
      review: { reviewer: owner },
    });
    expect(out.finding.recommendation).toMatchObject({
      status: "recommended",
      suitability: "fits",
    });
  });
  it("reports issues by path instead of inventing values (missing scope/answer, assessed support without passage, B without content)", () => {
    const d = newFindingDraft("60000000-0000-4000-8000-000000000003", "recommendation_accuracy");
    d.observation = "x";
    const out = draftToFinding(d, owner, now, null);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.startsWith("scope"))).toBe(true);
    expect(out.issues.some((i) => i.startsWith("evidence"))).toBe(true);
    d.scope = scope;
    d.answerId = ANSWER;
    d.support = [
      { ...emptySupport(), claimSpan: "c", citedUrl: "https://x.example", status: "supports" },
    ];
    const out2 = draftToFinding(d, owner, now, capturedAt);
    expect(out2.ok).toBe(false);
    if (out2.ok) return;
    expect(out2.issues.some((i) => i.includes("support.0"))).toBe(true);
    expect(
      out2.issues.some(
        (i) => i.toLowerCase().includes("recommendation") || i.toLowerCase().includes("accuracy"),
      ),
    ).toBe(true);
  });
  it("stored source instants round-trip the UTC control: exact string kept unless edited (Codex B1)", () => {
    // A Z instant shows as UTC wall-clock; the same wall-clock back means "unchanged" → exact original.
    expect(instantToUtcInput("2026-09-10T09:30:00Z")).toBe("2026-09-10T09:30:00");
    expect(instantFromUtcInput("2026-09-10T09:30:00", "2026-09-10T09:30:00Z")).toBe(
      "2026-09-10T09:30:00Z",
    );
    expect(instantDisplayDiffers("2026-09-10T09:30:00Z")).toBe(false);
    // A nonzero offset with microseconds: displayed as its UTC instant, the stored form flagged, and kept verbatim
    // when the owner does not edit — the instant is never reinterpreted or truncated.
    const offset = "2026-09-10T11:30:00.123456+02:00";
    expect(instantToUtcInput(offset)).toBe("2026-09-10T09:30:00");
    expect(instantDisplayDiffers(offset)).toBe(true);
    expect(instantFromUtcInput("2026-09-10T09:30:00", offset)).toBe(offset);
    // An explicit edit produces a Z instant (seconds optional in the control).
    expect(instantFromUtcInput("2026-09-11T08:00", offset)).toBe("2026-09-11T08:00:00Z");
    expect(instantFromUtcInput("2026-09-11T08:00:05", offset)).toBe("2026-09-11T08:00:05Z");
    // Empty / unparsable stays honest (empty control, value passed through for validation).
    expect(instantToUtcInput("")).toBe("");
    expect(instantToUtcInput("not a date")).toBe("");
    expect(instantFromUtcInput("", "")).toBe("");
    // Through the reducer: reopen, review WITHOUT editing, resave → the record carries the exact stored string.
    const d = newFindingDraft("60000000-0000-4000-8000-000000000011", "citation_source");
    d.scope = scope;
    d.answerId = ANSWER;
    d.observation = "obs";
    d.support = [
      {
        ...emptySupport(),
        claimSpan: "c",
        citedUrl: "https://x.example",
        status: "supports",
        sourcePassage: "p",
        sourceCapturedAt: offset,
      },
    ];
    const built = draftToFinding(d, owner, now, capturedAt);
    if (!built.ok) throw new Error(built.issues.join());
    expect(built.finding.support[0].sourceCapturedAt).toBe(offset);
    const reopened = draftFromRecord(built.finding, scope, {
      id: "60000000-0000-4000-8000-0000000000e1",
      version: 1,
    });
    expect(reopened.support[0].sourceCapturedAt).toBe(offset);
    // The control's change handler with the unchanged wall-clock keeps the exact string...
    reopened.support[0].sourceCapturedAt = instantFromUtcInput(
      instantToUtcInput(reopened.support[0].sourceCapturedAt),
      reopened.support[0].sourceCapturedAt,
    );
    const resaved = draftToFinding(reopened, owner, now, capturedAt);
    expect(resaved.ok && resaved.finding.support[0].sourceCapturedAt).toBe(offset);
    // ...and an explicit edit changes it to the edited Z instant.
    reopened.support[0].sourceCapturedAt = instantFromUtcInput(
      "2026-09-12T07:15",
      reopened.support[0].sourceCapturedAt,
    );
    const edited = draftToFinding(reopened, owner, now, capturedAt);
    expect(edited.ok && edited.finding.support[0].sourceCapturedAt).toBe("2026-09-12T07:15:00Z");
  });
  it("an accepted decision needs a confirmed entity (schema rule surfaced, not bypassed)", () => {
    const d = newFindingDraft("60000000-0000-4000-8000-000000000004", "citation_source");
    d.scope = scope;
    d.answerId = ANSWER;
    d.observation = "x";
    d.entityMatch = "ambiguous";
    d.decision = "accepted";
    const out = draftToFinding(d, owner, now, capturedAt);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues.some((i) => i.startsWith("entityMatch"))).toBe(true);
  });
});

describe("reopen / edit / stale references", () => {
  it("draftFromRecord round-trips a stored record and pins the inspected version for the next save", () => {
    const d = newFindingDraft("60000000-0000-4000-8000-000000000005", "citation_source");
    d.scope = scope;
    d.answerId = ANSWER;
    d.observation = "obs";
    d.hypothesis = "hyp";
    d.support = [
      { ...emptySupport(), claimSpan: "c", citedUrl: "https://x.example", status: "not_checked" },
    ];
    const built = draftToFinding(d, owner, now, capturedAt);
    if (!built.ok) throw new Error(built.issues.join());
    const again = draftFromRecord(built.finding, scope, {
      id: "60000000-0000-4000-8000-0000000000e3",
      version: 3,
    });
    expect(again.expectedVersion).toBe(3);
    expect(again.expectedHeadId).toBe("60000000-0000-4000-8000-0000000000e3");
    expect(again.observation).toBe("obs");
    expect(again.hypothesis).toBe("hyp");
    expect(again.answerId).toBe(ANSWER);
    expect(again.support[0].status).toBe("not_checked");
    const rebuilt = draftToFinding(again, owner, now, capturedAt);
    expect(rebuilt.ok && rebuilt.finding.observation).toBe("obs");
  });
  it("flags answer/source/record/fact/scope references that no longer resolve in fresh reads", () => {
    const d = newFindingDraft("60000000-0000-4000-8000-000000000006", "citation_source");
    d.scope = scope;
    d.answerId = ANSWER;
    d.sourceId = SOURCE;
    d.support = [
      {
        ...emptySupport(),
        selectedRecord: {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 3,
          recordRevision: 1,
        },
      },
    ];
    d.accuracy = [
      {
        ...emptyAccuracy(),
        fact: { factRowId: FACT_ROW, factId: FACT, factVersion: 2, factKind: "price" },
      },
    ];
    const fresh = {
      answers: [{ id: ANSWER }],
      sources: [{ id: SOURCE, revision: 3, status: "active" }],
      records: [{ id: RECORD, revision: 1, sourceId: SOURCE, sourceRevision: 3 }],
      facts: [{ id: FACT_ROW, version: 2 } as never],
      lockedScopes: [{ panelId: scope.panelId, panelVersion: 2 }],
    };
    expect(staleSelections(d, fresh)).toEqual([]);
    expect(staleSelections(d, { ...fresh, answers: [] })).toEqual(["answer"]);
    expect(
      staleSelections(d, { ...fresh, sources: [{ id: SOURCE, revision: 3, status: "revoked" }] }),
    ).toEqual(["source"]);
    expect(
      staleSelections(d, { ...fresh, records: [{ ...fresh.records[0], revision: 2 }] }),
    ).toEqual(["support.0"]);
    expect(
      staleSelections(d, { ...fresh, facts: [{ id: FACT_ROW, version: 3 } as never] }),
    ).toEqual(["accuracy.0"]);
    expect(
      staleSelections(d, { ...fresh, lockedScopes: [{ panelId: scope.panelId, panelVersion: 1 }] }),
    ).toEqual(["scope"]);
  });
  it("maps server outcomes to meaningful copy keys and reads the head version from the list", () => {
    expect(authoringErrorKey("citation_finding_version_conflict")).toBe("versionConflict");
    expect(authoringErrorKey("citation_panel_scope_unauthenticated")).toBe("scopeUnauthenticated");
    expect(authoringErrorKey("citation_finding_scope_drift")).toBe("scopeDrift");
    expect(authoringErrorKey("citation_finding_capacity")).toBe("capacity");
    expect(authoringErrorKey("anything_else")).toBe("unavailable");
    const list = [
      { findingId: "60000000-0000-4000-8000-000000000007", version: 1 },
      { findingId: "60000000-0000-4000-8000-000000000007", version: 2 },
    ];
    expect(headVersionOf(list, "60000000-0000-4000-8000-000000000007".toUpperCase())).toBe(2);
    expect(headVersionOf(list, "60000000-0000-4000-8000-000000000008")).toBe(0);
  });
  it("the edit picker offers ONE row per logical finding — its head — never a historical version", () => {
    const f = "60000000-0000-4000-8000-000000000009";
    const rows = [
      { id: "r1", findingId: f, version: 1 },
      { id: "r2", findingId: f.toUpperCase(), version: 2 },
      { id: "r3", findingId: "60000000-0000-4000-8000-00000000000a", version: 1 },
    ];
    expect(
      headRows(rows)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["r2", "r3"]);
  });
});

describe("authoring state machine (component interaction contract, no DOM)", () => {
  const identity = authoringIdentity(owner, "p");
  const HEAD_V1 = "60000000-0000-4000-8000-0000000000b1";
  const HEAD_V2 = "60000000-0000-4000-8000-0000000000b2";
  const ready = () => {
    const d = newFindingDraft("60000000-0000-4000-8000-000000000010", "citation_source");
    d.scope = scope;
    d.answerId = ANSWER;
    d.observation = "Observed once.";
    return d;
  };
  const reviewAt = (s: AuthoringState, nowIso: string) =>
    authoringReducer(s, { type: "review", ownerId: owner, nowIso, answerCapturedAt: capturedAt });
  const start = (draft = ready()) =>
    authoringReducer(initialAuthoringState(identity), { type: "startNew", draft });

  it("freezes the reviewed payload: lost response + retry, busy/error re-renders and back/review resend the byte-identical record", () => {
    let s = reviewAt(start(), "2026-09-26T10:00:00.000Z");
    expect(s.stage).toBe("review");
    const first = JSON.stringify(s.reviewed!.finding);
    expect(s.reviewed!.finding.review.reviewedAt).toBe("2026-09-26T10:00:00.000Z");
    // The save's response is lost (transport): the component reports a generic failure and keeps the draft.
    s = authoringReducer(s, { type: "saveStarted" });
    s = authoringReducer(s, { type: "saveFailed", code: "citation_record_unavailable" });
    expect(s.errorKey).toBe("unavailable");
    expect(s.draft).not.toBeNull();
    // Re-rendering later (a later "now") must NOT rebuild the record: same bytes on retry → server idempotency.
    s = reviewAt(s, "2026-09-26T10:05:00.000Z");
    expect(JSON.stringify(s.reviewed!.finding)).toBe(first);
    // Back to editing without touching a field, then review again: still the same instant and bytes.
    s = authoringReducer(s, { type: "back" });
    expect(s.stage).toBe("edit");
    s = reviewAt(s, "2026-09-26T10:06:00.000Z");
    expect(JSON.stringify(s.reviewed!.finding)).toBe(first);
    // A genuine field edit invalidates the frozen payload; the next review mints a new instant.
    s = authoringReducer(s, { type: "edit", patch: { observation: "Observed twice." } });
    expect(s.reviewed).toBeNull();
    s = reviewAt(s, "2026-09-26T10:07:00.000Z");
    expect(s.reviewed!.finding.observation).toBe("Observed twice.");
    expect(s.reviewed!.finding.review.reviewedAt).toBe("2026-09-26T10:07:00.000Z");
    expect(JSON.stringify(s.reviewed!.finding)).not.toBe(first);
  });
  it("anchors an edit to the INSPECTED row and never adopts an unseen head token from the list", () => {
    const d = ready();
    const built = draftToFinding(d, owner, now, capturedAt);
    if (!built.ok) throw new Error(built.issues.join());
    // The owner opened row v1 while the list (possibly refetched in the background) already knows v2.
    const edit = draftFromRecord(built.finding, scope, { id: HEAD_V1, version: 1 });
    let s = authoringReducer(initialAuthoringState(identity), { type: "startEdit", draft: edit });
    expect(s.draft).toMatchObject({ expectedVersion: 1, expectedHeadId: HEAD_V1 });
    s = authoringReducer(s, { type: "edit", patch: { observation: "changed from v1" } });
    s = reviewAt(s, now);
    // Nothing in the state machine reads the list: the token still names the inspected row (the server will
    // conflict against the real head v2 instead of silently minting v3 on top of an unseen version).
    expect(s.draft).toMatchObject({ expectedVersion: 1, expectedHeadId: HEAD_V1 });
  });
  it("conflict continuation needs a shown, valid current head; an invalid head keeps the draft and explains", () => {
    let s = reviewAt(start(), now);
    const payload = JSON.stringify(s.reviewed!.finding);
    s = authoringReducer(s, { type: "saveStarted" });
    s = authoringReducer(s, { type: "saveFailed", code: "citation_finding_version_conflict" });
    expect(s.errorKey).toBe("versionConflict");
    // The current head's record could not be validated (recordValid=false → record null).
    s = authoringReducer(s, {
      type: "conflictLoaded",
      head: { id: HEAD_V2, version: 2, record: null },
    });
    expect(canContinueOnHead(s)).toBe(false);
    const before = s;
    s = authoringReducer(s, { type: "continueOnHead" });
    expect(s).toBe(before); // no-op: the owner cannot acknowledge what could not be shown
    expect(s.draft).toMatchObject({ expectedVersion: 0, expectedHeadId: null });
    expect(s.reviewed && JSON.stringify(s.reviewed.finding)).toBe(payload);
    // A valid head: continuation moves ONLY the token; the reviewed payload stays byte-identical for the retry.
    const d = ready();
    const built = draftToFinding(d, owner, now, capturedAt);
    if (!built.ok) throw new Error(built.issues.join());
    s = authoringReducer(s, {
      type: "conflictLoaded",
      head: { id: HEAD_V2, version: 2, record: built.finding },
    });
    expect(canContinueOnHead(s)).toBe(true);
    s = authoringReducer(s, { type: "continueOnHead" });
    expect(s.conflict).toBeNull();
    expect(s.errorKey).toBeNull();
    expect(s.draft).toMatchObject({ expectedVersion: 2, expectedHeadId: HEAD_V2 });
    expect(JSON.stringify(s.reviewed!.finding)).toBe(payload);
    // A conflict detail arriving when there is no conflict error (e.g. stale async result) is ignored.
    const settled = authoringReducer(initialAuthoringState(identity), {
      type: "conflictLoaded",
      head: { id: HEAD_V2, version: 2, record: built.finding },
    });
    expect(settled.conflict).toBeNull();
  });
  it("binds state to the owner+project identity: a project switch drops the draft, the same identity keeps it", () => {
    let s = reviewAt(start(), now);
    expect(authoringReducer(s, { type: "scopeChanged", identity })).toBe(s);
    const other = authoringIdentity(owner, "q");
    s = authoringReducer(s, { type: "scopeChanged", identity: other });
    expect(s).toEqual(initialAuthoringState(other));
    expect(authoringIdentity(owner.toUpperCase(), "p")).toBe(identity);
  });
  it("a successful save clears the draft and reports the version; cancel discards everything", () => {
    let s = reviewAt(start(), now);
    s = authoringReducer(s, { type: "saved", version: 1 });
    expect(s.draft).toBeNull();
    expect(s.reviewed).toBeNull();
    expect(s.saved).toEqual({ version: 1 });
    s = reviewAt(start(), now);
    expect(authoringReducer(s, { type: "cancel" })).toEqual(initialAuthoringState(identity));
  });
});
