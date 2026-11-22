// In-page fixture state + synthetic server functions for the native-findings REVIEW/AUTHORING surfaces
// (the ACTUAL NativeGoogleIntakePanel, CitationFindingAuthor, and CitationReviewPanel owner+reviewer), plus
// the native ReportView. It extends the native-google-intake fixture's approach — REAL parser/schemas over
// synthetic transport — to the finding author/review binding work. Everything here is synthetic
// example.test/example.com data; NOTHING is a customer file, a production write, or a real canonical digest.
// See README.md.
//
// Honesty boundaries (enforced, not decorative):
//  * EVERY modeled successful response is validated against the ACTUAL client-safe zod contract at dispatch,
//    including the raw-artifact staging summary (status pending_parser, full owner-declared metadata) kept
//    DISTINCT from the parsed interpretation and the binding read. A seed that drifts fails loudly.
//  * The whole-native-set consent digest uses the REAL client helper (nativeConsentSetDigest) over the
//    COMPLETE scoped cited set; the per-artifact parsedSha256 is an opaque deterministic TEST input. A
//    wrong full-set hash, an unbound/legacy/missing/changed member → the grant is refused, exactly as the
//    server would. A synthetic per-artifact digest is fine; a wrong full-set composition is NOT.
//  * No blanket owner. isOwner is the actor's own role. Every handler is scoped to the captured
//    actor + exact owner/project/row/receipt; a foreign scope or an owner-only endpoint under a reviewer
//    session is recorded as a violation and refused. Reviewer material requires the explicit live
//    assignment/consent.
//  * Deferral is a timing boundary around the SAME validated scoped handler (commit the real outcome, then
//    deliver later); it never resolves an arbitrary value and never hides a forbidden call.
import { z } from "zod";
import {
  NATIVE_GOOGLE_PARSER_VERSION,
  fileKindForDimension,
  nativeReportParsedRecordSchema,
  nativeReportParsedReadSchema,
  nativeReportBindingReadSchema,
  nativeReportParseStatesSchema,
} from "@/lib/native-google-intake";
import {
  NATIVE_BING_PARSER_VERSION,
  parseNativeBingReportCsv,
  bingFileKindForDimension,
} from "@/lib/native-bing-ai-csv";
import { parseNativeGoogleReportCsv } from "@/lib/native-google-ai-csv";
import {
  nativeArtifactScopeKey,
  nativeArtifactStateSchema,
  nativeArtifactSummarySchema,
} from "@/lib/native-ai-artifact";
import { GSC_REPORT_TIMEZONE } from "@/lib/native-ai-report";
import { findingSchema } from "@/lib/citation-finding";
import {
  citationFindingSummarySchema,
  citationFindingDetailSchema,
  citationFindingsStateSchema,
  citationFindingStageSchema,
  inspectedHeadRefinement,
} from "@/lib/citation-record";
import {
  citationFindingForReviewSchema,
  citationFindingReviewListSchema,
  citationFindingReviewReceiptSchema,
  citationReviewAssignmentReceiptSchema,
  citationReviewNativeAssignmentReceiptSchema,
  citationFindingReviewInputSchema,
  citationFindingReviewTargetSchema,
  citationFindingReviewRemoveSchema,
  citationReviewAssignmentInputSchema,
  citationReviewNativeAssignmentInputSchema,
} from "@/lib/citation-finding-review";
import { nativeConsentSetDigest, grantEligibleReviewers } from "@/lib/citation-review-ui";
import {
  answerEvidenceSchema,
  evidenceRowSchema,
  analyzeAnswer,
  evidenceProjectId,
} from "@/lib/answer-evidence";
import { knowledgeSourceSchema, knowledgeRecordSchema } from "@/lib/project-knowledge";
import { lockedPanelDocument } from "@/lib/citation-panel-fixture";

/* --------------------------------------------------------------- identities */

const OWNER = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "owner@example.invalid",
  role: "owner",
};
const REVIEWER = {
  id: "00000000-0000-4000-8000-0000000000b1",
  email: "reviewer@example.invalid",
  role: "reviewer",
};
const EDITOR = {
  id: "00000000-0000-4000-8000-0000000000b2",
  email: "editor@example.invalid",
  role: "editor",
};

const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const uid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
// Deterministic 64-hex opaque TEST digest (NOT a real canonical digest — see header).
function hex64(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  let out = "";
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h = (h + Math.imul(k + 1, 2654435761)) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}
// Deterministic UUID (version-4 shaped) from a seed, so saved rows have STABLE ids per (findingId,version).
function uuidFromSeed(seed) {
  const h = hex64(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const INSTANT = "2026-10-20T09:00:00.000Z";
const CAPTURED_AT = "2026-11-13T09:00:00.000Z";
const nowIso = () => new Date().toISOString();

/* --------------------------------------------------------- synthetic CSV bytes */

const te = new TextEncoder();
const GOOGLE_CHART_CSV = "Date,Impressions\n2026-09-01,12\n2026-09-02,0\n";
const BING_OVERVIEW_CSV =
  "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/14/2026 12:00:00 AM,0,0\n";
const bytesToB64 = (bytes) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64ToBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* --------------------------------------------------------------- the fixture */

export const fixture = (window.__nativeFindingsFixture = {
  actors: { owner: OWNER, reviewer: REVIEWER, editor: EDITOR },
  auth: { actorId: OWNER.id, role: "owner" },
  epoch: 1,
  seq: 0,
  gen: 0,
  locale: "en",
  calls: [],
  violations: [],
  clipboard: [],
  seedErrors: [],
  pending: [],
  timers: [],
  inflight: [], // currently-unsettled invocations (incl those awaiting a digest) — see inspect.inFlight()
  deferred: new Map(), // name -> { mode }
  failOnce: new Map(), // name -> code
  ledger: new Map(), // save idempotency: key -> { result, rowId }
  flags: {},
  state: null,
  db: null,
  authSnapshot: null,
});

export function record(type) {
  fixture.seq += 1;
  if (type.startsWith("store.") || type.startsWith("auth."))
    fixture.calls.push({ seq: fixture.seq, name: type, data: null, actor: fixture.auth.actorId });
}

/* ------------------------------------------------------------- auth snapshot */

function rebuildAuth() {
  const actor = fixture.auth.actorId ? fixture.actors[fixture.auth.role] : null;
  fixture.authSnapshot = {
    loading: false,
    session: actor ? { user: { id: actor.id } } : null,
    user: actor ? { id: actor.id, email: actor.email } : null,
    isOwner: actor ? actor.role === "owner" : false,
    roleLoaded: fixture.state?.hydrated ?? false,
    signOut: async () => {
      record("auth.signOut");
      throw Error("Fixture refuses auth.signOut.");
    },
    refreshRole: async () => {},
  };
}

/* ----------------------------------------------------------- ids and scope */

const PROJECT = "p";
const PROJECT2 = "q";
const PANEL_ID = uid(900001);
const ANSWER_ID = uid(910001);
const PROMPT_ID = uid(911001);
const SOURCE_ID = uid(920001);
const RECORD_ID = uid(930001);
const ART_GOOGLE = uid(100001);
const ART_BING = uid(100002);
const ART_UNPARSED = uid(100003);
const ART_UNBINDABLE = uid(100004);
const ROWS = {
  boundNative: uid(800001),
  legacyNative: uid(800002),
  mixed: uid(800003),
  multiNative: uid(800004),
  sourceFinding: uid(800005),
  unbindableNative: uid(800006),
};

function seedState() {
  return {
    projects: [
      {
        id: PROJECT,
        name: "First project",
        businessName: "Example Clinic",
        market: "Sweden",
        mainLocation: "Stockholm",
        appLanguage: fixture.locale,
        primaryLanguage: "sv",
      },
      {
        id: PROJECT2,
        name: "Second project",
        businessName: "Second Co",
        market: "Finland",
        mainLocation: "Helsinki",
        appLanguage: fixture.locale,
        primaryLanguage: "fi",
      },
    ],
    activeProjectId: PROJECT,
    hydrated: true,
    userId: fixture.auth.actorId,
  };
}

/* ------------------------------------------------- owner-declared metadata */

function googleMetadata(filename = "Chart.csv") {
  return {
    source: "gsc_generative_ai_search",
    declaredProperty: "https://example.test/",
    reportKind: "chart",
    dimension: "date",
    aggregation: "property",
    period: { start: "2026-09-01", end: "2026-09-02", timezone: GSC_REPORT_TIMEZONE },
    marketScope: { country: null, exposed: false },
    filters: {},
    capturedAt: CAPTURED_AT,
    filename,
  };
}
function bingMetadata(filename = "Overview.csv") {
  return {
    source: "bing_ai_performance",
    declaredProperty: "https://example.test/",
    reportKind: "chart",
    dimension: "date",
    aggregation: "property",
    period: { start: "2026-08-13", end: "2026-08-14", timezone: null },
    marketScope: { country: null, exposed: false },
    filters: {},
    capturedAt: CAPTURED_AT,
    filename,
  };
}

/* --------------------------------------- parse + build a synthetic artifact */

// Interpret the stored bytes with the REAL parser (as persist() does) and bind the parsed interpretation to
// the staged raw artifact. The metadata-declared reportKind/dimension/aggregation are taken from the parser
// output so the raw summary stays internally consistent with the parse.
async function parsedRecordFor(metadata, bytes, completeness, limitationNote) {
  let file;
  let parserVersion;
  let preview;
  if (metadata.source === "gsc_generative_ai_search") {
    file = fileKindForDimension(metadata.dimension);
    parserVersion = NATIVE_GOOGLE_PARSER_VERSION;
    preview = await parseNativeGoogleReportCsv(file, bytes, {
      declaredProperty: metadata.declaredProperty,
      period: {
        start: metadata.period.start,
        end: metadata.period.end,
        timezone: metadata.period.timezone ?? "",
      },
      capturedAt: metadata.capturedAt,
      completeness,
      filterContext: { filters: metadata.filters, marketScope: metadata.marketScope },
      filename: metadata.filename,
    });
  } else {
    file = bingFileKindForDimension(metadata.dimension);
    parserVersion = NATIVE_BING_PARSER_VERSION;
    // Mirror the server: a forged Bing market/timezone/filter is an explicit mismatch, not normalized.
    if (
      metadata.marketScope.country !== null ||
      metadata.marketScope.exposed ||
      Object.keys(metadata.filters).length > 0 ||
      metadata.period.timezone !== null
    )
      throw Error("native_parsed_metadata_mismatch");
    preview = await parseNativeBingReportCsv(file, bytes, {
      declaredProperty: metadata.declaredProperty,
      period: { start: metadata.period.start, end: metadata.period.end },
      capturedAt: metadata.capturedAt,
      completeness,
      filename: metadata.filename,
    });
  }
  return nativeReportParsedRecordSchema.parse({
    artifactId: metadata.artifactId,
    artifactSha256: preview.input.artifact.sha256,
    parserVersion,
    file,
    withheldPageRows: preview.withheldPageRows,
    partial: preview.partial,
    limitationNote: limitationNote ?? "",
    input: preview.input,
  });
}

// One stored artifact row. `parse:true` runs the real parser now; `bindable:false` makes a PARSED artifact
// whose owner binding is null (parsed-but-unbindable). Raw status stays pending_parser (the parse lives in a
// separate interpretation, never the raw artifact's status).
async function artifactRow(id, metadata, body, { parse = true, bindable = true } = {}) {
  const bytes = te.encode(body);
  const base64 = bytesToB64(bytes);
  const sha = await sha256Hex(bytes);
  const m = { ...metadata, artifactId: id };
  let parsed = null;
  if (parse) parsed = await parsedRecordFor(m, bytes, "partial", "");
  // Keep the owner-declared raw summary metadata coherent with the parser's own reportKind/dimension/
  // aggregation (the parser is authoritative for the exported shape).
  const declared = parsed
    ? {
        ...metadata,
        reportKind: parsed.input.reportKind,
        dimension: parsed.input.dimension,
        aggregation: parsed.input.aggregation,
      }
    : metadata;
  return {
    id,
    owner: OWNER.id,
    project: PROJECT,
    source: metadata.source,
    metadata: declared, // the 10-key owner-declared staging metadata (read back in the raw summary)
    base64,
    byteLength: bytes.length,
    rawSha256: sha,
    scopeKey: nativeArtifactScopeKey(metadata),
    status: "pending_parser", // raw artifact status is ALWAYS pending_parser/unsupported — never "parsed"
    parseState: parsed ? "parsed" : "unparsed",
    parsed,
    parsedSha256: parsed ? hex64("parsed:" + id) : null, // opaque synthetic central digest (TEST data)
    parsedAt: parsed ? "2026-11-13T09:05:00.000Z" : null,
    bindable,
    createdAt: "2026-11-13T09:00:00.000Z",
    supersedesId: null,
    predecessorDeleted: false,
  };
}

// The authoritative per-artifact binding the owner embeds into a NEW finding version. Null for an unparsed
// OR a parsed-but-unbindable artifact (exactly when the server returns a null binding).
function bindingOf(a) {
  if (!a || a.parseState !== "parsed" || !a.parsed || !a.bindable) return null;
  return {
    rawSha256: a.rawSha256,
    source: a.source,
    parserVersion: a.parsed.parserVersion,
    parsedSha256: a.parsedSha256,
  };
}

/* ----------------------------------------------- author prerequisite seeds */

function seedPanel() {
  // A fully schema-valid locked brand panel (reuses the migration-test fixture document) → one scope.
  return lockedPanelDocument({
    userId: OWNER.id,
    projectId: PROJECT,
    panelId: PANEL_ID,
    client: { name: "Example Clinic", market: "Sweden" },
    kind: "brand",
    status: "locked",
  });
}
function seedAnswer() {
  const prompt = {
    id: PROMPT_ID,
    revision: 1,
    createdAt: INSTANT,
    data: {
      prompt: "best dentist in Stockholm for implants",
      intent: "find a provider",
      source: "manual",
      market: "Sweden",
      language: "sv",
      brand: "Example Clinic",
      // answer-evidence requires a PUBLIC url (example.test is rejected by evidenceUrl); use example.com.
      websiteUrl: "https://example.com/",
      competitorUrls: [],
      active: true,
    },
  };
  const input = answerEvidenceSchema.parse({
    promptId: PROMPT_ID,
    promptRevision: 1,
    surface: "google_ai_overview",
    mode: "consumer-web",
    method: "manual capture",
    modelVersion: null,
    capturedAt: "2026-10-15T09:00:00.000Z",
    status: "complete",
    rawAnswer: "Example Clinic offers dental implants in Stockholm.",
    citations: [],
    citationsComplete: true,
    failure: null,
    reportedCostUsd: null,
    sourceUrl: null,
    supersedesId: null,
  });
  return evidenceRowSchema.parse({
    id: ANSWER_ID,
    createdAt: INSTANT,
    hash: hex64("answer:" + ANSWER_ID),
    input,
    prompt,
    analysis: analyzeAnswer(input, prompt),
  });
}
function seedKnowledge() {
  const source = knowledgeSourceSchema.parse({
    ownerId: OWNER.id,
    projectId: PROJECT,
    id: SOURCE_ID,
    revision: 1,
    kind: "owner",
    label: "Clinic homepage",
    fingerprint: hex64("src:" + SOURCE_ID),
    observedAt: INSTANT,
    status: "active",
    url: "https://example.com/",
  });
  const record = knowledgeRecordSchema.parse({
    ownerId: OWNER.id,
    projectId: PROJECT,
    id: RECORD_ID,
    revision: 1,
    sourceId: SOURCE_ID,
    sourceRevision: 1,
    key: "service.implants",
    category: "fact",
    appliesTo: "text",
    value: "We offer dental implants in Stockholm.",
    locator: "section#services",
    status: "accepted",
    updatedAt: INSTANT,
    reviewedAt: INSTANT,
  });
  return { sources: [source], records: [record] };
}
function seedRoster() {
  return [
    {
      actorId: REVIEWER.id,
      email: REVIEWER.email,
      role: "reviewer",
      active: true,
      expiresAt: null,
    },
    { actorId: EDITOR.id, email: EDITOR.email, role: "editor", active: true, expiresAt: null },
  ];
}

/* ---------------------------------------------------------------- findings */

const REVIEWER_SIG = { reviewer: OWNER.id, reviewedAt: INSTANT };

function buildFinding(findingId, evidence, over = {}) {
  return findingSchema.parse({
    findingId,
    family: "citation_source",
    evidence,
    entityMatch: "confirmed",
    capture: { answerComplete: false, citationsComplete: false },
    observation: "Native report shows citations present for the tracked property.",
    hypothesis: null,
    competitorCited: null,
    ownCited: null,
    recommendation: null,
    support: [],
    accuracy: [],
    priority: { harm: "low", relevance: "low", fixability: "low" },
    decision: "needs_second_review",
    review: REVIEWER_SIG,
    secondReview: null,
    linkedTaskId: null,
    ...over,
  });
}
function nativeEvidence(artifact, bind) {
  const e = { kind: "native", id: artifact.id };
  if (bind) {
    const b = bindingOf(artifact);
    // A bound finding embeds the binding it was authored with. An unbindable artifact yields no binding, so
    // the citation reads as a bare/legacy native (its id is still cited, inspectable only once truly bound).
    if (b) e.nativeBinding = b;
  }
  return e;
}
function findingRow(rowId, findingId, version, record) {
  return {
    id: rowId,
    findingId,
    version,
    project: PROJECT,
    family: record.family,
    decision: record.decision,
    panelId: PANEL_ID,
    panelVersion: 1,
    client: { name: "Example Clinic", market: "Sweden" },
    actorId: OWNER.id,
    reviewerId: OWNER.id,
    supersedesId: null,
    predecessorDeleted: false,
    createdAt: INSTANT,
    sourceAvailable: true,
    accuracyStatus: "none",
    reviewStatus: "owner_only",
    scopeEnforcedAt: INSTANT,
    record,
  };
}
function seedFindings(arts) {
  const findings = new Map();
  const add = (rowId, findingId, record) =>
    findings.set(findingId, [findingRow(rowId, findingId, 1, record)]);
  add(
    ROWS.boundNative,
    uid(700001),
    buildFinding(uid(700001), [nativeEvidence(arts.google, true)]),
  );
  add(
    ROWS.legacyNative,
    uid(700002),
    buildFinding(uid(700002), [nativeEvidence(arts.google, false)]),
  );
  add(
    ROWS.mixed,
    uid(700003),
    buildFinding(uid(700003), [{ kind: "answer", id: ANSWER_ID }, nativeEvidence(arts.bing, true)]),
  );
  add(
    ROWS.multiNative,
    uid(700004),
    buildFinding(uid(700004), [nativeEvidence(arts.google, true), nativeEvidence(arts.bing, true)]),
  );
  add(
    ROWS.sourceFinding,
    uid(700005),
    buildFinding(uid(700005), [
      { kind: "answer", id: ANSWER_ID },
      { kind: "source", id: SOURCE_ID },
    ]),
  );
  // Cites an artifact that is parsed but UNBINDABLE: the finding embeds a stale binding, but the live
  // binding read resolves null, so consent is refused and reviewer material stays withheld.
  add(
    ROWS.unbindableNative,
    uid(700006),
    buildFinding(uid(700006), [
      {
        kind: "native",
        id: arts.unbindable.id,
        nativeBinding: {
          rawSha256: arts.unbindable.rawSha256,
          source: arts.unbindable.source,
          parserVersion: arts.unbindable.parsed.parserVersion,
          parsedSha256: hex64("parsed:" + arts.unbindable.id),
        },
      },
    ]),
  );
  return findings;
}

/* ------------------------------------------------------------- build the DB */

async function buildDb() {
  const google = await artifactRow(ART_GOOGLE, googleMetadata(), GOOGLE_CHART_CSV);
  const bing = await artifactRow(ART_BING, bingMetadata(), BING_OVERVIEW_CSV);
  const unparsed = await artifactRow(ART_UNPARSED, googleMetadata("Later.csv"), GOOGLE_CHART_CSV, {
    parse: false,
  });
  const unbindable = await artifactRow(
    ART_UNBINDABLE,
    googleMetadata("Unbindable.csv"),
    GOOGLE_CHART_CSV,
    { bindable: false },
  );
  const arts = { google, bing, unparsed, unbindable };
  return {
    artifacts: [google, bing, unparsed, unbindable],
    findings: seedFindings(arts),
    reviews: new Map(), // findingRowId -> receipts[]
    assignments: new Map(), // `${project}:${rowId}:${reviewerId}` -> { active, native }
    roster: seedRoster(),
    policy: { mode: "separate_reviewers" },
    // Live authority epoch (SQL `citation_review_authorized` membership/policy revisions). Any member
    // remove/restore or policy disable/restore bumps these, so a native consent accepted under an old
    // revision is stale until an explicit fresh grant (a bare restore never revives old consent).
    membershipRevision: 0,
    policyRevision: 0,
    prereqs: { panels: [seedPanel()], answers: [seedAnswer()], ...seedKnowledge(), facts: [] },
  };
}

/* --------------------------------------------------------- case lifecycle */

// Reset every fixture trace a retired case must not leak: dispose in-flight deferred work and timers FIRST,
// then clear calls/violations/clipboard/ledger/failures/deferrals/flags and rebuild session + synthetic DB.
// The actual React tree/QueryClient teardown is the entry's responsibility (BF03); this resets fixture state.
async function setupCase(opts = {}) {
  fixture.gen += 1;
  for (const p of fixture.pending.splice(0)) p.dispose();
  for (const t of fixture.timers.splice(0)) clearTimeout(t);
  fixture.deferred = new Map();
  fixture.failOnce = new Map();
  fixture.ledger = new Map();
  fixture.flags = {};
  fixture.calls = [];
  fixture.violations = [];
  fixture.clipboard = [];
  fixture.seedErrors = [];
  fixture.seq = 0;
  fixture.locale = opts.locale ?? fixture.locale;
  const who = opts.actor === "reviewer" ? REVIEWER : opts.actor === "none" ? null : OWNER;
  fixture.auth = { actorId: who ? who.id : null, role: who ? who.role : "owner" };
  fixture.epoch += 1;
  fixture.state = seedState(); // userId follows fixture.auth.actorId → reviewer case is hydrated AS reviewer
  if (opts.project) fixture.state.activeProjectId = opts.project;
  fixture.state.projects.forEach((p) => (p.appLanguage = fixture.locale));
  try {
    fixture.db = await buildDb();
  } catch (e) {
    // A broken required positive seed must FAIL setup (never silently degrade) so the smoke/UI sees it.
    fixture.seedErrors.push({ phase: "buildDb", error: String(e?.stack ?? e) });
    throw e;
  }
  if (opts.grantReviewer !== false) await grantDefaults();
  rebuildAuth();
  fixture.emit?.();
}

// By default authorize the independent reviewer on the bound-native row, with matching full-set native
// consent, so reviewer mode shows material out of the box. Uses the REAL consent digest helper.
async function grantDefaults() {
  const rowId = ROWS.boundNative;
  const setSha = await expectedNativeSetDigest(rowId);
  fixture.db.assignments.set(assignKey(PROJECT, rowId, REVIEWER.id), {
    active: true,
    native: setSha ? nativeConsentRecord(setSha) : null,
  });
}
// The stored native consent binds the owner's declared digest AND the CURRENT authority revisions (SQL
// consented_set_sha256 + consented_membership_revision + consented_policy_revision).
const nativeConsentRecord = (setSha) => ({
  active: true,
  setSha,
  membershipRevision: fixture.db.membershipRevision,
  policyRevision: fixture.db.policyRevision,
});

/* ---------------------------------------------- request context + input schemas */

// The captured request context (actor/role/generation) is threaded through every async handler so a later
// global actor/session change can NEVER re-authorize or re-attribute an in-flight request, and a retired
// case (generation bumped by setupCase/retireCase) is refused before any mutation or post-await state read.
// This replaces the old mutable fixture.auth swap entirely.
const captureCtx = () => ({
  actorId: fixture.auth.actorId,
  role: fixture.auth.role,
  gen: fixture.gen,
});
function assertLive(ctx) {
  if (ctx.gen !== fixture.gen) throw Error("fixture_case_retired");
}

// REAL exported client-safe input schemas mirroring functions.ts, with only the minimal strict scope
// wrapper each endpoint's inputValidator uses. Parsed BEFORE any effect; no clones, no permissive fallback.
const ownerScope = z
  .object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() })
  .strict();
const ownerScopeId = z
  .object({
    projectId: evidenceProjectId,
    expectedOwnerId: z.string().uuid(),
    id: z.string().uuid(),
  })
  .strict();
const saveFindingInput = z
  .object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() })
  .extend(citationFindingStageSchema.shape)
  .strict()
  .superRefine(inspectedHeadRefinement);
// Owner read/write inputs that carry projectId + expectedOwnerId (+ optional id); readProjectKnowledgeFn and
// the team/policy reads use a looser shape, so they are parsed with their own narrow wrappers at the handler.
const INPUT_SCHEMAS = {
  readCitationProtocolFn: ownerScope,
  readAnswerEvidenceFn: ownerScope,
  readCitationBusinessFactsFn: ownerScope,
  readCitationFindingsFn: ownerScope,
  getCitationFindingFn: ownerScopeId,
  readNativeArtifactsFn: ownerScope,
  readNativeReportParseStatesFn: ownerScope,
  readNativeReportParsedFn: ownerScopeId,
  readNativeReportBindingFn: ownerScopeId,
  removeNativeArtifactFn: ownerScopeId,
  saveCitationFindingFn: saveFindingInput,
  getCitationFindingForReviewFn: citationFindingReviewTargetSchema,
  readCitationFindingReviewsFn: citationFindingReviewTargetSchema,
  saveCitationFindingReviewFn: citationFindingReviewInputSchema,
  removeCitationFindingReviewFn: citationFindingReviewRemoveSchema,
  grantCitationReviewAssignmentFn: citationReviewAssignmentInputSchema,
  revokeCitationReviewAssignmentFn: citationReviewAssignmentInputSchema,
  grantCitationReviewNativeAssignmentFn: citationReviewNativeAssignmentInputSchema,
};
// Parse the modeled input with the ACTUAL endpoint schema before any effect; a wrong/missing/extra field or
// an over-long note is refused with no mutation (mirrors the serverfn inputValidator throwing pre-handler).
function parseInput(name, data) {
  const schema = INPUT_SCHEMAS[name];
  if (!schema) return data;
  const r = schema.safeParse(data);
  if (!r.success) throw Error(`citation_input_invalid:${name}`);
  return r.data;
}

/* ------------------------------------------------------- lookups and digests */

const assignKey = (project, rowId, reviewerId) => `${project}:${rowId}:${reviewerId}`;
function rowById(id) {
  for (const rows of fixture.db.findings.values()) {
    const r = rows.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}
function chainByFindingId(findingId) {
  return fixture.db.findings.get(findingId) ?? null;
}
function currentDigest(rowId) {
  const row = rowById(rowId);
  return row ? hex64("rec:" + rowId + ":" + row.version) : hex64("rec:" + rowId);
}
function artifactById(id) {
  return fixture.db.artifacts.find((a) => a.id === id) ?? null;
}
const findingIsNativeBearing = (row) => row.record.evidence.some((e) => e.kind === "native");
// Whether the finding's STORED immutable binding still RESOLVES to the CURRENT live artifact in the EXACT
// owner/project scope (raw/source/parser/parsed digest), mirroring the SQL `citation_native_binding_resolves`
// which keys on p_user + p_project + artifact id (:295). An artifact in a DIFFERENT owner/project (e.g. a
// project-q finding citing a project-p artifact), a reparsed/replaced/deleted/unbindable artifact, or a
// bare/legacy ref (no binding) never resolves. Owner/project come from the finding/request scope — never a
// global lookup (BFR3-F02).
function nativeBindingResolvesLive(e, owner, project) {
  if (e.kind !== "native" || !e.nativeBinding) return false;
  const a = fixture.db.artifacts.find(
    (x) => x.id === e.id && x.owner === owner && x.project === project,
  );
  const live = bindingOf(a);
  return (
    !!live &&
    live.rawSha256 === e.nativeBinding.rawSha256 &&
    live.source === e.nativeBinding.source &&
    live.parserVersion === e.nativeBinding.parserVersion &&
    live.parsedSha256 === e.nativeBinding.parsedSha256
  );
}
// Canonical whole-set consent digest, mirroring SQL `citation_review_native_set_digest` (:293): NULL when the
// finding cites NO native, or when ANY cited native is bare/unbound OR does not resolve live in the finding's
// OWN owner/project; otherwise the REAL client helper over the sorted STORED `id:parsedSha256`.
function nativeSetItems(rowId) {
  const row = rowById(rowId);
  if (!row) return [];
  return row.record.evidence
    .filter((e) => e.kind === "native")
    .map((e) => ({
      id: e.id,
      parsedSha256: e.nativeBinding?.parsedSha256 ?? null,
      resolves: nativeBindingResolvesLive(e, row.actorId, row.project),
    }));
}
async function expectedNativeSetDigest(rowId) {
  const items = nativeSetItems(rowId);
  if (items.length === 0 || items.some((it) => !it.resolves)) return null; // unconsentable set (SQL returns NULL)
  return nativeConsentSetDigest(items.map((it) => ({ id: it.id, parsedSha256: it.parsedSha256 })));
}
// LIVE native-material consent for a native-bearing finding, mirroring SQL `citation_review_native_consented`
// (:318): an ACTIVE native grant whose recorded digest still equals the finding's CURRENT resolving set
// digest. Fails closed when unconsented, drifted (digest NULL — a reparsed/deleted member), or erased.
// Current authority (SQL `citation_review_authorized`): the actor is a currently-eligible team reviewer by
// the LIVE roster + policy. An inactive/expired/ineligible member or a disabled policy denies — derived from
// the real `grantEligibleReviewers`, not a manual flag.
const currentlyAuthorized = (actorId) =>
  grantEligibleReviewers(fixture.db.roster, OWNER.id, fixture.db.policy.mode).some(
    (m) => m.actorId === actorId,
  );
const eligibleReviewer = currentlyAuthorized; // same predicate for an owner grant's target
// LIVE native-material consent (SQL `citation_review_native_consented` :432): an active native grant whose
// digest AND accepted authority revisions still equal the current ones, the actor still authorized, the
// finding not erased, and the current resolving whole-set digest equals the stored one. A reparsed/deleted
// member (NULL digest) or a membership/policy revision bump (remove/restore, disable/restore) invalidates it
// until an explicit fresh grant. Threads the request ctx so a late resolution is refused on a retired case.
async function nativeConsentCurrent(row, assign, ctx) {
  if (!assign || !assign.native || !assign.native.active) return false;
  if (
    assign.native.setSha == null ||
    assign.native.membershipRevision == null ||
    assign.native.policyRevision == null
  )
    return false;
  if (fixture.flags.evidenceErased === true) return false; // erased finding: no native disclosure
  if (!currentlyAuthorized(ctx.actorId)) return false; // current live authority must still allow
  if (
    assign.native.membershipRevision !== fixture.db.membershipRevision ||
    assign.native.policyRevision !== fixture.db.policyRevision
  )
    return false; // authority epoch changed since consent → stale until a fresh grant
  const digest = await expectedNativeSetDigest(row.id);
  assertLive(ctx); // retired during the digest await → refuse, never read the replacement case
  return digest !== null && assign.native.setSha === digest;
}
const assignmentFor = (data, ctx) =>
  fixture.db.assignments.get(assignKey(data.projectId, data.findingRowId, ctx.actorId));

/* ---------------------------------------------------- transport authorization */

function violation(name, reason, ctx) {
  fixture.violations.push({
    seq: fixture.seq,
    name,
    actor: ctx ? ctx.actorId : fixture.auth.actorId,
    reason,
  });
}
// Owner-only endpoints: the request actor must be the owner, and the declared `expectedOwnerId` MUST equal
// it — mirroring the real serverfn scope wrapper (functions.ts). Uses the captured request ctx, never the
// live global actor, so a mid-flight session change cannot change the authorization of an issued request.
function requireOwner(name, data, ctx) {
  if (ctx.role !== "owner" || ctx.actorId !== OWNER.id) {
    violation(name, "owner-only endpoint invoked without the owner session", ctx);
    throw Error("evidence_owner_changed");
  }
  if (!data || !data.expectedOwnerId) {
    violation(name, "missing required expectedOwnerId", ctx);
    throw Error("evidence_owner_changed");
  }
  if (data.expectedOwnerId !== ctx.actorId) {
    violation(name, "expectedOwnerId does not match the session actor", ctx);
    throw Error("evidence_owner_changed");
  }
}
// Reviewer ADMISSION for a protected read/list/save: exact owner/project/row scope + CURRENT authority
// (live roster/policy) + an active base assignment, AND — for a native-bearing finding (incl bare/legacy) —
// current full-set native consent. An ordinary assignment alone never exposes record/hash/notes/material for
// a native-bearing finding. Threads the captured request ctx (actor + generation).
async function reviewerAdmitted(data, ctx) {
  if (data.ownerId !== OWNER.id || data.projectId !== PROJECT) {
    violation("reviewer", "reviewer read on a foreign owner/project scope", ctx);
    return false;
  }
  if (fixture.flags.policyDenied || fixture.flags.reviewRevoked || fixture.flags.reviewExpired)
    return false;
  const row = rowById(data.findingRowId);
  if (fixture.flags.findingDeleted || !row || row.project !== data.projectId) return false;
  if (!currentlyAuthorized(ctx.actorId)) return false; // inactive/expired/ineligible member or disabled policy
  const assign = assignmentFor(data, ctx);
  if (!assign || !assign.active) return false;
  if (findingIsNativeBearing(row)) return nativeConsentCurrent(row, assign, ctx);
  return true;
}

/* ---------------------------------------------- deferral (timing boundary) */

const captureOutcome = (fn) =>
  Promise.resolve()
    .then(fn)
    .then((v) => ({ ok: v }))
    .catch((e) => ({ err: e }));
// Wrap a deferred call as a timing boundary around the SAME validated scoped dispatch, carrying the CAPTURED
// request ctx (actor/role/generation) — NOT a mutable global swap. `commit` mode runs the real handler NOW
// (committing any mutation and capturing the schema-valid result/error) and delivers it on release; `hold`
// mode runs the handler at release under the captured ctx. Either way the result is the actual handler
// outcome — never an arbitrary value — and a retired generation is refused, never run.
//
// Returns BOTH lifetimes so the caller tracks them without double-counting (BFR3-F01):
//  * delivery  — the promise the caller awaits (resolves/rejects on release OR when retireCase disposes it);
//  * execution — the real handler's execution. In `commit` mode this is `entry.committed`, which may still be
//    held in an external digest AFTER delivery was rejected by retirement; in `hold` mode the handler only
//    runs at release (into delivery), so execution === delivery (a never-started hold retires immediately).
function deferCall(name, data, mode, ctx) {
  const id = `${name}#${fixture.seq}`;
  const entry = { id, name, gen: ctx.gen, mode, data: clone(data), actor: ctx.actorId, ctx };
  // commit mode: invoke the real handler NOW (synchronously up to its first await, so authorization,
  // violation logging and the mutation all commit immediately), capturing the outcome for later delivery.
  if (mode === "commit")
    entry.committed = (async () => {
      try {
        return { ok: await dispatch(name, data, ctx) };
      } catch (e) {
        return { err: e };
      }
    })();
  const delivery = new Promise((resolve, reject) => {
    entry.resolve = resolve;
    entry.reject = reject;
  });
  entry.dispose = () => reject_if(entry, Error("fixture_case_retired"));
  fixture.pending.push(entry);
  return { delivery, execution: entry.committed ?? delivery };
}
function reject_if(entry, err) {
  if (!entry.settled) {
    entry.settled = true;
    entry.reject(err);
  }
}
function dropPending(entry) {
  const i = fixture.pending.indexOf(entry);
  if (i >= 0) fixture.pending.splice(i, 1);
}

/* -------------------------------------------------------------- read builders */

const summaryOf = (row) =>
  citationFindingSummarySchema.parse({
    id: row.id,
    findingId: row.findingId,
    version: row.version,
    family: row.family,
    decision: row.decision,
    panelId: row.panelId,
    panelVersion: row.panelVersion,
    client: row.client,
    actorId: row.actorId,
    reviewerId: row.reviewerId,
    supersedesId: row.supersedesId,
    predecessorDeleted: row.predecessorDeleted,
    createdAt: row.createdAt,
    sourceAvailable: row.sourceAvailable,
    accuracyStatus: row.accuracyStatus,
    reviewStatus: row.reviewStatus,
    scopeEnforcedAt: row.scopeEnforcedAt,
  });

function ownerFindings(data) {
  const heads = [];
  for (const rows of fixture.db.findings.values()) {
    const head = rows[rows.length - 1];
    if (head.project === data.projectId) heads.push(head); // scope to the exact project
  }
  return citationFindingsStateSchema.parse({ findings: heads.map(summaryOf) });
}
function ownerDetail(data) {
  const row = rowById(data.id);
  if (!row || row.project !== data.projectId) throw Error("citation_finding_unavailable");
  return citationFindingDetailSchema.parse({
    ...summaryOf(row),
    accuracy: [],
    evidenceErased: false,
    recordValid: true,
    record: row.record,
  });
}

function rawArtifactSummary(a) {
  return nativeArtifactSummarySchema.parse({
    id: a.id,
    scopeKey: a.scopeKey,
    sha256: a.rawSha256,
    byteLength: a.byteLength,
    status: a.status, // pending_parser — NOT the parse state
    supersedesId: a.supersedesId,
    predecessorDeleted: a.predecessorDeleted,
    metadata: a.metadata,
    createdAt: a.createdAt,
    actorId: a.owner,
  });
}

// One projected evidence item. Native material is served ONLY for a bound member whose live binding resolves
// AND under current consent AND an unmasked record (the schema refuses material on a masked/erased finding).
function projectEvidence(e, { masked, consented, sourceRevoked, owner, project }) {
  if (e.kind === "answer")
    return {
      kind: "answer",
      id: e.id,
      available: true,
      inspectable: true,
      capturedAt: "2026-10-15T09:00:00.000Z",
      surface: "google_ai_overview",
      mode: "consumer-web",
      method: "manual capture",
      status: "complete",
      promptId: PROMPT_ID,
      promptRevision: 1,
      citationsComplete: true,
      citations: [],
      content: "Example Clinic offers dental implants in Stockholm.",
      contentLength: 50,
      contentTruncated: false,
    };
  if (e.kind === "source") {
    const src = fixture.db.prereqs.sources.find((s) => s.id === e.id);
    const recs = fixture.db.prereqs.records.filter(
      (r) => r.sourceId === e.id && r.status === "accepted",
    );
    const available = !!src && !sourceRevoked;
    const inspectable = available && recs.length > 0;
    return {
      kind: "source",
      id: e.id,
      available,
      inspectable,
      sourceKind: src?.kind ?? null,
      status: sourceRevoked ? "revoked" : (src?.status ?? null),
      label: src?.label ?? null,
      url: src?.url ?? null,
      fingerprint: src?.fingerprint ?? null,
      observedAt: src?.observedAt ?? null,
      sourceRevision: src?.revision ?? null,
      material: inspectable
        ? recs.map((r) => ({
            recordId: r.id,
            value: r.value,
            excerpt: r.excerpt ?? null,
            locator: r.locator,
            category: r.category,
            recordRevision: r.revision,
            status: r.status,
            validUntil: r.validUntil ?? null,
          }))
        : [],
      materialCount: inspectable ? recs.length : 0,
    };
  }
  // The cited native must resolve live in the finding's OWN owner/project to be inspectable or shown present.
  const a = fixture.db.artifacts.find(
    (x) => x.id === e.id && x.owner === owner && x.project === project,
  );
  const inspectable = !masked && consented && nativeBindingResolvesLive(e, owner, project) && !!a;
  const item = { kind: "native", id: e.id, available: !!a && !masked, inspectable };
  if (inspectable) item.nativeMaterial = clone(a.parsed);
  return item;
}
// The shared inspection state for the reviewer surface, so the saved receipt's `inspectionComplete` is the
// SAME whole-set predicate the view shows (never a divergent some()/kind heuristic).
async function computeInspection(data, ctx) {
  const row = rowById(data.findingRowId);
  const masked = fixture.flags.mask === true || fixture.flags.evidenceErased === true;
  const sourceRevoked = fixture.flags.sourceRevoked === true;
  const consented = await nativeConsentCurrent(row, assignmentFor(data, ctx), ctx);
  const evidence = row.record.evidence.map((e) =>
    projectEvidence(e, {
      masked,
      consented,
      sourceRevoked,
      owner: row.actorId,
      project: row.project,
    }),
  );
  const inspectionComplete =
    !masked && evidence.length > 0 && evidence.every((ev) => ev.inspectable);
  return { row, masked, sourceRevoked, evidence, inspectionComplete };
}
// Project the finding into the strict reviewer view (only reached AFTER admission). A valid masked projection
// (record/material withheld) is produced for the explicit mask/erased case; a cited-native-missing finding
// never reaches here (admission refuses it).
async function reviewProjection(data, ctx) {
  const { row, masked, sourceRevoked, evidence, inspectionComplete } = await computeInspection(
    data,
    ctx,
  );
  return citationFindingForReviewSchema.parse({
    id: row.id,
    findingId: row.findingId,
    version: row.version,
    family: row.family,
    decision: row.decision,
    panelId: row.panelId,
    panelVersion: row.panelVersion,
    client: row.client,
    recordSha256: masked ? null : currentDigest(data.findingRowId),
    record: masked ? null : row.record,
    createdAt: row.createdAt,
    evidenceErased: fixture.flags.evidenceErased === true,
    sourcePassagesWithheld: sourceRevoked,
    sourceAvailable: !sourceRevoked,
    accuracyStatus: row.accuracyStatus,
    reviewStatus: row.reviewStatus,
    inspectionComplete,
    evidence,
    facts: [],
    reviews: reviewEntries(data.findingRowId, ctx),
    reviewTotal: (fixture.db.reviews.get(data.findingRowId) ?? []).length,
    reviewsTruncated: false,
    scopeEnforcedAt: row.scopeEnforcedAt,
  });
}

function reviewEntries(rowId, ctx) {
  const row = rowById(rowId);
  return (fixture.db.reviews.get(rowId) ?? []).map((r) => ({
    id: r.id,
    reviewerId: r.reviewerId,
    mine: r.reviewerId === ctx.actorId,
    owner: r.reviewerId === OWNER.id,
    reviewerRole: r.reviewerRole,
    decision: r.decision,
    note: r.withdrawn ? null : r.note, // withdrawal erases the note (privacy)
    inspectionComplete: r.inspectionComplete,
    withdrawn: r.withdrawn,
    withdrawnAt: r.withdrawn ? r.withdrawnAt : null,
    findingVersion: row ? row.version : r.findingVersion,
    recordSha256: r.withdrawn ? null : r.recordSha256,
    createdAt: r.createdAt,
  }));
}
function reviewList(data, ctx) {
  const entries = reviewEntries(data.findingRowId, ctx);
  const active = entries.filter((e) => !e.withdrawn);
  return citationFindingReviewListSchema.parse({
    ownerId: data.ownerId,
    projectId: data.projectId,
    findingRowId: data.findingRowId,
    reviews: entries,
    reviewTotal: entries.length,
    reviewsTruncated: false,
    activeDissent: active.filter((e) => e.decision !== "approved").length,
    activeApproved: active.filter((e) => e.decision === "approved").length,
    reviewStatus: rowById(data.findingRowId)?.reviewStatus ?? "owner_only",
  });
}

/* ----------------------------------------------------- intake stage/persist */

async function stage(data, ctx) {
  requireOwner("stageNativeArtifactFn", data, ctx);
  if (fixture.flags.failStage) throw Error("native_artifact_unavailable");
  const { metadata, base64 } = data;
  const bytes = b64ToBytes(base64);
  const sha = await sha256Hex(bytes);
  assertLive(ctx); // retired mid-hash → do not mutate the replacement case
  const scopeKey = nativeArtifactScopeKey(metadata);
  const existing = fixture.db.artifacts.find(
    (a) =>
      a.owner === OWNER.id &&
      a.project === data.projectId &&
      a.rawSha256 === sha &&
      a.scopeKey === scopeKey,
  );
  if (existing) return rawArtifactSummary(existing);
  const id = uuidFromSeed("art:" + scopeKey + ":" + sha + ":" + fixture.db.artifacts.length);
  const row = {
    id,
    owner: OWNER.id,
    project: data.projectId,
    source: metadata.source,
    metadata: clone(metadata),
    base64,
    byteLength: bytes.length,
    rawSha256: sha,
    scopeKey,
    status: "pending_parser",
    parseState: "unparsed",
    parsed: null,
    parsedSha256: null,
    parsedAt: null,
    bindable: true,
    createdAt: nowIso(),
    supersedesId: null,
    predecessorDeleted: false,
  };
  fixture.db.artifacts.push(row);
  return rawArtifactSummary(row);
}
async function persist(data, ctx) {
  requireOwner("persistNativeReportFn", data, ctx);
  if (fixture.flags.failPersist) throw Error("native_parsed_unavailable");
  const a = fixture.db.artifacts.find(
    (x) => x.id === data.id && x.owner === OWNER.id && x.project === data.projectId,
  );
  if (!a) throw Error("native_parsed_unavailable");
  const record = await parsedRecordFor(
    { ...a.metadata, artifactId: a.id },
    b64ToBytes(a.base64),
    data.completeness,
    data.limitationNote,
  );
  assertLive(ctx); // retired mid-parse → do not mutate the replacement case
  if (a.parsed) {
    if (JSON.stringify(a.parsed) !== JSON.stringify(record)) throw Error("native_parsed_conflict");
  } else {
    a.parsed = record;
    a.parseState = "parsed";
    a.parsedSha256 = hex64("parsed:" + a.id);
    a.parsedAt = nowIso();
  }
  return nativeReportParsedReadSchema.parse({
    id: a.id,
    parseState: "parsed",
    parsed: clone(a.parsed),
    parsedAt: a.parsedAt,
    parsedActorId: a.owner,
  });
}

/* ----------------------------------------------------------------- dispatch */

// The pure, validated, scoped handler for one transport. Never records calls (invoke does that) so a deferred
// commit-mode run does not double-count. Throws on refusal; returns schema-valid data on success.
async function dispatch(name, rawData, ctx) {
  // Refuse a RETIRED request before any validation or effect (BFR4-F01): a normal-path dispatch is queued on
  // a microtask, so retireCase can bump the generation between the call and this execution — even the
  // synchronous owner-save handler must not write to a retired case. Covers queued-normal and deferred paths.
  assertLive(ctx);
  // Parse the modeled input with the ACTUAL endpoint schema BEFORE any effect (F03); a bad shape / over-long
  // note / missing expectedOwnerId is refused here with zero mutation, just as the serverfn inputValidator is.
  const data = parseInput(name, rawData);
  switch (name) {
    /* owner authoring prerequisites */
    case "readCitationProtocolFn":
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("citation_protocol_unavailable");
      // Prerequisites are seeded for project p ONLY; the owner's other project is legitimately empty.
      return { panels: data.projectId === PROJECT ? clone(fixture.db.prereqs.panels) : [] };
    case "readAnswerEvidenceFn":
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("answer_evidence_unavailable");
      return { answers: data.projectId === PROJECT ? clone(fixture.db.prereqs.answers) : [] };
    case "readProjectKnowledgeFn":
      if (ctx.role !== "owner" || ctx.actorId !== OWNER.id) {
        violation(name, "owner knowledge read under a non-owner session", ctx);
        throw Error("project_knowledge_unavailable");
      }
      if (fixture.flags.readsFail) throw Error("project_knowledge_unavailable");
      return data.projectId === PROJECT
        ? { sources: clone(fixture.db.prereqs.sources), records: clone(fixture.db.prereqs.records) }
        : { sources: [], records: [] };
    case "readCitationBusinessFactsFn":
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("citation_business_facts_unavailable");
      return { facts: data.projectId === PROJECT ? clone(fixture.db.prereqs.facts) : [] };
    case "readCitationFindingsFn":
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("citation_findings_unavailable");
      return ownerFindings(data);
    case "getCitationFindingFn":
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("citation_finding_unavailable");
      return ownerDetail(data);

    /* owner authoring write */
    case "saveCitationFindingFn":
      return saveFinding(data, ctx);

    /* intake stage / persist / remove (real NativeGoogleIntakePanel) */
    case "stageNativeArtifactFn":
      return stage(data, ctx);
    case "persistNativeReportFn":
      return persist(data, ctx);
    case "removeNativeArtifactFn": {
      requireOwner(name, data, ctx);
      const before = fixture.db.artifacts.length;
      fixture.db.artifacts = fixture.db.artifacts.filter(
        (a) => !(a.id === data.id && a.owner === OWNER.id && a.project === data.projectId),
      );
      return fixture.db.artifacts.length < before;
    }

    /* native owner reads */
    case "readNativeArtifactsFn":
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("native_artifact_unavailable");
      return nativeArtifactStateSchema.parse({
        artifacts: fixture.db.artifacts
          .filter((a) => a.owner === OWNER.id && a.project === data.projectId)
          .map(rawArtifactSummary),
      });
    case "readNativeReportParseStatesFn":
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("native_artifact_unavailable");
      return nativeReportParseStatesSchema.parse({
        states: fixture.db.artifacts
          .filter((a) => a.owner === OWNER.id && a.project === data.projectId)
          .map((a) => ({
            id: a.id,
            parseState: a.parseState,
            parserVersion: a.parsed?.parserVersion ?? null,
            completeness: a.parsed?.input.completeness ?? null,
            partial: a.parsed?.partial ?? null,
            withheldPageRows: a.parsed?.withheldPageRows ?? null,
            rowCount: a.parsed ? a.parsed.input.rows.length : null,
            parsedAt: a.parsedAt ?? null,
          })),
      });
    case "readNativeReportParsedFn": {
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("native_parsed_unavailable");
      const a = fixture.db.artifacts.find(
        (x) => x.id === data.id && x.owner === OWNER.id && x.project === data.projectId,
      );
      if (!a) throw Error("native_parsed_unavailable");
      return nativeReportParsedReadSchema.parse({
        id: a.id,
        parseState: a.parseState,
        parsed: clone(a.parsed),
        parsedAt: a.parsedAt,
        parsedActorId: a.parseState === "parsed" ? a.owner : null,
      });
    }
    case "readNativeReportBindingFn": {
      requireOwner(name, data, ctx);
      if (fixture.flags.readsFail) throw Error("native_binding_unavailable");
      const a = fixture.db.artifacts.find(
        (x) => x.id === data.id && x.owner === OWNER.id && x.project === data.projectId,
      );
      if (!a) throw Error("native_binding_unavailable");
      return nativeReportBindingReadSchema.parse({
        id: a.id,
        available: true,
        parseState: a.parseState,
        binding: bindingOf(a),
      });
    }

    /* owner assignment reads / writes */
    case "readProjectTeamRosterFn":
      if (ctx.role !== "owner") {
        violation(name, "roster read under a non-owner session", ctx);
        throw Error("project_team_unavailable");
      }
      return { members: clone(fixture.db.roster) };
    case "readOwnerTeamPolicyFn":
      if (ctx.role !== "owner") {
        violation(name, "policy read under a non-owner session", ctx);
        throw Error("owner_team_policy_unavailable");
      }
      return { mode: fixture.db.policy.mode };
    case "grantCitationReviewAssignmentFn": {
      if (ctx.role !== "owner") {
        violation(name, "grant under a non-owner session", ctx);
        throw Error("evidence_owner_changed");
      }
      const row = rowById(data.findingRowId);
      if (!row || row.project !== data.projectId) {
        violation(name, "grant on a foreign/missing finding", ctx);
        throw Error("evidence_owner_changed");
      }
      if (!eligibleReviewer(data.reviewerId)) throw Error("citation_review_reviewer_ineligible");
      const key = assignKey(data.projectId, data.findingRowId, data.reviewerId);
      // The legacy 4-arg grant ALWAYS CLEARS native consent (frozen SQL :461) — on insert AND reactivation —
      // so it can never resurrect a stale native consent. A separate v2 grant must re-establish it.
      fixture.db.assignments.set(key, { active: true, native: null });
      return citationReviewAssignmentReceiptSchema.parse({
        ownerId: OWNER.id,
        projectId: data.projectId,
        findingRowId: data.findingRowId,
        reviewerId: data.reviewerId,
        active: true,
      });
    }
    case "revokeCitationReviewAssignmentFn": {
      if (ctx.role !== "owner") {
        violation(name, "revoke under a non-owner session", ctx);
        throw Error("evidence_owner_changed");
      }
      const key = assignKey(data.projectId, data.findingRowId, data.reviewerId);
      const prev = fixture.db.assignments.get(key);
      // Deactivate access AND native consent, but preserve receipt history (never erase receipts).
      if (prev)
        fixture.db.assignments.set(key, {
          active: false,
          native: prev.native ? { ...prev.native, active: false } : null,
        });
      return true;
    }
    case "grantCitationReviewNativeAssignmentFn": {
      if (ctx.role !== "owner") {
        violation(name, "native grant under a non-owner session", ctx);
        throw Error("evidence_owner_changed");
      }
      const row = rowById(data.findingRowId);
      if (!row || row.project !== data.projectId) {
        violation(name, "native grant on a foreign/missing finding", ctx);
        throw Error("evidence_owner_changed");
      }
      if (!eligibleReviewer(data.reviewerId)) throw Error("citation_review_reviewer_ineligible");
      // The SQL v2 grant refuses an erased finding (no assignment mutation).
      if (fixture.flags.evidenceErased === true) throw Error("citation_review_native_erased");
      // The digest is NULL for an empty/bare/unresolved set: a reparsed/deleted member cannot be re-granted
      // against the old immutable finding binding (BFR1-01 / prior23).
      const expected = await expectedNativeSetDigest(data.findingRowId);
      assertLive(ctx); // retired during the digest await → NO mutation of the replacement case (prior26)
      if (expected === null) throw Error("citation_review_native_not_bound");
      if (data.nativeSetSha256 !== expected) throw Error("citation_review_native_set_mismatch");
      const key = assignKey(data.projectId, data.findingRowId, data.reviewerId);
      // v2 grant REACTIVATES the assignment (active:true) on insert AND conflict, consistent with its
      // receipt, and binds the consent to the CURRENT authority revisions (R2D02).
      fixture.db.assignments.set(key, { active: true, native: nativeConsentRecord(expected) });
      return citationReviewNativeAssignmentReceiptSchema.parse({
        ownerId: OWNER.id,
        projectId: data.projectId,
        findingRowId: data.findingRowId,
        reviewerId: data.reviewerId,
        active: true,
        nativeScope: "native_v1",
      });
    }

    /* reviewer-only reads / writes */
    case "getCitationFindingForReviewFn":
      if (ctx.role === "owner") violation(name, "owner used a reviewer endpoint", ctx);
      if (!(await reviewerAdmitted(data, ctx))) throw Error("citation_review_unavailable");
      return reviewProjection(data, ctx);
    case "readCitationFindingReviewsFn":
      // The OWNER may read their own finding's review list (no assignment needed, no native-consent gate); a
      // reviewer needs current admission (native consent for a native-bearing finding).
      if (
        ctx.role === "owner" &&
        ctx.actorId === OWNER.id &&
        data.ownerId === OWNER.id &&
        data.projectId === PROJECT &&
        rowById(data.findingRowId)
      )
        return reviewList(data, ctx);
      if (!(await reviewerAdmitted(data, ctx))) throw Error("citation_review_unavailable");
      return reviewList(data, ctx);
    case "saveCitationFindingReviewFn":
      return saveReview(data, ctx);
    case "removeCitationFindingReviewFn":
      return removeReview(data, ctx);

    default:
      violation(name, "unknown transport", ctx);
      throw Error(`Fixture has no synthetic answer for ${name}.`);
  }
}

export async function invoke(name, args) {
  const data = args?.[0]?.data ?? null;
  const ctx = captureCtx(); // capture the request actor/role/generation ONCE, at the call boundary
  fixture.seq += 1;
  const id = `${name}#${fixture.seq}`;
  fixture.calls.push({
    seq: fixture.seq,
    id,
    name,
    data: clone(data),
    actor: ctx.actorId,
    generation: ctx.gen,
  });
  // Track the invocation as in-flight until BOTH its delivery and handler-execution lifetimes settle (below),
  // so inspect.inFlight()/retireCase() see outstanding work even across a deferred hold or a held digest.
  const entry = { id, name, generation: ctx.gen, actor: ctx.actorId };
  fixture.inflight.push(entry);
  const finish = () => {
    const i = fixture.inflight.indexOf(entry);
    if (i >= 0) fixture.inflight.splice(i, 1);
  };
  // Resolve the DELIVERY (what the caller awaits) and EXECUTION (the real handler) lifetimes. For a
  // non-deferred call they coincide; for a deferred COMMIT the handler (entry.committed) can outlive a
  // delivery that retireCase rejects (held in an external digest).
  let delivery;
  let execution;
  const armed = fixture.deferred.get(name);
  if (armed) {
    fixture.deferred.delete(name); // one-shot arm
    ({ delivery, execution } = deferCall(name, data, armed.mode, ctx));
  } else {
    const forced = fixture.failOnce.get(name);
    if (forced) {
      fixture.failOnce.delete(name);
      delivery = Promise.reject(Error(forced));
    } else {
      delivery = Promise.resolve().then(() => dispatch(name, data, ctx));
    }
    execution = delivery;
  }
  // Keep the invocation in-flight until BOTH lifetimes settle (no double-counting), so a deferred commit
  // handler still held in an external digest is not removed when retireCase rejects only the delivery
  // (BFR3-F01). A never-started hold retires immediately (execution === delivery).
  Promise.allSettled([delivery, execution]).then(finish);
  return delivery;
}

/* -------------------------------------------------------------- owner write */

function saveFinding(data, ctx) {
  requireOwner("saveCitationFindingFn", data, ctx);
  const findingId = data.finding.findingId;
  const chain = chainByFindingId(findingId);
  // Scope the logical chain to the exact owner/project (not findingId alone): a foreign-project collision is
  // refused, matching the ledger scoping.
  if (chain && chain[0].project !== data.projectId)
    throw Error("citation_finding_version_conflict");
  const expectedVersion = data.expectedVersion ?? 0;
  const expectedHeadId = data.expectedHeadId ?? null;
  const head = chain ? chain[chain.length - 1] : null;
  const headVersion = head ? head.version : 0;
  const headId = head ? head.id : null;
  const payloadDigest = hex64(
    JSON.stringify([data.scope, data.finding, expectedVersion, expectedHeadId]),
  );
  // The ledger/chain are scoped to the exact owner + project, so two projects never collide and a lost-ack
  // retry is keyed to the complete request identity.
  const ledgerKey = `${data.expectedOwnerId}:${data.projectId}:${findingId}:${expectedVersion}:${expectedHeadId}:${payloadDigest}`;
  // 1) Exact prior committed request (lost-ack retry): return the SAME saved row/version, no second write —
  //    resolved BEFORE re-validating live bindings (an already-committed insert is idempotent).
  const prior = fixture.ledger.get(ledgerKey);
  if (prior) return prior.result;
  // 2) Forced or genuine conflict: wrong expected head id/version (an old pin after reparse/deletion cannot
  //    advance the head).
  if (fixture.flags.saveConflict || expectedVersion !== headVersion || expectedHeadId !== headId)
    throw Error("citation_finding_version_conflict");
  // 3) A NEW insert must have every BOUND native currently RESOLVE in the exact owner/project (SQL BEFORE
  //    INSERT native-binding trigger :465) — a reparsed/deleted/foreign bound artifact rejects atomically
  //    with no head append; bare/legacy refs (no binding) are preserved and skipped.
  for (const e of data.finding.evidence)
    if (
      e.kind === "native" &&
      e.nativeBinding &&
      !nativeBindingResolvesLive(e, data.expectedOwnerId, data.projectId)
    )
      throw Error("citation_native_binding_invalid");
  // 4) Commit a new immutable version with a STABLE id and advance the logical chain head.
  const newVersion = headVersion + 1;
  const record = findingSchema.parse(data.finding);
  const rowId = uuidFromSeed(`row:${data.projectId}:${findingId}:${newVersion}`);
  const row = findingRow(rowId, findingId, newVersion, record);
  row.project = data.projectId;
  row.panelId = data.scope.panelId;
  row.panelVersion = data.scope.panelVersion;
  row.client = data.scope.client;
  row.supersedesId = headId;
  row.createdAt = nowIso();
  fixture.db.findings.set(findingId, [...(chain ?? []), row]);
  const result = { version: newVersion };
  fixture.ledger.set(ledgerKey, { result, rowId });
  // A configured lost acknowledgement rejects AFTER the commit+ledger entry, so the exact retry is idempotent.
  if (fixture.flags.lostAck) {
    fixture.flags.lostAck = false;
    throw Error("network_lost_ack");
  }
  return result;
}

/* ------------------------------------------------------------ reviewer write */

const receiptOf = (r) =>
  citationFindingReviewReceiptSchema.parse({
    id: r.id,
    findingRowId: r.findingRowId,
    findingId: r.findingId,
    findingVersion: r.findingVersion,
    recordSha256: r.recordSha256,
    reviewerId: r.reviewerId,
    reviewerRole: r.reviewerRole,
    decision: r.decision,
    note: r.note,
    inspectionComplete: r.inspectionComplete,
    withdrawn: r.withdrawn,
    createdAt: r.createdAt,
  });
async function saveReview(data, ctx) {
  if (ctx.role === "owner")
    violation("saveCitationFindingReviewFn", "owner submitted a review", ctx);
  // A native-bearing finding needs CURRENT native consent even to save a receipt (the save gate :578).
  if (!(await reviewerAdmitted(data, ctx))) throw Error("citation_review_unavailable");
  assertLive(ctx); // retired during the admission/digest await → no receipt in the replacement case (R2D04)
  // expectedSha must be the CURRENT authorized finding digest; a stale pin is refused and the UI refreshes.
  if (data.expectedSha !== currentDigest(data.findingRowId)) throw Error("citation_review_stale");
  const row = rowById(data.findingRowId);
  const receipts = fixture.db.reviews.get(data.findingRowId) ?? [];
  // The receipt is attributed to the CAPTURED request actor — never a later replacement actor (R2D03).
  const existing = receipts.find((r) => r.reviewerId === ctx.actorId && !r.withdrawn);
  if (existing) {
    // Exact same-pin resubmission is idempotent (same receipt); a changed decision/note at the pin conflicts.
    const same =
      existing.recordSha256 === data.expectedSha &&
      existing.decision === data.decision &&
      (existing.note ?? null) === (data.note ?? null);
    if (same) return receiptOf(existing);
    throw Error("citation_review_conflict");
  }
  // The receipt's inspectionComplete is the SAME whole-set predicate the reviewer view showed.
  const { inspectionComplete } = await computeInspection(data, ctx);
  assertLive(ctx); // and again immediately before the mutation, after the inspection digest await
  const receipt = {
    id: uuidFromSeed(`receipt:${data.findingRowId}:${ctx.actorId}:${receipts.length}`),
    findingRowId: data.findingRowId,
    findingId: row.findingId,
    findingVersion: row.version,
    recordSha256: data.expectedSha,
    reviewerId: ctx.actorId,
    reviewerRole: ctx.role === "editor" ? "editor" : "reviewer",
    decision: data.decision,
    note: data.note ?? null,
    inspectionComplete,
    withdrawn: false,
    withdrawnAt: null,
    createdAt: nowIso(),
  };
  receipts.push(receipt);
  fixture.db.reviews.set(data.findingRowId, receipts);
  return receiptOf(receipt);
}
function removeReview(data, ctx) {
  // Withdrawing one's OWN receipt is permitted WITHOUT a current assignment, but ONLY on the caller's own
  // receipt within the EXACT owner/project scope, and only the exact receipt id (not the finding row id).
  if (data.projectId !== PROJECT || data.ownerId !== OWNER.id) {
    violation("removeCitationFindingReviewFn", "withdrawal on a foreign owner/project scope", ctx);
    throw Error("citation_review_unavailable");
  }
  for (const receipts of fixture.db.reviews.values()) {
    const r = receipts.find((x) => x.id === data.id);
    if (r) {
      if (r.reviewerId !== ctx.actorId) {
        violation("removeCitationFindingReviewFn", "withdrawal of another reviewer's receipt", ctx);
        throw Error("citation_review_unavailable");
      }
      r.withdrawn = true; // history preserved; note/hash masked on read-back
      r.withdrawnAt = nowIso();
      return true;
    }
  }
  throw Error("citation_review_unavailable");
}

/* ----------------------------------------------------------------- controls */

function setActor(which) {
  const who = which === "owner" ? OWNER : which === "reviewer" ? REVIEWER : null;
  fixture.auth = { actorId: who ? who.id : null, role: who ? who.role : fixture.auth.role };
  fixture.epoch += 1;
  fixture.state = { ...fixture.state, userId: fixture.auth.actorId };
  rebuildAuth();
  fixture.emit?.();
}

// Deterministic setup/control/inspect API for the root browser matrix.
fixture.control = {
  setupCase,
  expectedNativeSetDigest, // the digest the native-consent grant will accept (via the REAL helper)
  nativeSetItems,
  setActor,
  signOut() {
    fixture.epoch += 1;
    fixture.auth = { actorId: null, role: fixture.auth.role };
    fixture.state = { ...fixture.state, userId: null, hydrated: false };
    rebuildAuth();
    fixture.emit?.();
  },
  reHydrateSameActor() {
    fixture.epoch += 1;
    fixture.state = { ...fixture.state, hydrated: false };
    rebuildAuth();
    fixture.emit?.();
    const t = setTimeout(() => {
      fixture.epoch += 1;
      fixture.state = { ...fixture.state, hydrated: true };
      rebuildAuth();
      fixture.emit?.();
    }, 0);
    fixture.timers.push(t);
  },
  pauseWorkspace() {
    fixture.epoch += 1;
    fixture.state = { ...fixture.state, hydrated: false };
    rebuildAuth();
    fixture.emit?.();
  },
  resumeWorkspace() {
    fixture.epoch += 1;
    fixture.state = { ...fixture.state, hydrated: true };
    rebuildAuth();
    fixture.emit?.();
  },
  bumpEpoch() {
    fixture.epoch += 1;
    fixture.emit?.();
  },
  switchProject(id) {
    fixture.state = {
      ...fixture.state,
      activeProjectId: id ?? (fixture.state.activeProjectId === PROJECT ? PROJECT2 : PROJECT),
    };
    fixture.emit?.();
  },
  // deferrals & one-shot failures
  defer(name, mode = "commit") {
    fixture.deferred.set(name, { mode });
  },
  undefer(name) {
    fixture.deferred.delete(name);
  },
  failNext(name, code) {
    fixture.failOnce.set(name, code ?? `${name}_failed`);
  },
  async release(filter, how = "ok", code) {
    for (const entry of [...fixture.pending]) {
      if (filter && entry.name !== filter && entry.id !== filter) continue;
      dropPending(entry);
      if (entry.gen !== fixture.gen || entry.settled) continue; // retired/already settled
      entry.settled = true;
      if (how === "fail") {
        entry.reject(Error(code ?? `${entry.name}_failed`));
        continue;
      }
      const outcome =
        entry.mode === "commit"
          ? await entry.committed
          : await captureOutcome(() => dispatch(entry.name, entry.data, entry.ctx));
      if ("ok" in outcome) entry.resolve(outcome.ok);
      else entry.reject(outcome.err);
    }
  },
  setFlag(name, on = true) {
    fixture.flags[name] = on;
  },
  // assignment / consent helpers (owner-controlled in the UI; here for reviewer-first setup)
  grant(rowId, reviewerId = REVIEWER.id, project = PROJECT) {
    const key = assignKey(project, rowId, reviewerId);
    const prev = fixture.db.assignments.get(key);
    fixture.db.assignments.set(key, { active: true, native: prev?.native ?? null });
  },
  async grantNative(rowId, reviewerId = REVIEWER.id, project = PROJECT) {
    // Mirror the v2 grant: reactivate (active:true) and bind the consent to the CURRENT authority revisions.
    const key = assignKey(project, rowId, reviewerId);
    const setSha = await expectedNativeSetDigest(rowId);
    fixture.db.assignments.set(key, {
      active: true,
      native: setSha ? nativeConsentRecord(setSha) : null,
    });
  },
  revoke(rowId, reviewerId = REVIEWER.id, project = PROJECT) {
    fixture.db.assignments.delete(assignKey(project, rowId, reviewerId));
  },
  // Member remove/restore and policy disable/restore bump the live authority revision, so a native consent
  // accepted under the old revision is stale until an explicit fresh grant (SQL NS05 — restore never revives).
  setMemberActive(active, reviewerId = REVIEWER.id) {
    const m = fixture.db.roster.find((x) => x.actorId === reviewerId);
    if (m) m.active = active;
    fixture.db.membershipRevision += 1;
    fixture.emit?.();
  },
  setPolicyMode(mode) {
    fixture.db.policy.mode = mode;
    fixture.db.policyRevision += 1;
    fixture.emit?.();
  },
  // Change an artifact's parsed interpretation digest (a reparse), so a prior full-set consent no longer
  // matches the current binding (changed-member case). Keeps it bindable.
  reparseArtifact(id) {
    const a = artifactById(id);
    if (a && a.parsed) a.parsedSha256 = hex64("parsed:" + id + ":" + Date.now());
  },
  recordClipboard(text) {
    fixture.clipboard.push(text);
  },
  // Coordinated with the driver/entry owner. RETIRE the current generation and settle/reject controlled
  // pending (deferred) work + scheduled timers, while PRESERVING calls/violations/network/db/auth/state for
  // the driver's final snapshot. It does NOT reset traces or create a fresh case (setupCase remains the fresh
  // reset, run only after the driver confirms the old tree unmounted AND no work is outstanding). A
  // retired-generation handler still awaiting an external hold stays visible in inspect.inFlight() and will
  // refuse (fixture_case_retired) on resume — it never silently declares completion or mutates the next case.
  async retireCase() {
    fixture.gen += 1; // any in-flight handler's captured gen is now stale → refused before mutation
    for (const t of fixture.timers.splice(0)) clearTimeout(t);
    let settled = 0;
    for (const entry of [...fixture.pending]) {
      dropPending(entry);
      if (!entry.settled) {
        entry.settled = true;
        entry.reject(Error("fixture_case_retired"));
        settled += 1;
      }
    }
    await Promise.resolve();
    return { generation: fixture.gen, settledPending: settled, inFlight: fixture.inflight.length };
  },
  rows: ROWS,
  ids: {
    owner: OWNER.id,
    reviewer: REVIEWER.id,
    editor: EDITOR.id,
    project: PROJECT,
    project2: PROJECT2,
  },
  artifacts: {
    google: ART_GOOGLE,
    bing: ART_BING,
    unparsed: ART_UNPARSED,
    unbindable: ART_UNBINDABLE,
  },
};

fixture.inspect = {
  calls: () => clone(fixture.calls),
  callsOf: (name) => fixture.calls.filter((c) => c.name === name).length,
  violations: () => clone(fixture.violations),
  clipboard: () => [...fixture.clipboard],
  pending: () =>
    fixture.pending.map((p) => ({ id: p.id, name: p.name, gen: p.gen, actor: p.actor })),
  // Currently-UNSETTLED invocations (incl those awaiting a digest), for the driver to assert no outstanding
  // work before a pass and to snapshot late work at retirement.
  inFlight: () =>
    fixture.inflight.map((e) => ({
      id: e.id,
      name: e.name,
      generation: e.generation,
      actor: e.actor,
    })),
  network: () => window.__miloNetworkAttempts ?? [],
  seedErrors: () => [...fixture.seedErrors],
  ledgerSize: () => fixture.ledger.size,
  findings: () => [...fixture.db.findings.values()].map((v) => v[v.length - 1].id),
  artifacts: () =>
    fixture.db.artifacts.map((a) => ({ id: a.id, parseState: a.parseState, status: a.status })),
  headVersion: (findingId) => {
    const c = chainByFindingId(findingId);
    return c ? c[c.length - 1].version : 0;
  },
};

// Expose the raw transport entry so the driver/smoke can issue a scoped call without the component layer.
fixture.invoke = invoke;

// Initial (interactive) state so the harness can render before driving a case; setupCase replaces it.
fixture.state = seedState();
rebuildAuth();
