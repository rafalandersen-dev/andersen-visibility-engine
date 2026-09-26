import { describe, expect, it } from "vitest";
import {
  absoluteReviewerLink,
  accuracyEntryDisplay,
  buildReviewerLink,
  canSubmitReview,
  grantEligibleReviewers,
  initialReviewerForm,
  isStaleConflict,
  ownActiveReceipt,
  pendingDecisionInvalidated,
  reviewErrorAction,
  reviewRecordMasked,
  reviewSubmitGuard,
  newReviewerMountToken,
  reviewerFormReducer,
  reviewerLinkContext,
  reviewerMaterialExposed,
  reviewerQueryKeys,
  reviewerSurfaceHidden,
  revokeTargets,
  type ReviewerCandidate,
  type ReviewerFormEvent,
  type ReviewerFormState,
} from "./citation-review-ui";
import type { CitationAccuracyResolution } from "./citation-business-fact";

const owner = "00000000-0000-4000-8000-000000000001";
const rev = "00000000-0000-4000-8000-0000000000a1";
const edt = "00000000-0000-4000-8000-0000000000a2";
const member = (over: Partial<ReviewerCandidate> = {}): ReviewerCandidate => ({
  actorId: rev,
  email: "reviewer@example.com",
  role: "reviewer",
  active: true,
  expiresAt: null,
  ...over,
});
const NOW = Date.parse("2026-09-21T12:00:00Z");

describe("grantEligibleReviewers — mirrors the live approval policy", () => {
  const roster = [
    member({ actorId: rev, role: "reviewer" }),
    member({ actorId: edt, role: "editor" }),
    member({ actorId: "00000000-0000-4000-8000-0000000000a3", role: "viewer" }),
  ];
  it("disabled or no policy → no eligible reviewers", () => {
    expect(grantEligibleReviewers(roster, owner, "disabled", NOW)).toEqual([]);
    expect(grantEligibleReviewers(roster, owner, null, NOW)).toEqual([]);
  });
  it("separate_reviewers → reviewers ONLY (an editor is not eligible)", () => {
    expect(
      grantEligibleReviewers(roster, owner, "separate_reviewers", NOW).map((m) => m.actorId),
    ).toEqual([rev]);
  });
  it("editors_can_approve → reviewers AND editors, never viewers", () => {
    expect(
      grantEligibleReviewers(roster, owner, "editors_can_approve", NOW).map((m) => m.actorId),
    ).toEqual([rev, edt]);
  });
  it("excludes inactive, expired, unparseable-expiry members and the owner (case-insensitive)", () => {
    const out = grantEligibleReviewers(
      [
        member({ actorId: "00000000-0000-4000-8000-0000000000b1", active: false }),
        member({
          actorId: "00000000-0000-4000-8000-0000000000b2",
          expiresAt: "2026-09-20T00:00:00Z",
        }),
        member({ actorId: "00000000-0000-4000-8000-0000000000b3", expiresAt: "nope" }),
        member({ actorId: owner.toUpperCase() }),
        member({
          actorId: "00000000-0000-4000-8000-0000000000b4",
          expiresAt: "2999-01-01T00:00:00Z",
        }),
      ],
      owner,
      "separate_reviewers",
      NOW,
    );
    expect(out.map((m) => m.actorId)).toEqual(["00000000-0000-4000-8000-0000000000b4"]);
  });
});

describe("revokeTargets — distinct from grant eligibility; a departed member can still be revoked", () => {
  it("includes inactive / expired / editor members (only the owner is excluded)", () => {
    const out = revokeTargets(
      [
        member({ actorId: rev, active: false }), // departed
        member({ actorId: edt, role: "editor", expiresAt: "2000-01-01T00:00:00Z" }), // expired editor
        member({ actorId: owner }),
      ],
      owner,
    );
    expect(out.map((m) => m.actorId).sort()).toEqual([edt, rev].sort());
  });
});

describe("reviewerLinkContext — owner mode, reviewer mode, and rejected partial/malformed links", () => {
  it("no params → owner-management mode", () => {
    expect(reviewerLinkContext({})).toEqual({ mode: "owner" });
  });
  it("full valid owner+project+finding → reviewer mode with the owner's project (not the reviewer's own)", () => {
    expect(reviewerLinkContext({ owner, project: "synergy_2026", finding: rev })).toEqual({
      mode: "reviewer",
      context: { ownerId: owner, projectId: "synergy_2026", findingRowId: rev },
    });
  });
  it("partial or malformed link is REJECTED, never a silent fallback", () => {
    expect(reviewerLinkContext({ owner, finding: rev }).mode).toBe("invalid"); // missing project
    expect(reviewerLinkContext({ owner, project: "p", finding: "not-a-uuid" }).mode).toBe(
      "invalid",
    );
    expect(reviewerLinkContext({ owner: "bad", project: "p", finding: rev }).mode).toBe("invalid");
    expect(reviewerLinkContext({ owner, project: "has space", finding: rev }).mode).toBe("invalid");
  });
  it("buildReviewerLink round-trips through reviewerLinkContext", () => {
    const ctx = { ownerId: owner, projectId: "synergy_2026", findingRowId: rev };
    const link = buildReviewerLink(ctx);
    const search = Object.fromEntries(
      new URL("https://x" + link.slice(link.indexOf("?"))).searchParams,
    );
    expect(reviewerLinkContext(search)).toEqual({ mode: "reviewer", context: ctx });
  });
  it("absoluteReviewerLink prefixes the CURRENT application origin and stays a usable full URL", () => {
    const ctx = { ownerId: owner, projectId: "synergy_2026", findingRowId: rev };
    const out = absoluteReviewerLink(ctx, "https://app.example.com");
    expect(out.absolute).toBe(true);
    const url = new URL(out.href);
    expect(url.origin).toBe("https://app.example.com");
    expect(url.pathname).toBe("/app/citation-review");
    expect(reviewerLinkContext(Object.fromEntries(url.searchParams))).toEqual({
      mode: "reviewer",
      context: ctx,
    });
    expect(
      absoluteReviewerLink(ctx, "http://localhost:3000").href.startsWith(
        "http://localhost:3000/app/",
      ),
    ).toBe(true);
  });
  it("absoluteReviewerLink refuses a non-origin base (path/query/credentials/scheme) and falls back to the path", () => {
    const ctx = { ownerId: owner, projectId: "synergy_2026", findingRowId: rev };
    for (const bad of [
      null,
      undefined,
      "",
      "app.example.com",
      "https://app.example.com/base",
      "https://a:b@x.io",
      "javascript://x",
      "https://x.io/?q=1",
    ]) {
      const out = absoluteReviewerLink(ctx, bad);
      expect(out.absolute).toBe(false);
      expect(out.href).toBe(buildReviewerLink(ctx));
    }
  });
});

describe("reviewerFormReducer — the ACTUAL recovery transition the reviewer form runs", () => {
  const sha = "a".repeat(64);
  const run = (events: ReviewerFormEvent[], from: ReviewerFormState = initialReviewerForm) =>
    events.reduce(reviewerFormReducer, from);
  it("binds a pending decision + note to the inspected hash and clears them on a hash change or a mask", () => {
    const pending = run([
      { type: "view", currentSha: sha },
      { type: "decision", decision: "approved" },
      { type: "note", note: "looks right" },
    ]);
    expect(pending).toMatchObject({ pinnedSha: sha, decision: "approved", note: "looks right" });
    expect(run([{ type: "view", currentSha: sha }], pending)).toBe(pending); // same hash: untouched
    expect(run([{ type: "view", currentSha: "b".repeat(64) }], pending)).toMatchObject({
      decision: "",
      note: "",
    });
    expect(run([{ type: "view", currentSha: null }], pending)).toMatchObject({
      decision: "",
      note: "",
      pinnedSha: null,
    });
  });
  it("a citation_review_conflict at the SAME hash explicitly clears the selection — no blind resubmit", () => {
    const s = run([
      { type: "view", currentSha: sha },
      { type: "decision", decision: "rejected" },
      { type: "note", note: "disagree" },
      { type: "submit_start" },
      { type: "submit_failed", code: "citation_review_conflict" },
      // the finding is re-read at the UNCHANGED hash: the clear must survive it
      { type: "view", currentSha: sha },
    ]);
    expect(s).toMatchObject({
      busy: false,
      action: "refresh",
      decision: "",
      note: "",
      pinnedSha: sha,
    });
    expect(
      reviewSubmitGuard({
        record: {},
        recordSha256: sha,
        inspectionComplete: true,
        decision: s.decision,
        busy: s.busy,
      }),
    ).toEqual({
      allowed: false,
      reason: "choose",
    });
  });
  it("citation_review_stale clears the selection the same way; a non-stale failure keeps the selection and marks unavailable", () => {
    const base: ReviewerFormEvent[] = [
      { type: "view", currentSha: sha },
      { type: "decision", decision: "approved" },
      { type: "note", note: "n" },
      { type: "submit_start" },
    ];
    expect(run([...base, { type: "submit_failed", code: "citation_review_stale" }])).toMatchObject({
      action: "refresh",
      decision: "",
      note: "",
      busy: false,
    });
    expect(
      run([...base, { type: "submit_failed", code: "citation_finding_unavailable" }]),
    ).toMatchObject({
      action: null,
      denied: true,
      decision: "approved",
      busy: false,
    });
  });
  it("a refused (forbidden) submit sets a STICKY denial that no withdrawal start/failure/success clears", () => {
    const refused = run([
      { type: "view", currentSha: sha },
      { type: "decision", decision: "approved" },
      { type: "submit_start" },
      { type: "submit_failed", code: "citation_review_forbidden" },
    ]);
    expect(refused.denied).toBe(true);
    expect(reviewerSurfaceHidden({ viewIsError: false, form: refused })).toBe(true);
    const started = run([{ type: "withdraw_start" }], refused);
    expect(started).toMatchObject({ denied: true, busy: true });
    expect(run([{ type: "withdraw_failed" }], started)).toMatchObject({
      denied: true,
      withdraw: "failed",
    });
    expect(run([{ type: "withdraw_ok", id: "r1" }], started)).toMatchObject({
      denied: true,
      withdraw: "ok",
    });
    // A same-hash re-read, a stale result or a successful later submit do not clear it either.
    expect(
      run(
        [{ type: "view", currentSha: sha }, { type: "submit_start" }, { type: "submit_ok" }],
        refused,
      ).denied,
    ).toBe(true);
    // Stale/conflict is NOT a denial: the finding stays visible and only the selection is cleared.
    const stale = run([
      { type: "view", currentSha: sha },
      { type: "decision", decision: "rejected" },
      { type: "submit_start" },
      { type: "submit_failed", code: "citation_review_stale" },
    ]);
    expect(stale.denied).toBe(false);
    expect(reviewerSurfaceHidden({ viewIsError: false, form: stale })).toBe(false);
    expect(reviewerSurfaceHidden({ viewIsError: true, form: initialReviewerForm })).toBe(true);
  });
  it("ignores decision/note edits while a mutation is in flight and clears the form on success", () => {
    const inFlight = run([
      { type: "view", currentSha: sha },
      { type: "decision", decision: "approved" },
      { type: "submit_start" },
      { type: "decision", decision: "rejected" },
      { type: "note", note: "late" },
    ]);
    expect(inFlight).toMatchObject({ busy: true, decision: "approved", note: "" });
    expect(run([{ type: "submit_ok" }], inFlight)).toMatchObject({
      busy: false,
      decision: "",
      note: "",
      action: null,
    });
  });
  it("remembers a locally withdrawn receipt so an unrefreshable receipt page stops offering it", () => {
    const s = run([{ type: "withdraw_start" }, { type: "withdraw_ok", id: "r1" }]);
    expect(s).toMatchObject({ busy: false, withdraw: "ok", withdrawnIds: ["r1"] });
    const page = [
      { id: "r0", mine: false, withdrawn: false },
      { id: "r1", mine: true, withdrawn: false },
    ];
    expect(ownActiveReceipt(page, s.withdrawnIds)).toBeNull();
    expect(ownActiveReceipt(page, [])?.id).toBe("r1");
    expect(ownActiveReceipt([{ id: "r2", mine: true, withdrawn: true }], [])).toBeNull();
    expect(ownActiveReceipt(undefined, [])).toBeNull();
    expect(run([{ type: "withdraw_start" }, { type: "withdraw_failed" }], s)).toMatchObject({
      busy: false,
      withdraw: "failed",
    });
  });
  it("canSubmitReview refuses the submit while a read is in flight even when the guard allows it", () => {
    const guard = reviewSubmitGuard({
      record: {},
      recordSha256: sha,
      inspectionComplete: true,
      decision: "approved",
      busy: false,
    });
    expect(guard.allowed).toBe(true);
    expect(canSubmitReview({ guard, fetching: true })).toBe(false);
    expect(canSubmitReview({ guard, fetching: false })).toBe(true);
    expect(canSubmitReview({ guard: { allowed: false, reason: "choose" }, fetching: false })).toBe(
      false,
    );
  });
});

describe("per-mount exposure gate — material only after THIS mount's own successful read", () => {
  const form = initialReviewerForm;
  it("exposes nothing on data presence alone (pending/in-flight/placeholder), only on success", () => {
    expect(reviewerMaterialExposed({ viewIsSuccess: false, viewIsError: false, form })).toBe(false);
    expect(reviewerMaterialExposed({ viewIsSuccess: true, viewIsError: false, form })).toBe(true);
  });
  it("hides again on a background failure (revocation) and never while denied", () => {
    expect(reviewerMaterialExposed({ viewIsSuccess: false, viewIsError: true, form })).toBe(false);
    expect(
      reviewerMaterialExposed({
        viewIsSuccess: true,
        viewIsError: false,
        form: { ...form, denied: true },
      }),
    ).toBe(false);
  });
  it("mount tokens are unique per call and scope BOTH query keys behind the actor/owner/project/finding scope", () => {
    const a = newReviewerMountToken();
    const b = newReviewerMountToken();
    expect(a).not.toBe(b);
    const target = { ownerId: owner, projectId: "synergy_2026", findingRowId: rev };
    const keys = reviewerQueryKeys(edt, target, a);
    expect(keys.view).toEqual(["citation-for-review", edt, owner, "synergy_2026", rev, a]);
    expect(keys.reviews).toEqual(["citation-reviews", edt, owner, "synergy_2026", rev, a]);
    expect(reviewerQueryKeys(edt, target, b).view).not.toEqual(keys.view);
  });
});

describe("accuracyEntryDisplay — rendered status comes from the real contract fields", () => {
  it("shows the recorded human judgement and the live resolution as distinct values (no `status` field exists)", () => {
    const entry: CitationAccuracyResolution = {
      claimSpan: "Open until 20:00 on weekdays",
      factKind: "opening_hours",
      humanStatus: "accurate_at_capture",
      factId: "00000000-0000-4000-8000-0000000000f1",
      factVersion: 2,
      factRowId: "00000000-0000-4000-8000-0000000000f2",
      captureEvidenceId: "00000000-0000-4000-8000-0000000000e1",
      capturedAt: "2026-09-01T10:00:00.000000Z",
      resolution: "superseded_correction",
    };
    expect(accuracyEntryDisplay(entry)).toEqual({
      claim: "Open until 20:00 on weekdays",
      factKind: "opening_hours",
      humanStatus: "accurate_at_capture",
      resolution: "superseded_correction",
      capturedOn: "2026-09-01",
    });
    expect(
      accuracyEntryDisplay({ ...entry, capturedAt: null, resolution: "capture_unresolved" })
        .capturedOn,
    ).toBeNull();
    expect("status" in entry).toBe(false);
  });
});

describe("reviewSubmitGuard — no default approval, no approval of unseen/uninspectable/masked evidence", () => {
  const base = {
    record: {},
    recordSha256: "a".repeat(64),
    inspectionComplete: true,
    busy: false,
  };
  it("blocks until a decision is explicitly chosen (no default approved)", () => {
    expect(reviewSubmitGuard({ ...base, decision: "" })).toEqual({
      allowed: false,
      reason: "choose",
    });
  });
  it("allows an approval only on a fully-inspected, visible finding", () => {
    expect(reviewSubmitGuard({ ...base, decision: "approved" })).toEqual({ allowed: true });
  });
  it("blocks an approval when the live inspection is incomplete, but allows an opinion/dissent", () => {
    expect(reviewSubmitGuard({ ...base, inspectionComplete: false, decision: "approved" })).toEqual(
      {
        allowed: false,
        reason: "uninspectable",
      },
    );
    expect(reviewSubmitGuard({ ...base, inspectionComplete: false, decision: "rejected" })).toEqual(
      {
        allowed: true,
      },
    );
  });
  it("blocks EVERY decision on a masked finding and while busy", () => {
    expect(reviewSubmitGuard({ ...base, record: null, decision: "rejected" })).toEqual({
      allowed: false,
      reason: "withheld",
    });
    expect(reviewSubmitGuard({ ...base, recordSha256: null, decision: "approved" })).toEqual({
      allowed: false,
      reason: "withheld",
    });
    expect(reviewSubmitGuard({ ...base, busy: true, decision: "rejected" })).toEqual({
      allowed: false,
      reason: "busy",
    });
  });
});

describe("masked / stale-conflict / pinned-version helpers", () => {
  it("treats a null record or null hash as masked", () => {
    expect(reviewRecordMasked({ record: null, recordSha256: "a".repeat(64) })).toBe(true);
    expect(reviewRecordMasked({ record: {}, recordSha256: null })).toBe(true);
    expect(reviewRecordMasked({ record: {}, recordSha256: "a".repeat(64) })).toBe(false);
  });
  it("maps a stale/conflict pin to REFRESH (not blind retry) and anything else to unavailable", () => {
    expect(isStaleConflict("citation_review_stale")).toBe(true);
    expect(isStaleConflict("citation_review_conflict")).toBe(true);
    expect(isStaleConflict("citation_review_forbidden")).toBe(false);
    expect(reviewErrorAction("citation_review_stale")).toBe("refresh");
    expect(reviewErrorAction("citation_finding_unavailable")).toBe("unavailable");
  });
  it("invalidates a decision pinned to a changed/absent hash (selected version changed or now masked)", () => {
    const sha = "a".repeat(64);
    expect(pendingDecisionInvalidated(sha, sha)).toBe(false);
    expect(pendingDecisionInvalidated(sha, "b".repeat(64))).toBe(true);
    expect(pendingDecisionInvalidated(sha, null)).toBe(true);
    expect(pendingDecisionInvalidated(null, sha)).toBe(true);
  });
});
