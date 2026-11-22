import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { stageNativeArtifact, removeNativeArtifact } from "./native-ai-artifact.server";
import {
  persistNativeReport,
  readNativeReportBinding,
  readNativeReportParsed,
} from "./native-google-intake.server";
import { saveCitationFinding, readCitationFindings } from "./citation-record.server";
import {
  getCitationFindingForReview,
  grantCitationReviewAssignment,
  grantCitationReviewNativeAssignment,
  readCitationFindingReviews,
  removeCitationFindingReview,
  revokeCitationReviewAssignment,
  saveCitationFindingReview,
} from "./citation-finding-review.server";
import { nativeConsentSetDigest } from "./citation-review-ui";
import { lockedPanelInsert, headVersionQuery, headToken } from "./citation-panel-fixture";
import type { KnowledgeRpc } from "./project-knowledge.server";
/**
 * Native-report finding review binding — the security matrix for the additive
 * 20261114120000_citation_native_review_binding migration, over the REAL citation review + team + parsed
 * artifact foundation (synthetic example.test CSV staged+parsed through the frozen server; no genuine
 * customer data). Covers the independent review findings NS01–NS06, NFTS-01/02 and deployment
 * compatibility. Runs the connection as the PGlite superuser, so internal predicates can be probed directly
 * (as the independent probe did) and the service RPCs are exercised through the real server helpers.
 */
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const reviewer = "00000000-0000-4000-8000-0000000000a1";
const stranger = "00000000-0000-4000-8000-0000000000a9";
const scope = { ownerId: user, projectId: "p" };
const now = "2026-09-19T12:00:00Z";
const panelScope = {
  panelId: "40000000-0000-4000-8000-000000000001",
  panelVersion: 1,
  client: { name: "Acme", market: "US" },
};
const chartCsv = "Date,Impressions\n2026-09-01,12\n2026-09-02,0\n";
const allUnknownCsv = "Date,Impressions\n2026-09-01,0\n2026-09-02,0\n";
const metadata = {
  source: "gsc_generative_ai_search" as const,
  declaredProperty: "https://example.test/",
  reportKind: "chart" as const,
  dimension: "date" as const,
  aggregation: "property" as const,
  period: { start: "2026-09-01", end: "2026-11-13", timezone: "America/Los_Angeles" },
  marketScope: { country: "SWE", exposed: true },
  filters: { "Search type": "Web (text-based)", Date: "Last 3 months", Country: "Sweden" },
  capturedAt: "2026-11-13T09:00:00Z",
  filename: "Chart.csv",
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
const setPolicy = (mode: string) =>
  db.query(
    "INSERT INTO project_team_approval_policy(owner_id,project_id,mode,revision) VALUES($1,'p',$2,1) ON CONFLICT(owner_id,project_id) DO UPDATE SET mode=$2,revision=project_team_approval_policy.revision+1",
    [user, mode],
  );
const setMember = (actor: string, role: string, active = true) =>
  db.query(
    "INSERT INTO project_team_members(owner_id,project_id,actor_id,role,revision,active) VALUES($1,'p',$2,$3,1,$4) ON CONFLICT(owner_id,project_id,actor_id) DO UPDATE SET role=$3,active=$4,expires_at=NULL,revision=project_team_members.revision+1",
    [user, actor, role, active],
  );
const stageCsv = async (csv: string) => {
  const base64 = Buffer.from(new TextEncoder().encode(csv)).toString("base64");
  return stageNativeArtifact(scope, { metadata, base64 }, rpc);
};
// Stage + parse a synthetic report, returning its id and the AUTHORITATIVE binding the owner embeds.
const stageParse = async (csv = chartCsv) => {
  const a = await stageCsv(csv);
  await persistNativeReport(scope, a.id, "partial", "", rpc);
  const b = await readNativeReportBinding(scope, a.id, rpc);
  return { id: a.id, binding: b.binding! };
};
// Stage + parse through a CUSTOM declared metadata (other source/file types), returning the stored parsed.
const stageParseMeta = async (meta: unknown, csv: string, completeness = "partial") => {
  const a = await stageNativeArtifact(
    scope,
    { metadata: meta, base64: Buffer.from(new TextEncoder().encode(csv)).toString("base64") },
    rpc,
  );
  await persistNativeReport(scope, a.id, completeness, "", rpc);
  return (
    await db.query<{ p: unknown }>(
      "SELECT parsed p FROM public.ai_native_report_artifacts WHERE id=$1::uuid",
      [a.id],
    )
  ).rows[0].p;
};
const bingMeta = (dimension: "date" | "page", filename: string) => ({
  source: "bing_ai_performance" as const,
  declaredProperty: "https://example.test/",
  reportKind: "table" as const,
  dimension,
  aggregation: dimension === "date" ? ("property" as const) : ("page" as const),
  period: { start: "2026-08-01", end: "2026-08-31", timezone: null },
  marketScope: { country: null, exposed: false },
  filters: {},
  capturedAt: "2026-11-13T09:00:00Z",
  filename,
});
const googlePagesMeta = {
  ...metadata,
  reportKind: "table" as const,
  dimension: "page" as const,
  aggregation: "page" as const,
  marketScope: { country: null, exposed: false },
  filters: {},
  filename: "Pages.csv",
};
type NativeRef = { kind: "native"; id: string; nativeBinding?: unknown };
const nativeOnly = (
  findingId: string,
  natives: NativeRef[],
  decision: "accepted" | "dismissed" | "needs_second_review" = "needs_second_review",
) => ({
  findingId,
  family: "citation_source" as const,
  evidence: natives,
  entityMatch: "confirmed" as const,
  capture: { answerComplete: false, citationsComplete: false },
  observation: "Our pages appear in the native AI citations export.",
  hypothesis: null,
  competitorCited: null,
  ownCited: null,
  recommendation: null,
  support: [],
  accuracy: [],
  priority: {
    harm: "medium" as const,
    relevance: "medium" as const,
    fixability: "medium" as const,
  },
  decision,
  review: { reviewer: user, reviewedAt: now },
  secondReview: null,
  linkedTaskId: null,
});
const saveNative = async (
  findingId: string,
  natives: NativeRef[],
  decision: "accepted" | "dismissed" | "needs_second_review" = "needs_second_review",
) => {
  const head = (
    await db.query<{ v: number; id: string | null }>(
      ...headVersionQuery("ai_citation_findings", user, "p", findingId),
    )
  ).rows[0];
  return saveCitationFinding(
    scope,
    { scope: panelScope, finding: nativeOnly(findingId, natives, decision), ...headToken(head) },
    rpc,
  );
};
const bound = (id: string, binding: unknown): NativeRef => ({
  kind: "native",
  id,
  nativeBinding: binding,
});
const bare = (id: string): NativeRef => ({ kind: "native", id });
const viewV2 = (rowId: string, actor = reviewer) =>
  getCitationFindingForReview(actor, { ownerId: user, projectId: "p", findingRowId: rowId }, rpc);
const setDigestSql = async (rowId: string) =>
  (
    await db.query<{ d: string | null }>(
      "SELECT public.citation_review_native_set_digest($1::uuid,'p',record) d FROM public.ai_citation_findings WHERE user_id=$1 AND project_id='p' AND id=$2::uuid",
      [user, rowId],
    )
  ).rows[0].d;
const supported = async (parsed: unknown) =>
  (
    await db.query<{ ok: boolean }>(
      "SELECT public.citation_native_parsed_supported($1::jsonb) ok",
      [JSON.stringify(parsed)],
    )
  ).rows[0].ok;
const funcPriv = async (role: string, fn: string) =>
  (await db.query<{ ok: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') ok", [role, fn]))
    .rows[0].ok;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;" +
      "CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);" +
      "CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);" +
      "CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2),($3)", [user, reviewer, stranger]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1)", [user]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
    "20260910200000_publication_evidence.sql",
    "20260910210000_answer_evidence.sql",
    "20260919165000_native_report_artifacts.sql",
    "20260920190000_citation_protocol.sql",
    "20260920200000_citation_findings_improvements.sql",
    "20260911020000_project_team_reads.sql",
    "20260911060000_project_team_approval_policy.sql",
    "20260926190000_citation_scope_binding_versions.sql",
    "20260927190000_citation_improvement_head_guard.sql",
    "20260928120000_citation_change_evidence.sql",
    // Released parsed-interpretation persistence BEFORE the new candidate (deployment ordering).
    "20261113120000_native_report_parsed_interpretation.sql",
    // The candidate under test.
    "20261114120000_citation_native_review_binding.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  // Unrelated released invalidation trigger writes this out-of-tree table; a harmless empty stand-in.
  await db.exec(
    "CREATE TABLE public.scheduled_publishes(user_id uuid NOT NULL,project_id text NOT NULL,asset_id text NOT NULL,status text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());",
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    // Reset native artifacts per test so an artifact is NEVER reused across tests (same CSV bytes + metadata
    // dedup to one row by design); each test stages a fresh, genuinely UNPARSED artifact.
    "RESET ROLE;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;TRUNCATE workspace_entities CASCADE;TRUNCATE public.project_team_approval_policy;TRUNCATE public.ai_native_report_artifacts CASCADE;TRUNCATE public.ai_citation_native_erasures;",
  );
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1) ON CONFLICT DO NOTHING", [user]);
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p')",
    [user],
  );
  await db.query(
    ...lockedPanelInsert({
      userId: user,
      projectId: "p",
      panelId: panelScope.panelId,
      version: 1,
      client: panelScope.client,
    }),
  );
  await setPolicy("separate_reviewers");
  await setMember(reviewer, "reviewer");
});
afterAll(async () => {
  await db?.close();
});

describe("deployment compatibility: frozen native parsed RPC shapes survive the migration", () => {
  const FROZEN = ["id", "parseState", "parsed", "parsedAt", "parsedActorId"].sort();
  it("read/persist keep exactly the 5-key response for unparsed and parsed artifacts", async () => {
    const a = await stageCsv(chartCsv);
    expect(Object.keys(await readNativeReportParsed(scope, a.id, rpc)).sort()).toEqual(FROZEN);
    const saved = await persistNativeReport(scope, a.id, "partial", "", rpc);
    expect(Object.keys(saved).sort()).toEqual(FROZEN);
    expect(Object.keys(await readNativeReportParsed(scope, a.id, rpc)).sort()).toEqual(FROZEN);
  });
});

describe("NS01: central parsed-material validation rejects every malformed/unsupported interpretation", () => {
  it("accepts a genuine report and an all-unknown report; rejects the 8 invalids", async () => {
    const a = await stageParse(chartCsv);
    const genuine = (
      await db.query<{ p: unknown }>(
        "SELECT parsed p FROM public.ai_native_report_artifacts WHERE id=$1::uuid",
        [a.id],
      )
    ).rows[0].p as Record<string, unknown> & { input: Record<string, unknown> };
    expect(await supported(genuine)).toBe(true);
    const unk = await stageParse(allUnknownCsv);
    const allUnknown = (
      await db.query<{ p: unknown }>(
        "SELECT parsed p FROM public.ai_native_report_artifacts WHERE id=$1::uuid",
        [unk.id],
      )
    ).rows[0].p;
    expect(await supported(allUnknown)).toBe(true); // intact all-unknown is inspectable material
    const input = genuine.input as Record<string, unknown>;
    const withInput = (patch: Record<string, unknown>) => ({
      ...genuine,
      input: { ...input, ...patch },
    });
    expect(await supported({ ...genuine, input: { ...input, rows: undefined } })).toBe(false); // missing rows (NULL-safe)
    expect(await supported(withInput({ rows: [] }))).toBe(false); // empty
    expect(await supported({ ...genuine, parserVersion: "native-unknown-v9" })).toBe(false); // unsupported parser
    expect(await supported(withInput({ source: "other_source" }))).toBe(false); // unsupported source
    expect(await supported({ ...genuine, parserVersion: "native-bing-ai-csv-v1" })).toBe(false); // wrong pair
    expect(await supported(withInput({ rows: [{ notARow: 1 }] }))).toBe(false); // malformed row
    expect(
      await supported(
        withInput({ rows: Array.from({ length: 5001 }, () => (input.rows as unknown[])[0]) }),
      ),
    ).toBe(false); // over-bound
    expect(await supported({ ...genuine, file: "nope" })).toBe(false); // unsupported file kind
  });
  it("positive controls across both sources + file shapes do NOT over-reject", async () => {
    // Google chart (date) + pages (page) exercise the two Google descriptor shapes; Bing overview (2
    // metrics, date coverage, whole-count) + pages (1 metric) exercise the Bing-specific paths.
    expect(
      await supported(
        (
          await db.query<{ p: unknown }>(
            "SELECT parsed p FROM public.ai_native_report_artifacts WHERE id=$1::uuid",
            [(await stageParse(chartCsv)).id],
          )
        ).rows[0].p,
      ),
    ).toBe(true);
    expect(
      await supported(
        await stageParseMeta(googlePagesMeta, "Top pages,Impressions\nhttps://example.test/a,5\n"),
      ),
    ).toBe(true);
    expect(
      await supported(
        await stageParseMeta(
          bingMeta("date", "Overview.csv"),
          "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/14/2026 12:00:00 AM,3,2\n",
        ),
      ),
    ).toBe(true);
    expect(
      await supported(
        await stageParseMeta(
          bingMeta("page", "Pages.csv"),
          "Page,Citations\nhttps://example.test/a,2\n",
        ),
      ),
    ).toBe(true);
  });
});

describe("NS01/NS06: binding read is authoritative, coherent, and withholds unsupported/tombstoned", () => {
  it("is null until parsed, then the live binding; null again for a tombstoned (deleted) artifact", async () => {
    // A DISTINCT synthetic CSV so this artifact is independent of any other test's bytes (no dedup), and
    // assert it is genuinely UNPARSED before exercising the parsed→binding transition.
    const a = await stageCsv("Date,Impressions\n2026-09-03,7\n2026-09-04,0\n");
    expect((await readNativeReportParsed(scope, a.id, rpc)).parseState).toBe("unparsed");
    expect((await readNativeReportBinding(scope, a.id, rpc)).binding).toBeNull();
    await persistNativeReport(scope, a.id, "partial", "", rpc);
    const b = await readNativeReportBinding(scope, a.id, rpc);
    expect(b.binding).toMatchObject({
      source: "gsc_generative_ai_search",
      parserVersion: "native-google-ai-csv-v1",
    });
    await removeNativeArtifact(scope, a.id, rpc); // delete -> native erasure tombstone
    await expect(readNativeReportBinding(scope, a.id, rpc)).rejects.toThrow(); // artifact row gone
  });
});

describe("NS02: the finding save trigger authoritatively validates bound natives; bare refs preserved", () => {
  it("rejects a forged/unparsed/foreign bound native, accepts a genuine binding and a bare legacy ref", async () => {
    const a = await stageParse();
    // Genuine binding saves.
    const ok = await saveNative("60000000-0000-4000-8000-000000000001", [bound(a.id, a.binding)]);
    expect(ok.version).toBe(1);
    // A forged parsedSha256 is rejected at the trusted save boundary (trigger).
    await expect(
      saveNative("60000000-0000-4000-8000-000000000002", [
        bound(a.id, { ...a.binding, parsedSha256: "f".repeat(64) }),
      ]),
    ).rejects.toThrow();
    // A binding to a DISTINCT, still-UNPARSED artifact is rejected (fresh bytes avoid dedup to `a`).
    const u = await stageCsv("Date,Impressions\n2026-10-01,3\n2026-10-02,0\n");
    await expect(
      saveNative("60000000-0000-4000-8000-000000000003", [bound(u.id, a.binding)]),
    ).rejects.toThrow();
    // A BARE legacy native ref (no binding) is preserved and saved — never auto-promoted, never inspectable.
    const bareF = await saveNative("60000000-0000-4000-8000-000000000004", [bare(a.id)]);
    await grantCitationReviewAssignment(
      user,
      { projectId: "p", findingRowId: bareF.id, reviewerId: reviewer },
      rpc,
    );
    // Bare native-bearing finding without native consent: reviewer detail is withheld.
    await expect(viewV2(bareF.id)).rejects.toThrow();
  });
});

describe("NS03/NS04: the base detail RPC is internal-only; v2 gates after authority (no oracle)", () => {
  it("base read is not service-executable; v2 denies unauthorized before any native-existence signal", async () => {
    expect(
      await funcPriv(
        "service_role",
        "public.read_ai_citation_finding_for_review(uuid,uuid,text,uuid)",
      ),
    ).toBe(false);
    expect(
      await funcPriv(
        "service_role",
        "public.read_ai_citation_finding_for_review_v2(uuid,uuid,text,uuid)",
      ),
    ).toBe(true);
    const a = await stageParse();
    const f = await saveNative("60000000-0000-4000-8000-000000000011", [bound(a.id, a.binding)]);
    // A non-member stranger is refused by authority admission (not a native oracle); an absent row likewise.
    await expect(viewV2(f.id, stranger)).rejects.toThrow();
    await expect(viewV2("60000000-0000-4000-8000-0000000000ff", stranger)).rejects.toThrow();
  });
});

describe("positive control + consent lifecycle (NS05) + full material (NFTS-01/F)", () => {
  it("genuine new bound version + explicit full-set consent + fresh review completes inspection", async () => {
    const a = await stageParse();
    const f = await saveNative("60000000-0000-4000-8000-000000000021", [bound(a.id, a.binding)]);
    await grantCitationReviewAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer },
      rpc,
    );
    // Without native consent, the reviewer detail is withheld.
    await expect(viewV2(f.id)).rejects.toThrow();
    // The client full-set digest must equal the server's (collation/formula parity).
    const clientSha = await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]);
    expect(clientSha).toBe(await setDigestSql(f.id));
    await grantCitationReviewNativeAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: clientSha! },
      rpc,
    );
    const view = await viewV2(f.id);
    expect(view.inspectionComplete).toBe(true);
    const nat = view.evidence.find((e) => e.kind === "native");
    expect(nat).toMatchObject({ available: true, inspectable: true });
    // Full NativeReportParsedRecord under nativeMaterial — not a flattened projection, byte SIZE only.
    expect((nat as { nativeMaterial?: Record<string, unknown> }).nativeMaterial).toMatchObject({
      parserVersion: "native-google-ai-csv-v1",
      artifactSha256: a.binding.rawSha256,
    });
    const receipt = await saveCitationFindingReview(
      reviewer,
      {
        projectId: "p",
        ownerId: user,
        findingRowId: f.id,
        expectedSha: view.recordSha256!,
        decision: "approved",
        note: null,
      },
      rpc,
    );
    expect(receipt).toMatchObject({ decision: "approved", inspectionComplete: true });
  });
  it("a member remove+restore (authority revision bump) invalidates native consent until a fresh grant", async () => {
    const a = await stageParse();
    const f = await saveNative("60000000-0000-4000-8000-000000000022", [bound(a.id, a.binding)]);
    await grantCitationReviewAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer },
      rpc,
    );
    const sha = (await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]))!;
    await grantCitationReviewNativeAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
      rpc,
    );
    expect((await viewV2(f.id)).inspectionComplete).toBe(true);
    await setMember(reviewer, "reviewer", false); // remove (revision++)
    await setMember(reviewer, "reviewer", true); // restore (revision++ again) — eligibility returns
    // Generic eligibility is back, but the accepted authority epoch changed: native consent no longer holds.
    await expect(viewV2(f.id)).rejects.toThrow();
  });
  it("v2 grant -> revoke -> old 4-arg grant leaves native consent cleared (no resurrection)", async () => {
    const a = await stageParse();
    const f = await saveNative("60000000-0000-4000-8000-000000000023", [bound(a.id, a.binding)]);
    const sha = (await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]))!;
    await grantCitationReviewNativeAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
      rpc,
    );
    expect((await viewV2(f.id)).inspectionComplete).toBe(true);
    await revokeCitationReviewAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer },
      rpc,
    );
    await grantCitationReviewAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer },
      rpc,
    ); // old 4-arg
    await expect(viewV2(f.id)).rejects.toThrow(); // native consent cleared by the old grant
  });
});

describe("NS06: erased/tombstoned native cannot regain consent or material", () => {
  it("deleting a cited native withholds material and refuses a fresh native grant", async () => {
    const a = await stageParse();
    const f = await saveNative("60000000-0000-4000-8000-000000000031", [bound(a.id, a.binding)]);
    const sha = (await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]))!;
    await grantCitationReviewNativeAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
      rpc,
    );
    expect((await viewV2(f.id)).inspectionComplete).toBe(true);
    await removeNativeArtifact(scope, a.id, rpc); // delete -> finding evidence_erased + native tombstone
    // The finding is now erased: the reviewer detail is withheld (consent no longer resolves).
    await expect(viewV2(f.id)).rejects.toThrow();
    // A fresh native grant on the erased finding is refused.
    await expect(
      grantCitationReviewNativeAssignment(
        user,
        { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
        rpc,
      ),
    ).rejects.toThrow();
  });
});

describe("whole-set consent over TWO distinct native artifacts (NFTS set-digest lifecycle)", () => {
  const grantNative = (rowId: string, setSha: string) =>
    grantCitationReviewNativeAssignment(
      user,
      { projectId: "p", findingRowId: rowId, reviewerId: reviewer, nativeSetSha256: setSha },
      rpc,
    );
  it("is order-independent; subset/stale refused; an explicit successor preserves both bindings and needs its own consent; losing EITHER artifact invalidates consent", async () => {
    // Two genuinely distinct parsed artifacts (distinct bytes -> distinct parsed -> distinct digests).
    const a = await stageParse(chartCsv);
    const b = await stageParse("Date,Impressions\n2026-09-03,7\n2026-09-04,0\n");
    expect(a.binding.parsedSha256).not.toBe(b.binding.parsedSha256);
    const logical = "60000000-0000-4000-8000-000000000041";
    const f = await saveNative(logical, [bound(a.id, a.binding), bound(b.id, b.binding)]);
    const server = await setDigestSql(f.id);
    // The canonical full-set digest is order-independent and equals the server's over BOTH items.
    const forward = await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
      { id: b.id, parsedSha256: b.binding.parsedSha256 },
    ]);
    const reversed = await nativeConsentSetDigest([
      { id: b.id, parsedSha256: b.binding.parsedSha256 },
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]);
    expect(forward).toBe(server);
    expect(reversed).toBe(server);
    // A SUBSET consent (only one artifact) and a STALE consent (one artifact's digest altered) are refused.
    const subset = (await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]))!;
    const stale = (await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
      { id: b.id, parsedSha256: "f".repeat(64) },
    ]))!;
    for (const s of [subset, stale]) await expect(grantNative(f.id, s)).rejects.toThrow();
    // The exact whole-set consent admits the reviewer; BOTH natives carry inspectable material.
    await grantNative(f.id, server!);
    const view = await viewV2(f.id);
    expect(view.inspectionComplete).toBe(true);
    expect(view.evidence.filter((e) => e.kind === "native" && e.inspectable)).toHaveLength(2);
    // EXPLICIT SUCCESSOR of the SAME logical finding (its expected head), preserving BOTH exact bindings. The
    // old version row is byte-identical, the prior consent does NOT carry to the new row, and the successor
    // needs its OWN fresh whole-set consent (over the same preserved set digest) before it is inspectable.
    const oldRow = (
      await db.query<{ rec: unknown; sha: string }>(
        "SELECT record rec, record_sha256 sha FROM public.ai_citation_findings WHERE user_id=$1 AND project_id='p' AND id=$2::uuid",
        [user, f.id],
      )
    ).rows[0];
    const succ = await saveNative(
      logical,
      [bound(a.id, a.binding), bound(b.id, b.binding)],
      "accepted",
    );
    expect(succ.id).not.toBe(f.id);
    expect(succ.version).toBeGreaterThan(1);
    expect(
      (
        await db.query(
          "SELECT record rec, record_sha256 sha FROM public.ai_citation_findings WHERE user_id=$1 AND project_id='p' AND id=$2::uuid",
          [user, f.id],
        )
      ).rows[0],
    ).toEqual(oldRow); // old version unchanged
    await expect(viewV2(succ.id)).rejects.toThrow(); // new row carries no consent yet
    const succServer = await setDigestSql(succ.id);
    expect(succServer).toBe(server); // both bindings preserved -> identical canonical set digest
    await grantNative(succ.id, succServer!);
    const succView = await viewV2(succ.id);
    expect(succView.inspectionComplete).toBe(true);
    expect(succView.evidence.filter((e) => e.kind === "native" && e.inspectable)).toHaveLength(2);
    // Losing EITHER artifact invalidates consent — proven for BOTH a (first) and b (second) on fresh pairs.
    const lossPairs = [
      [
        "60000000-0000-4000-8000-000000000042",
        "Date,Impressions\n2026-10-01,5\n2026-10-02,0\n",
        "Date,Impressions\n2026-10-11,6\n2026-10-12,0\n",
        0,
      ],
      [
        "60000000-0000-4000-8000-000000000043",
        "Date,Impressions\n2026-10-03,7\n2026-10-04,0\n",
        "Date,Impressions\n2026-10-13,8\n2026-10-14,0\n",
        1,
      ],
    ] as const;
    for (const [lid, csvX, csvY, victim] of lossPairs) {
      const x = await stageParse(csvX);
      const y = await stageParse(csvY);
      const lf = await saveNative(lid, [bound(x.id, x.binding), bound(y.id, y.binding)]);
      await grantNative(lf.id, (await setDigestSql(lf.id))!);
      expect((await viewV2(lf.id)).inspectionComplete).toBe(true);
      await removeNativeArtifact(scope, victim === 0 ? x.id : y.id, rpc);
      await expect(viewV2(lf.id)).rejects.toThrow();
    }
  });
});

describe("NS06: a deleted native cannot be revived by recreating the same id + material", () => {
  it("the tombstone blocks resolution even when identical scoped id/parsed material is reinserted", async () => {
    const a = await stageParse();
    const f = await saveNative("60000000-0000-4000-8000-000000000051", [bound(a.id, a.binding)]);
    const sha = (await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]))!;
    await grantCitationReviewNativeAssignment(
      user,
      { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
      rpc,
    );
    const view0 = await viewV2(f.id);
    expect(view0.inspectionComplete).toBe(true);
    // A GENUINE successful review bound to the finding's record sha, whose exact payload is retained so the
    // post-recreation retry below is the same successful submission, not a fresh/foreign one.
    const payload = {
      projectId: "p",
      ownerId: user,
      findingRowId: f.id,
      expectedSha: view0.recordSha256!,
      decision: "approved" as const,
      note: "reviewed the native export",
    };
    expect(
      ((await saveCitationFindingReview(reviewer, payload, rpc)) as { inspectionComplete: boolean })
        .inspectionComplete,
    ).toBe(true);
    // Capture the EXACT stored scope key / hash / metadata / parsed material, then delete (tombstone + erase).
    const keep = (
      await db.query<{ scope_key: string; sha: string; meta: unknown; parsed: unknown }>(
        "SELECT scope_key, artifact_sha256 sha, metadata meta, parsed FROM public.ai_native_report_artifacts WHERE id=$1::uuid",
        [a.id],
      )
    ).rows[0];
    await removeNativeArtifact(scope, a.id, rpc);
    // Recreate the IDENTICAL scoped id + parsed material synthetically (a delete-and-recreate attempt).
    await db.query(
      "INSERT INTO public.ai_native_report_artifacts(user_id,project_id,id,scope_key,artifact_sha256,byte_length,bytes,metadata,actor_id,parsed,parsed_at,parsed_actor_id) VALUES($1::uuid,'p',$2::uuid,$3,$4,1,'\\x00'::bytea,$5::jsonb,$1::uuid,$6::jsonb,clock_timestamp(),$1::uuid)",
      [
        user,
        a.id,
        keep.scope_key,
        keep.sha,
        JSON.stringify(keep.meta),
        JSON.stringify(keep.parsed),
      ],
    );
    // The binding no longer resolves (tombstone), the authoritative binding read is null, and neither a fresh
    // native grant nor the reviewer detail can revive disclosure.
    const resolves = (
      await db.query<{ ok: boolean }>(
        "SELECT public.citation_native_binding_resolves($1::uuid,'p',$2::jsonb) ok",
        [user, JSON.stringify({ kind: "native", id: a.id, nativeBinding: a.binding })],
      )
    ).rows[0].ok;
    expect(resolves).toBe(false);
    expect((await readNativeReportBinding(scope, a.id, rpc)).binding).toBeNull();
    await expect(viewV2(f.id)).rejects.toThrow();
    await expect(
      grantCitationReviewNativeAssignment(
        user,
        { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
        rpc,
      ),
    ).rejects.toThrow();
    // Re-submitting the EXACT previously-successful review cannot resurrect the deleted/recreated native: the
    // finding is erased, so the save gate refuses it (no receipt is promoted onto recreated material).
    await expect(saveCitationFindingReview(reviewer, payload, rpc)).rejects.toThrow();
  });
});

describe("NS05: a membership/policy epoch change invalidates access until an explicit fresh grant", () => {
  it("a successful review's detail, receipts and IDENTICAL retry are denied after a member remove/restore AND a real policy disable/restore, with no new/promoted receipt, until a fresh grant restores them", async () => {
    const a = await stageParse();
    const f = await saveNative("60000000-0000-4000-8000-000000000061", [bound(a.id, a.binding)]);
    const sha = (await nativeConsentSetDigest([
      { id: a.id, parsedSha256: a.binding.parsedSha256 },
    ]))!;
    const grant = () =>
      grantCitationReviewNativeAssignment(
        user,
        { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
        rpc,
      );
    const receipts = () =>
      readCitationFindingReviews(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: f.id },
        rpc,
      );
    const receiptCount = async () =>
      (
        await db.query<{ c: number }>(
          "SELECT count(*)::int c FROM public.ai_citation_finding_reviews WHERE user_id=$1 AND project_id='p' AND finding_row_id=$2::uuid",
          [user, f.id],
        )
      ).rows[0].c;
    // Establish a GENUINE successful approved receipt bound to the finding's record sha; retain its exact payload
    // so the "identical retry" below is that same successful submission (idempotent while consent holds) and any
    // later rejection is the native gate, NOT a stale-hash or no-prior-receipt accident.
    await grant();
    const view = await viewV2(f.id);
    expect(view.inspectionComplete).toBe(true);
    const payload = {
      projectId: "p",
      ownerId: user,
      findingRowId: f.id,
      expectedSha: view.recordSha256!,
      decision: "approved" as const,
      note: "reviewed the native export",
    };
    const first = (await saveCitationFindingReview(reviewer, payload, rpc)) as {
      id: string;
      inspectionComplete: boolean;
    };
    expect(first.inspectionComplete).toBe(true);
    const retry = () => saveCitationFindingReview(reviewer, payload, rpc);
    expect(((await retry()) as { id: string }).id).toBe(first.id); // idempotent while consent holds
    expect(await receiptCount()).toBe(1);
    await expect(receipts()).resolves.toBeTruthy();
    // (a) member remove+restore: eligibility returns but the accepted epoch changed. Detail, the standalone
    // receipts read AND the identical same-payload retry are ALL denied, and NO new/promoted receipt is written.
    await setMember(reviewer, "reviewer", false);
    await setMember(reviewer, "reviewer", true);
    await expect(viewV2(f.id)).rejects.toThrow();
    await expect(receipts()).rejects.toThrow();
    await expect(retry()).rejects.toThrow();
    expect(await receiptCount()).toBe(1);
    // A fresh grant at the new epoch restores detail, receipts and the idempotent retry (same receipt id).
    await grant();
    expect((await viewV2(f.id)).inspectionComplete).toBe(true);
    await expect(receipts()).resolves.toBeTruthy();
    expect(((await retry()) as { id: string }).id).toBe(first.id);
    expect(await receiptCount()).toBe(1);
    // (b) an ACTUAL restrictive policy change: disable (reviewer ineligible) then restore to separate_reviewers
    // (eligible again, but the consent's pinned policy epoch is now stale). Detail, receipts and the identical
    // retry stay denied — with no new receipt — until an explicit fresh grant.
    await setPolicy("disabled");
    await expect(viewV2(f.id)).rejects.toThrow();
    await expect(retry()).rejects.toThrow();
    await setPolicy("separate_reviewers");
    await expect(viewV2(f.id)).rejects.toThrow();
    await expect(receipts()).rejects.toThrow();
    await expect(retry()).rejects.toThrow();
    expect(await receiptCount()).toBe(1);
    await grant();
    expect((await viewV2(f.id)).inspectionComplete).toBe(true);
    expect(((await retry()) as { id: string }).id).toBe(first.id);
    expect(await receiptCount()).toBe(1);
  });
  it("a reviewer may always withdraw their OWN native receipt after revoke / membership loss / erasure; others cannot, and the withdrawal leaks no material", async () => {
    // Build a consented, inspected, approved native receipt and return its id.
    const mk = async (findingId: string, csv: string) => {
      const a = await stageParse(csv);
      const f = await saveNative(findingId, [bound(a.id, a.binding)]);
      const sha = (await nativeConsentSetDigest([
        { id: a.id, parsedSha256: a.binding.parsedSha256 },
      ]))!;
      await grantCitationReviewNativeAssignment(
        user,
        { projectId: "p", findingRowId: f.id, reviewerId: reviewer, nativeSetSha256: sha },
        rpc,
      );
      const view = await viewV2(f.id);
      const receipt = await saveCitationFindingReview(
        reviewer,
        {
          projectId: "p",
          ownerId: user,
          findingRowId: f.id,
          expectedSha: view.recordSha256!,
          decision: "approved",
          note: "reviewed the native export",
        },
        rpc,
      );
      return { a, f, receiptId: (receipt as { id: string }).id };
    };
    const withdraw = (actor: string, id: string) =>
      removeCitationFindingReview(actor, { ownerId: user, projectId: "p", id }, rpc);
    // (1) Native consent REVOKED: the detail is withheld, the OWNER cannot erase the reviewer's receipt, but the
    // reviewer still retracts their own — the response is the content-free `true`, never any native material.
    const r1 = await mk("60000000-0000-4000-8000-000000000071", chartCsv);
    await revokeCitationReviewAssignment(
      user,
      { projectId: "p", findingRowId: r1.f.id, reviewerId: reviewer },
      rpc,
    );
    await expect(viewV2(r1.f.id)).rejects.toThrow();
    await expect(withdraw(user, r1.receiptId)).rejects.toThrow();
    expect(await withdraw(reviewer, r1.receiptId)).toBe(true);
    // (2) MEMBERSHIP lost: a reviewer whose membership lapsed still retracts their own historical receipt.
    const r2 = await mk(
      "60000000-0000-4000-8000-000000000072",
      "Date,Impressions\n2026-09-03,7\n2026-09-04,0\n",
    );
    await setMember(reviewer, "reviewer", false);
    expect(await withdraw(reviewer, r2.receiptId)).toBe(true);
    await setMember(reviewer, "reviewer", true);
    // (3) Native ERASURE: deleting the cited native erases the finding; a stranger cannot withdraw the receipt,
    // the reviewer still can, and no erased material is reopened through the withdrawal response.
    const r3 = await mk(
      "60000000-0000-4000-8000-000000000073",
      "Date,Impressions\n2026-09-05,9\n2026-09-06,0\n",
    );
    await removeNativeArtifact(scope, r3.a.id, rpc);
    await expect(viewV2(r3.f.id)).rejects.toThrow();
    await expect(withdraw(stranger, r3.receiptId)).rejects.toThrow();
    expect(await withdraw(reviewer, r3.receiptId)).toBe(true);
  });
});
