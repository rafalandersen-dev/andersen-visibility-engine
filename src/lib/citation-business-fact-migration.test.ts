import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  getCitationBusinessFact,
  readCitationBusinessFacts,
  readCitationFindingAccuracy,
  removeCitationBusinessFact,
  saveCitationBusinessFact,
} from "./citation-business-fact.server";
import {
  getCitationFinding,
  readCitationFindings,
  saveCitationFinding,
} from "./citation-record.server";
import { importAnswerEvidence, saveEvidencePrompt } from "./answer-evidence.server";
import type { KnowledgeRpc } from "./project-knowledge.server";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { ownerId: user, projectId: "p" };
// Answer-evidence ids are assigned by the RELEASED service (importAnswerEvidence) each beforeEach, so a
// green test reflects the real saved shape (capturedAt at document.input.capturedAt), not an invented one.
let ANSWER: string; // saved answer evidence, capturedAt = CAP_IN
let ANSWER2: string; // saved answer evidence, capturedAt = CAP_AFTER
const PROMPT = "20000000-0000-4000-8000-000000000001";
const FACT = "a0000000-0000-4000-8000-000000000001";
const FACT2 = "a0000000-0000-4000-8000-000000000002";
const now = "2026-09-19T12:00:00Z";
// Business validity/capture instants are fixed PAST calendar times (well before this 2026 project so the
// released answer-evidence contract accepts capturedAt <= now); fact validity is interval-only, never
// compared to the runner wall clock.
const T0 = "2024-01-01T00:00:00Z";
const T1 = "2024-06-01T00:00:00Z";
const CAP_IN = "2024-03-01T00:00:00Z"; // within [T0, T1)
const CAP_AFTER = "2024-08-01T00:00:00Z"; // >= T1
const promptData = {
  prompt: "Where can I book a massage in Malmö?",
  intent: "discovery",
  source: "manual" as const,
  market: "Sweden",
  language: "sv-SE",
  brand: "Acme Massage",
  websiteUrl: "https://acme.example.com/",
  competitorUrls: [] as string[],
  active: true,
};
const answerInput = (capturedAt: string, rawAnswer: string) => ({
  promptId: PROMPT,
  promptRevision: 1,
  surface: "ChatGPT web",
  mode: "search" as const,
  method: "manual consumer session",
  modelVersion: null,
  capturedAt,
  status: "complete" as const,
  rawAnswer,
  citations: [] as string[],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
});
const panelScope = {
  panelId: "40000000-0000-4000-8000-000000000001",
  panelVersion: 1,
  client: { name: "Acme", market: "US" },
};
const rpc: KnowledgeRpc = async (name, args) => {
  try {
    const keys = Object.keys(args);
    const result = await db.query<{ data: unknown }>(
      `SELECT public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) data`,
      Object.values(args),
    );
    return { data: result.rows[0].data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
const fact = (
  factId: string,
  opts: {
    kind?: string;
    value?: string;
    validFrom?: string;
    validUntil?: string | null;
    confirmedBy?: string;
    confirmedAt?: string;
  } = {},
) => ({
  factId,
  kind: opts.kind ?? "price",
  value: opts.value ?? "500 SEK / 60 min",
  confirmedBy: opts.confirmedBy ?? user,
  confirmedAt: opts.confirmedAt ?? "2026-01-02T00:00:00Z",
  validFrom: opts.validFrom ?? T0,
  validUntil: opts.validUntil === undefined ? T1 : opts.validUntil,
});
const saveFact = (f: unknown, s = scope) => saveCitationBusinessFact(s, { fact: f }, rpc);
const acc = (
  opts: {
    factKind?: string;
    status?: string;
    factId?: string | null;
    factVersion?: number | null;
    factRowId?: string | null;
    captureEvidenceId?: string | null;
  } = {},
) => ({
  claimSpan: "The price is 500 SEK for 60 minutes.",
  factKind: opts.factKind ?? "price",
  status: opts.status ?? "accurate_at_capture",
  factId: opts.factId ?? null,
  factVersion: opts.factVersion ?? null,
  factRowId: opts.factRowId ?? null,
  captureEvidenceId: opts.captureEvidenceId ?? ANSWER,
  review: { reviewer: user, reviewedAt: now },
});
// A pinned assessed entry against a saved fact `f` and a bound answer-evidence capture reference.
const accFor = (f: { id: string; version: number }, captureEvidenceId = ANSWER, factId = FACT) =>
  acc({ factId, factVersion: f.version, factRowId: f.id, captureEvidenceId });
const accFinding = (findingId: string, entries: unknown[], answerIds: string[] = [ANSWER]) => ({
  findingId,
  family: "recommendation_accuracy" as const,
  evidence: answerIds.map((id) => ({ kind: "answer" as const, id })),
  entityMatch: "confirmed" as const,
  capture: { answerComplete: true, citationsComplete: true },
  observation: "The answer states a price that must be checked against dated facts.",
  hypothesis: null,
  competitorCited: null,
  ownCited: null,
  recommendation: null,
  support: [],
  accuracy: entries,
  priority: {
    harm: "medium" as const,
    relevance: "medium" as const,
    fixability: "medium" as const,
  },
  decision: "needs_second_review" as const,
  review: { reviewer: user, reviewedAt: now },
  secondReview: null,
  linkedTaskId: null,
});
const saveAccFinding = async (
  findingId: string,
  entries: unknown[],
  answerIds: string[] = [ANSWER],
) =>
  saveCitationFinding(
    scope,
    { scope: panelScope, finding: accFinding(findingId, entries, answerIds) },
    rpc,
  );
const resolutions = async (findingRowId: string) =>
  (await readCitationFindingAccuracy(scope, findingRowId, rpc)).entries.map((e) => e.resolution);
// Import a REAL answer-evidence row through the released service so the stored document has the actual
// shape ({ input: { capturedAt, ... }, prompt, analysis }); returns the server-assigned id.
const importReal = (capturedAt: string, rawAnswer: string) =>
  importAnswerEvidence(scope, answerInput(capturedAt, rawAnswer), rpc);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
    "20260910200000_publication_evidence.sql",
    "20260910210000_answer_evidence.sql",
    "20260919165000_native_report_artifacts.sql",
    "20260920200000_citation_findings_improvements.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;");
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2) ON CONFLICT DO NOTHING", [
    user,
    other,
  ]);
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($1,'projects','q'),($2,'projects','p')",
    [user, other],
  );
  await saveEvidencePrompt(scope, PROMPT, 0, promptData, rpc);
  ANSWER = await importReal(CAP_IN, "Acme Massage in Malmö is a good option to book.");
  ANSWER2 = await importReal(CAP_AFTER, "Acme Massage in Malmö is worth comparing this summer.");
});
afterAll(async () => {
  await db?.close();
});
describe("dated business facts: server-derived confirmation, declared validity, private scope", () => {
  it("stores a fact with server-stamped confirmedBy/confirmedAt and exports it in full", async () => {
    const saved = await saveFact(fact(FACT));
    expect(saved).toMatchObject({ version: 1, predecessorDeleted: false });
    expect(saved.record.confirmedBy).toBe(user);
    expect(Number.isNaN(Date.parse(saved.record.confirmedAt))).toBe(false);
    const listed = await readCitationBusinessFacts(scope, rpc);
    expect(listed.facts.map((f) => f.id)).toEqual([saved.id]);
    expect((await getCitationBusinessFact(scope, saved.id, rpc)).record.value).toBe(
      "500 SEK / 60 min",
    );
  });
  it("refuses a forged confirmer (confirmedBy other than the authenticated owner)", async () => {
    await expect(saveFact(fact(FACT, { confirmedBy: other }))).rejects.toThrow();
  });
  describe("confirmedBy is matched case-insensitively (semantic UUID), forgeries still refused", () => {
    // A hex-LETTERED owner so an UPPERCASE confirmedBy is a real case difference (the all-digit `user` is
    // case-invariant). confirmedBy is compared by a case-fold on text (no uuid cast), and the STORED confirmedBy
    // is always the server-derived p_user (lowercase), never the submitted string.
    const letteredOwner = "a1b2c3d4-0000-4000-8000-00000000000a";
    beforeEach(async () => {
      await db.query("INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING", [
        letteredOwner,
      ]);
      await db.query("INSERT INTO workspace_meta(user_id) VALUES($1) ON CONFLICT DO NOTHING", [
        letteredOwner,
      ]);
      await db.query(
        "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p') ON CONFLICT DO NOTHING",
        [letteredOwner],
      );
    });
    it("accepts an UPPERCASE confirmedBy that is the owner's own UUID", async () => {
      const saved = await saveCitationBusinessFact(
        { ownerId: letteredOwner, projectId: "p" },
        { fact: fact(FACT, { confirmedBy: letteredOwner.toUpperCase() }) },
        rpc,
      );
      // Accepted (not a confirmer mismatch); the stored confirmer is the server-derived owner (lowercase).
      expect(saved.record.confirmedBy).toBe(letteredOwner);
    });
    it("still refuses a foreign confirmer and fails closed on a malformed non-uuid (no unsafe cast)", async () => {
      await expect(
        saveCitationBusinessFact(
          { ownerId: letteredOwner, projectId: "p" },
          { fact: fact(FACT2, { confirmedBy: user }) },
          rpc,
        ),
      ).rejects.toThrow();
      // Straight to the RPC (bypassing the client uuid schema): a non-uuid confirmedBy is a controlled
      // case-fold mismatch, never a uuid-cast crash, and stores nothing.
      const r = await rpc("save_ai_citation_business_fact", {
        p_user: letteredOwner,
        p_project: "p",
        p_record: { ...fact(FACT2), confirmedBy: "NOT-a-uuid" },
      });
      expect(r.error).toBeTruthy();
    });
  });
  it("ignores a submitted confirmedAt: identical content re-saves idempotently to the same version", async () => {
    const v1 = await saveFact(fact(FACT, { confirmedAt: "2020-01-01T00:00:00Z" }));
    const again = await saveFact(fact(FACT, { confirmedAt: "2099-01-01T00:00:00Z" }));
    expect(again.id).toBe(v1.id);
    expect(again.version).toBe(1);
    expect(again.record.confirmedAt).toBe(v1.record.confirmedAt); // first server stamp preserved
  });
  it("isolates facts by owner and project", async () => {
    await saveFact(fact(FACT));
    for (const foreign of [
      { ownerId: other, projectId: "p" },
      { ownerId: user, projectId: "q" },
    ])
      expect((await readCitationBusinessFacts(foreign, rpc)).facts).toEqual([]);
  });
});
describe("versioned facts preserve dated meaning; corrections are new versions", () => {
  it("supersedes on a value change and keeps the prior version immutable", async () => {
    const v1 = await saveFact(fact(FACT, { value: "500 SEK", validUntil: T1 }));
    const v2 = await saveFact(fact(FACT, { value: "600 SEK", validFrom: T1, validUntil: null }));
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    expect((await readCitationBusinessFacts(scope, rpc)).facts.length).toBe(2);
  });
});
describe("direct SQL malformed/null input is refused at the RPC boundary", () => {
  const raw = (record: unknown) =>
    rpc("save_ai_citation_business_fact", { p_user: user, p_project: "p", p_record: record });
  it("refuses null, a JSON array and an object missing required fields", async () => {
    expect((await raw(null)).error).not.toBeNull();
    expect((await raw([])).error).not.toBeNull();
    expect((await raw({ kind: "price" })).error).not.toBeNull();
  });
  it("refuses an invalid kind, an over-long value, a non-finite validFrom and a bad date", async () => {
    expect((await raw(fact(FACT, { kind: "bogus" }))).error).not.toBeNull();
    expect((await raw(fact(FACT, { value: "x".repeat(1001) }))).error).not.toBeNull();
    expect((await raw(fact(FACT, { validFrom: "infinity" }))).error).not.toBeNull();
    expect((await raw(fact(FACT, { validFrom: "not-a-date" }))).error).not.toBeNull();
  });
  it("refuses an unordered validity interval (validUntil <= validFrom) via the server path too", async () => {
    await expect(saveFact(fact(FACT, { validFrom: T1, validUntil: T0 }))).rejects.toThrow();
  });
  it("normalizes an accepted direct-SQL record to canonical strict keys so read-back round-trips", async () => {
    const r = await rpc("save_ai_citation_business_fact", {
      p_user: user,
      p_project: "p",
      p_record: {
        factId: FACT,
        kind: "price",
        value: "500 SEK",
        confirmedBy: user,
        confirmedAt: "2000-01-01T00:00:00Z",
        validFrom: "2026-01-01 00:00:00+00", // castable but non-canonical (space, no 'T'/'Z')
        validUntil: null,
        bogus: "server strips non-canonical extras",
      },
    });
    expect(r.error).toBeNull();
    // readCitationBusinessFacts parses each record via the strict businessFactSchema; a non-round-trip
    // record would throw here.
    const rec = (await readCitationBusinessFacts(scope, rpc)).facts[0].record as Record<
      string,
      unknown
    >;
    expect(rec.validFrom).toBe("2026-01-01T00:00:00.000000Z"); // canonical microsecond UTC
    expect(rec.validUntil).toBeNull();
    expect(rec.confirmedBy).toBe(user);
    expect("bogus" in rec).toBe(false);
  });
});
describe("validity precision and normalized-meaning idempotency", () => {
  it("is idempotent across equivalent timezone/precision representations (no fake correction version)", async () => {
    const v1 = await saveFact(fact(FACT, { validFrom: "2024-01-01T00:00:00Z", validUntil: null }));
    const same = await saveFact(
      fact(FACT, { validFrom: "2024-01-01T00:00:00+00:00", validUntil: null }),
    );
    expect(same.id).toBe(v1.id);
    expect(same.version).toBe(1);
    expect((await readCitationBusinessFacts(scope, rpc)).facts.length).toBe(1);
  });
  it("preserves a sub-second validity boundary at microsecond precision instead of collapsing the endpoints", async () => {
    const saved = await saveFact(
      fact(FACT, { validFrom: "2024-01-01T12:00:00.100Z", validUntil: "2024-01-01T12:00:00.900Z" }),
    );
    expect(saved.record.validFrom).toBe("2024-01-01T12:00:00.100000Z"); // canonical microsecond UTC
    expect(saved.record.validUntil).toBe("2024-01-01T12:00:00.900000Z");
    expect(saved.record.validFrom).not.toBe(saved.record.validUntil);
  });
  it("distinguishes sub-millisecond validity (…100100Z vs …100900Z), not one collapsed digest", async () => {
    const v1 = await saveFact(
      fact(FACT, { validFrom: "2024-01-01T12:00:00.100100Z", validUntil: null }),
    );
    const v2 = await saveFact(
      fact(FACT, { validFrom: "2024-01-01T12:00:00.100900Z", validUntil: null }),
    );
    expect(v2.version).toBe(2); // distinct meaning => a new version, not an idempotent collapse
    expect(v1.record.validFrom).toBe("2024-01-01T12:00:00.100100Z");
    expect(v2.record.validFrom).toBe("2024-01-01T12:00:00.100900Z");
  });
  it("refuses sub-microsecond precision (>6 fractional digits) rather than silently truncating it", async () => {
    // client boundary (TS refine)
    await expect(
      saveFact(fact(FACT, { validFrom: "2024-01-01T12:00:00.1234567Z" })),
    ).rejects.toThrow();
    // direct-SQL boundary (SQL guard)
    const r = await rpc("save_ai_citation_business_fact", {
      p_user: user,
      p_project: "p",
      p_record: {
        factId: FACT,
        kind: "price",
        value: "500 SEK",
        confirmedBy: user,
        confirmedAt: "2024-01-02T00:00:00Z",
        validFrom: "2024-01-01T12:00:00.1234567Z",
        validUntil: null,
      },
    });
    expect(r.error).not.toBeNull();
  });
});
describe("accuracy binds to the immutable fact ROW + saved capture time, recomputed on read", () => {
  it("resolves a claim to the pinned row valid at the bound capture, and preserves it after a later non-overlapping change", async () => {
    const f = await saveFact(fact(FACT, { value: "500 SEK", validFrom: T0, validUntil: T1 }));
    const finding = await saveAccFinding("60000000-0000-4000-8000-000000000001", [accFor(f)]);
    expect(await resolutions(finding.id)).toEqual(["resolved"]);
    // A later NON-overlapping price change [T1,∞) is a temporal change, not a correction of the instant.
    await saveFact(fact(FACT, { value: "600 SEK", validFrom: T1, validUntil: null }));
    expect(await resolutions(finding.id)).toEqual(["resolved"]);
  });
  it("reports superseded_correction when a NEWER version of the same fact overlaps the instant", async () => {
    const v1 = await saveFact(fact(FACT, { value: "500 SEK", validFrom: T0, validUntil: null }));
    const finding = await saveAccFinding("60000000-0000-4000-8000-000000000002", [accFor(v1)]);
    expect(await resolutions(finding.id)).toEqual(["resolved"]);
    // Correcting an error with an overlapping newer version must NOT leave the stale pin 'resolved'.
    await saveFact(fact(FACT, { value: "550 SEK", validFrom: T0, validUntil: null }));
    expect(await resolutions(finding.id)).toEqual(["superseded_correction"]);
  });
  it("reports ambiguous even when the conflicting other fact's HEAD later moves off the instant", async () => {
    const f = await saveFact(fact(FACT, { validFrom: T0, validUntil: null }));
    await saveFact(fact(FACT2, { validFrom: T0, validUntil: null })); // conflicts at CAP_IN
    const finding = await saveAccFinding("60000000-0000-4000-8000-000000000003", [accFor(f)]);
    expect(await resolutions(finding.id)).toEqual(["ambiguous"]);
    // A newer non-overlapping version of the OTHER fact must not hide the historical conflict.
    await saveFact(fact(FACT2, { validFrom: T1, validUntil: null }));
    expect(await resolutions(finding.id)).toEqual(["ambiguous"]);
  });
  it("reports out_of_period, wrong_kind, unpinned and not_assessed distinctly", async () => {
    const f = await saveFact(fact(FACT, { validFrom: T0, validUntil: T1 }));
    const finding = await saveAccFinding(
      "60000000-0000-4000-8000-000000000004",
      [
        accFor(f, ANSWER2), // bound capture is CAP_AFTER, outside [T0,T1)
        acc({ factKind: "hours", factId: FACT, factVersion: f.version, factRowId: f.id }),
        acc({ factId: FACT, factVersion: f.version, factRowId: null }), // no row pin
        acc({ status: "not_checked", factId: null }),
      ],
      [ANSWER, ANSWER2],
    );
    expect(await resolutions(finding.id)).toEqual([
      "out_of_period",
      "wrong_kind",
      "unpinned",
      "not_assessed",
    ]);
  });
  it("reports capture_unresolved for an unbound/native capture reference and after the bound answer is deleted", async () => {
    const f = await saveFact(fact(FACT, { validFrom: T0, validUntil: null }));
    // captureEvidenceId is a real answer but NOT one of this finding's evidence references.
    const unbound = await saveAccFinding("60000000-0000-4000-8000-000000000005", [
      accFor(f, ANSWER2),
    ]); // finding evidence is [ANSWER] only
    expect(await resolutions(unbound.id)).toEqual(["capture_unresolved"]);
    const bound = await saveAccFinding("60000000-0000-4000-8000-000000000006", [accFor(f)]);
    expect(await resolutions(bound.id)).toEqual(["resolved"]);
    await db.query("DELETE FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p' AND id=$2", [
      user,
      ANSWER,
    ]);
    expect(await resolutions(bound.id)).toEqual(["capture_unresolved"]);
  });
  it("resolves the capture evidence by SEMANTIC uuid regardless of case (both directions), unblocks inspection, and keeps malformed/unrelated fail-closed", async () => {
    const f = await saveFact(fact(FACT, { validFrom: T0, validUntil: null }));
    const UP = ANSWER.toUpperCase();
    // Direction A: lowercase evidence id, UPPERCASE captureEvidenceId — previously a spurious capture_unresolved.
    const a = await saveAccFinding(
      "60000000-0000-4000-8000-0000000000a1",
      [accFor(f, UP)],
      [ANSWER],
    );
    expect(await resolutions(a.id)).toEqual(["resolved"]);
    // Direction B: UPPERCASE evidence id, lowercase captureEvidenceId.
    const b = await saveAccFinding(
      "60000000-0000-4000-8000-0000000000a2",
      [accFor(f, ANSWER)],
      [UP],
    );
    expect(await resolutions(b.id)).toEqual(["resolved"]);
    // Completeness: the canonical inspectable predicate (which reuses this resolver) now counts the
    // case-mismatched finding complete — so it can reach owner_attested rather than being blocked.
    const rec = (
      await db.query<{ r: unknown }>("SELECT record r FROM ai_citation_findings WHERE id=$1", [
        a.id,
      ])
    ).rows[0].r;
    const insp = await db.query<{ ok: boolean }>(
      "SELECT citation_finding_inspectable($1,'p',$2::jsonb) ok",
      [user, JSON.stringify(rec)],
    );
    expect(insp.rows[0].ok).toBe(true);
    // Read-only: the resolver never rewrites the record or its hash.
    const stored = (
      await db.query<{ r: string; s: string }>(
        "SELECT record::text r, record_sha256 s FROM ai_citation_findings WHERE id=$1",
        [a.id],
      )
    ).rows[0];
    expect(stored.r).toContain("The price is 500 SEK for 60 minutes.");
    expect(stored.s).toMatch(/^[a-f0-9]{64}$/);
    // Fail-closed: an UNRELATED valid-uuid captureEvidenceId (not one of the finding's answers) stays unresolved.
    const unrel = await saveAccFinding(
      "60000000-0000-4000-8000-0000000000a3",
      [accFor(f, ANSWER2)],
      [ANSWER],
    );
    expect(await resolutions(unrel.id)).toEqual(["capture_unresolved"]);
    // Fail-closed / no crash: a NON-uuid answer evidence id compared via lower() stays unresolved (no cast error).
    const badEvidence = await saveAccFinding(
      "60000000-0000-4000-8000-0000000000a4",
      [accFor(f, ANSWER)],
      ["not-a-uuid-evidence-id"],
    );
    expect(await resolutions(badEvidence.id)).toEqual(["capture_unresolved"]);
  });
  it("pins the immutable ROW: deleting then recreating the same fact stays fact_missing (no numeric rebind)", async () => {
    const f = await saveFact(fact(FACT, { value: "500 SEK", validFrom: T0, validUntil: null }));
    const finding = await saveAccFinding("60000000-0000-4000-8000-000000000007", [accFor(f)]);
    expect(await resolutions(finding.id)).toEqual(["resolved"]);
    await removeCitationBusinessFact(scope, f.id, rpc); // deletes the only version
    const recreated = await saveFact(
      fact(FACT, { value: "500 SEK", validFrom: T0, validUntil: null }),
    );
    expect(recreated.version).toBe(1); // numeric version reused...
    expect(recreated.id).not.toBe(f.id); // ...but the immutable ROW id is new
    expect(await resolutions(finding.id)).toEqual(["fact_missing"]); // original never rebinds
  });
  it("downgrades the CANONICAL finding reads when a bound fact is deleted", async () => {
    const f = await saveFact(fact(FACT, { validFrom: T0, validUntil: null }));
    const finding = await saveAccFinding("60000000-0000-4000-8000-000000000008", [accFor(f)]);
    const listStatus = async () =>
      (await readCitationFindings(scope, rpc)).findings.find((r) => r.id === finding.id)
        ?.accuracyStatus;
    expect(await listStatus()).toBe("resolved");
    expect((await getCitationFinding(scope, finding.id, rpc)).accuracy[0].resolution).toBe(
      "resolved",
    );
    await removeCitationBusinessFact(scope, f.id, rpc);
    expect(await listStatus()).toBe("unresolved");
    const detail = await getCitationFinding(scope, finding.id, rpc);
    expect(detail.recordValid).toBe(true); // the finding record is well-formed; only its fact binding broke
    expect(detail.accuracyStatus).toBe("unresolved");
    expect(detail.accuracy[0].resolution).toBe("fact_missing");
    // The raw human declaration is preserved as history alongside the downgraded binding.
    expect(detail.accuracy[0].humanStatus).toBe("accurate_at_capture");
  });
  it("does NOT resolve a capture from a fake top-level document.capturedAt (real path is document.input)", async () => {
    const f = await saveFact(fact(FACT, { validFrom: T0, validUntil: null }));
    const fakeAnswer = "10000000-0000-4000-8000-0000000000ff";
    // A hand-built answer row with the capture date only at the (wrong) TOP level, not document.input.
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document) VALUES($1::uuid,'p',$2::uuid,$3::uuid,1,$4::text,jsonb_build_object('capturedAt',$5::text))",
      [user, fakeAnswer, PROMPT, "fake-doc-hash", CAP_IN],
    );
    const finding = await saveAccFinding(
      "60000000-0000-4000-8000-000000000009",
      [accFor(f, fakeAnswer)],
      [fakeAnswer],
    );
    expect(await resolutions(finding.id)).toEqual(["capture_unresolved"]);
  });
  it("keeps a malformed stored pin inspectable (unpinned) through the service reads, no whole-list crash", async () => {
    // A directly-inserted finding (bypassing the Zod save) whose accuracy entry has malformed pins.
    const fid = "60000000-0000-4000-8000-00000000000a";
    const record = {
      findingId: fid,
      family: "recommendation_accuracy",
      evidence: [{ kind: "answer", id: ANSWER }],
      entityMatch: "confirmed",
      capture: { answerComplete: true, citationsComplete: true },
      observation: "legacy row",
      hypothesis: null,
      competitorCited: null,
      ownCited: null,
      recommendation: null,
      support: [],
      accuracy: [
        {
          claimSpan: "x",
          factKind: "price",
          status: "accurate_at_capture",
          factId: "not-a-uuid",
          factVersion: 2.5,
          factRowId: "also-bad",
          captureEvidenceId: ANSWER,
          review: { reviewer: user, reviewedAt: now },
        },
      ],
      priority: { harm: "low", relevance: "low", fixability: "low" },
      decision: "needs_second_review",
      review: { reviewer: user, reviewedAt: now },
      secondReview: null,
      linkedTaskId: null,
    };
    await db.query(
      "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1::uuid,'p',$2::uuid,$2::uuid,1,'recommendation_accuracy','needs_second_review',$3::jsonb,$4::text,$5::uuid,1,'Acme','US',$1::uuid,$1::uuid)",
      [user, fid, JSON.stringify(record), "f".repeat(64), panelScope.panelId],
    );
    // The whole list read must not crash on the malformed entry.
    const listed = await readCitationFindings(scope, rpc);
    expect(listed.findings.find((r) => r.id === fid)?.accuracyStatus).toBe("unresolved");
    // The standalone accuracy read normalizes the malformed pins to null and reports explicit unpinned.
    const entries = (await readCitationFindingAccuracy(scope, fid, rpc)).entries;
    expect(entries[0]).toMatchObject({
      resolution: "unpinned",
      factId: null,
      factVersion: null,
      factRowId: null,
      humanStatus: "accurate_at_capture",
    });
    // getCitationFinding must NOT crash on the malformed record: it returns recordValid:false with the raw
    // record still inspectable (so the owner can review and delete it) and the resilient accuracy resolution.
    const detail = await getCitationFinding(scope, fid, rpc);
    expect(detail.accuracy[0].resolution).toBe("unpinned");
    expect(detail.accuracyStatus).toBe("unresolved");
    expect(detail.recordValid).toBe(false);
    // Discriminated narrowing: the raw record is inspectable (no unsafe cast).
    if (detail.recordValid === false) expect(detail.record.observation).toBe("legacy row");
  });
  it("refuses (does not crash) a detail whose raw record nests beyond the bounded depth", async () => {
    const fid = "60000000-0000-4000-8000-00000000000c";
    let deep: unknown = "leaf";
    for (let i = 0; i < 40; i++) deep = { a: deep }; // 40 levels > MAX_RAW_RECORD_DEPTH (32)
    const record = {
      findingId: fid,
      family: "recommendation_accuracy",
      evidence: [{ kind: "answer", id: ANSWER }],
      entityMatch: "confirmed",
      capture: { answerComplete: true, citationsComplete: true },
      observation: "deep",
      hypothesis: null,
      competitorCited: null,
      ownCited: null,
      recommendation: null,
      support: [],
      accuracy: [],
      priority: { harm: "low", relevance: "low", fixability: "low" },
      decision: "needs_second_review",
      review: { reviewer: user, reviewedAt: now },
      secondReview: null,
      linkedTaskId: null,
      deep,
    };
    await db.query(
      "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1::uuid,'p',$2::uuid,$2::uuid,1,'recommendation_accuracy','needs_second_review',$3::jsonb,$4::text,$5::uuid,1,'Acme','US',$1::uuid,$1::uuid)",
      [user, fid, JSON.stringify(record), "d".repeat(64), panelScope.panelId],
    );
    // The list stays resilient (no record parse); the detail refuses the over-deep raw record honestly
    // rather than returning fabricated/partial data — the owner can still delete it by id.
    expect(
      (await readCitationFindings(scope, rpc)).findings.find((r) => r.id === fid)?.accuracyStatus,
    ).toBe("none");
    await expect(getCitationFinding(scope, fid, rpc)).rejects.toThrow();
  });
  it("echoes a non-RFC (hex-but-not-.uuid) pin through the canonical reads without failing the schema", async () => {
    const fid = "60000000-0000-4000-8000-00000000000b";
    const nonRfc = "00000000-0000-0000-0000-000000000001"; // valid 8-4-4-4-12 hex; version nibble 0 is not RFC
    const record = {
      findingId: fid,
      family: "recommendation_accuracy",
      evidence: [{ kind: "answer", id: ANSWER }],
      entityMatch: "confirmed",
      capture: { answerComplete: true, citationsComplete: true },
      observation: "legacy non-RFC pin",
      hypothesis: null,
      competitorCited: null,
      ownCited: null,
      recommendation: null,
      support: [],
      accuracy: [
        {
          claimSpan: "x",
          factKind: "price",
          status: "accurate_at_capture",
          factId: nonRfc,
          factVersion: 1,
          factRowId: nonRfc,
          captureEvidenceId: ANSWER,
          review: { reviewer: user, reviewedAt: now },
        },
      ],
      priority: { harm: "low", relevance: "low", fixability: "low" },
      decision: "needs_second_review",
      review: { reviewer: user, reviewedAt: now },
      secondReview: null,
      linkedTaskId: null,
    };
    await db.query(
      "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1::uuid,'p',$2::uuid,$2::uuid,1,'recommendation_accuracy','needs_second_review',$3::jsonb,$4::text,$5::uuid,1,'Acme','US',$1::uuid,$1::uuid)",
      [user, fid, JSON.stringify(record), "e".repeat(64), panelScope.panelId],
    );
    // The read-only canonical schema accepts the non-RFC hex pin (no Zod crash); it points at no live fact.
    const entries = (await readCitationFindingAccuracy(scope, fid, rpc)).entries;
    expect(entries[0].factRowId).toBe(nonRfc);
    expect(entries[0].resolution).toBe("fact_missing");
  });
});
describe("tables and helpers are closed to client roles; only service RPCs are callable", () => {
  it("denies direct table access and the accuracy helper to every client role", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM ai_citation_business_facts")).rejects.toThrow(
        /permission denied/,
      );
      if (role !== "service_role")
        await expect(
          db.query("SELECT read_ai_citation_business_facts($1,'p')", [user]),
        ).rejects.toThrow(/permission denied/);
      else
        expect(
          (await db.query("SELECT read_ai_citation_business_facts($1,'p') data", [user])).rows[0],
        ).toEqual({ data: { facts: [] } });
      await db.exec("RESET ROLE");
    }
  });
});
