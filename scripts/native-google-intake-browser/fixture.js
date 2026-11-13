// Shared in-page fixture state and the synthetic server functions for the native Google intake panel.
// Interpretation is produced by the REAL client-safe parser over the stored bytes, so the preview and
// the persisted report are genuinely derived; only transport/persistence is synthetic. Rows are scoped
// by owner+project and keyed by the real nativeArtifactScopeKey (not a JSON blob), and a new call must
// match the current signed-in actor — a mid-flight (hung) call still finishes in its original scope.
import { parseNativeGoogleReportCsv } from "@/lib/native-google-ai-csv";
import { nativeArtifactScopeKey } from "@/lib/native-ai-artifact";
import { NATIVE_GOOGLE_PARSER_VERSION, fileKindForDimension } from "@/lib/native-google-intake";

const ACTOR = "00000000-0000-4000-8000-0000000000a1";
export const fixture = (window.__nativeIntakeFixture = {
  actorId: ACTOR,
  epoch: 1,
  seq: 0,
  locale: "en",
  calls: [],
  stateAudit: [],
  state: null,
  db: null,
  failReads: false,
  failStage: false,
  hanging: null,
});
export function record(type) {
  fixture.seq += 1;
  if (type.startsWith("store.") || type.startsWith("auth."))
    fixture.stateAudit.push({ seq: fixture.seq, type });
}
const clone = (v) => JSON.parse(JSON.stringify(v));
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
const seedDb = () => ({ artifacts: [] });
const seedState = () => ({
  projects: [
    { id: "p", name: "First project", appLanguage: fixture.locale },
    { id: "q", name: "Second project", appLanguage: fixture.locale },
  ],
  activeProjectId: "p",
  hydrated: true,
  userId: ACTOR,
});
fixture.state = seedState();
fixture.db = seedDb();
fixture.reset = () => {
  fixture.db = seedDb();
  fixture.failReads = false;
  fixture.failStage = false;
  fixture.hanging = null;
};
fixture.signOut = () => {
  fixture.actorId = null;
  fixture.epoch += 1;
  fixture.state = { ...fixture.state, userId: null, hydrated: false };
  fixture.emit();
};
fixture.signIn = () => {
  fixture.actorId = ACTOR;
  fixture.epoch += 1;
  fixture.state = { ...seedState(), activeProjectId: fixture.state.activeProjectId };
  fixture.emit();
};
fixture.reHydrateSameActor = () => {
  fixture.epoch += 1;
  fixture.state = { ...fixture.state, hydrated: false };
  fixture.emit();
  setTimeout(() => {
    fixture.epoch += 1;
    fixture.state = { ...fixture.state, hydrated: true };
    fixture.emit();
  }, 0);
};
// Sustained pause/resume: leaves the session unhydrated until resume is called (unlike the auto-
// resuming re-sign-in), so the hydration gate can be observed.
fixture.pauseWorkspace = () => {
  fixture.epoch += 1;
  fixture.state = { ...fixture.state, hydrated: false };
  fixture.emit();
};
fixture.resumeWorkspace = () => {
  fixture.epoch += 1;
  fixture.state = { ...fixture.state, hydrated: true };
  fixture.emit();
};
fixture.switchProject = (id) => {
  fixture.state = { ...fixture.state, activeProjectId: id };
  fixture.emit();
};
fixture.release = (how) => fixture.hanging?.(how);
const summary = (a) => ({
  id: a.id,
  scopeKey: a.scopeKey,
  sha256: a.sha256,
  byteLength: a.byteLength,
  status: a.status,
  supersedesId: null,
  predecessorDeleted: false,
  metadata: clone(a.metadata),
  createdAt: a.createdAt,
  actorId: a.owner,
});
const readState = (a) => ({
  id: a.id,
  parseState: a.parsed ? "parsed" : "unparsed",
  parserVersion: a.parsed?.parserVersion ?? null,
  completeness: a.parsed?.input.completeness ?? null,
  partial: a.parsed?.partial ?? null,
  withheldPageRows: a.parsed?.withheldPageRows ?? null,
  rowCount: a.parsed ? a.parsed.input.rows.length : null,
  parsedAt: a.parsedAt ?? null,
});
const inScope = (a, data) => a.owner === data.expectedOwnerId && a.project === data.projectId;
async function maybeHang(kind) {
  if (fixture.failStage && kind === "stage") throw Error("native_artifact_unavailable");
  if (fixture.hanging === kind)
    return new Promise((resolve, reject) => {
      fixture.hanging = (how) => {
        fixture.hanging = null;
        if (how === "ok") resolve();
        else reject(Error("native_artifact_unavailable"));
      };
    });
}
async function stage(data) {
  await maybeHang("stage");
  const { metadata, base64 } = data;
  const bytes = b64ToBytes(base64);
  const sha = await sha256Hex(bytes);
  const scopeKey = nativeArtifactScopeKey(metadata);
  const existing = fixture.db.artifacts.find(
    (a) => inScope(a, data) && a.sha256 === sha && a.scopeKey === scopeKey,
  );
  if (existing) return summary(existing);
  const id = `11111111-0000-4000-8000-${String(fixture.db.artifacts.length + 1).padStart(12, "0")}`;
  const row = {
    id,
    owner: data.expectedOwnerId,
    project: data.projectId,
    scopeKey,
    sha256: sha,
    byteLength: bytes.length,
    status: "pending_parser",
    metadata: clone(metadata),
    base64,
    createdAt: new Date().toISOString(),
    parsed: null,
    parsedAt: null,
  };
  fixture.db.artifacts.push(row);
  return summary(row);
}
async function persist(data) {
  await maybeHang("persist");
  const a = fixture.db.artifacts.find((x) => x.id === data.id && inScope(x, data));
  if (!a) throw Error("native_parsed_unavailable");
  const m = a.metadata;
  const file = m.source === "gsc_generative_ai_search" ? fileKindForDimension(m.dimension) : null;
  if (!file) throw Error("native_parsed_unsupported");
  let preview;
  try {
    preview = await parseNativeGoogleReportCsv(file, b64ToBytes(a.base64), {
      declaredProperty: m.declaredProperty,
      period: { start: m.period.start, end: m.period.end, timezone: m.period.timezone ?? "" },
      capturedAt: m.capturedAt,
      completeness: data.completeness,
      filterContext: { filters: m.filters, marketScope: m.marketScope },
      filename: m.filename,
    });
  } catch {
    throw Error("native_parse_failed");
  }
  if (
    preview.input.aggregation !== m.aggregation ||
    preview.input.reportKind !== m.reportKind ||
    preview.input.dimension !== m.dimension
  )
    throw Error("native_parsed_metadata_mismatch");
  const record = {
    artifactId: a.id,
    artifactSha256: a.sha256,
    parserVersion: NATIVE_GOOGLE_PARSER_VERSION,
    file,
    withheldPageRows: preview.withheldPageRows,
    partial: preview.partial,
    limitationNote: data.limitationNote,
    input: preview.input,
  };
  if (a.parsed) {
    if (JSON.stringify(a.parsed) !== JSON.stringify(record)) throw Error("native_parsed_conflict");
  } else {
    a.parsed = record;
    a.parsedAt = new Date().toISOString();
  }
  return {
    id: a.id,
    parseState: "parsed",
    parsed: clone(a.parsed),
    parsedAt: a.parsedAt,
    parsedActorId: a.owner,
  };
}
export async function invoke(name, args) {
  const data = args?.[0]?.data;
  fixture.seq += 1;
  fixture.calls.push({ seq: fixture.seq, name, data: data === undefined ? null : clone(data) });
  // A NEW call must match the currently signed-in actor (the real serverfn's expectedOwnerId ===
  // context.userId). A mid-flight hung call captured its scope at dispatch and still finishes there.
  if (data && data.expectedOwnerId && data.expectedOwnerId !== fixture.actorId)
    throw Error("evidence_owner_changed");
  if (name === "stageNativeArtifactFn") return stage(clone(data));
  if (name === "persistNativeReportFn") return persist(clone(data));
  if (name === "removeNativeArtifactFn") {
    fixture.db.artifacts = fixture.db.artifacts.filter(
      (a) => !(a.id === data.id && inScope(a, data)),
    );
    return true;
  }
  if (name === "readNativeArtifactsFn") {
    if (fixture.failReads) throw Error("native_artifact_unavailable");
    return { artifacts: fixture.db.artifacts.filter((a) => inScope(a, data)).map(summary) };
  }
  if (name === "readNativeReportParseStatesFn") {
    if (fixture.failReads) throw Error("native_artifact_unavailable");
    return { states: fixture.db.artifacts.filter((a) => inScope(a, data)).map(readState) };
  }
  if (name === "readNativeReportParsedFn") {
    if (fixture.failReads) throw Error("native_parsed_unavailable");
    const a = fixture.db.artifacts.find((x) => x.id === data.id && inScope(x, data));
    if (!a) throw Error("native_parsed_unavailable");
    return {
      id: a.id,
      parseState: a.parsed ? "parsed" : "unparsed",
      parsed: a.parsed ? clone(a.parsed) : null,
      parsedAt: a.parsedAt ?? null,
      parsedActorId: a.parsed ? a.owner : null,
    };
  }
  throw Error(`Fixture has no synthetic answer for ${name}.`);
}
