// Native-findings review/authoring fixture. Mounts the ACTUAL NativeGoogleIntakePanel,
// CitationFindingAuthor and CitationReviewPanel (owner AND independent-reviewer modes) and the ACTUAL native
// ReportView, over the synthetic store/auth (store.js, auth.js) and synthetic server functions (fixture.js);
// the network guard in index.html refuses every request, and Supabase/.server.ts imports are refused at
// build time.
//
//   index.html?locale=en|pl|sv|da&surface=workspace|owner-author|owner-review|reviewer|report
//
// Interactive by default. The harness drives it through window.__nativeFindings (control + inspect). This is
// still a FOUNDATION+DRIVER-scaffold: it does not itself assert browser/native-keyboard/390px acceptance —
// the final matrix runs at the root stage against the coherent R3 UI with real controls.
import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NativeGoogleIntakePanel } from "@/components/NativeGoogleIntakePanel";
import { CitationFindingAuthor } from "@/components/CitationFindingAuthor";
import { CitationReviewPanel } from "@/components/CitationReviewPanel";
import { ReportView } from "@/components/NativeGoogleIntakePanel";
import { useAuth } from "./auth.js";
import { useStore } from "./store.js";
import { useT } from "@/i18n";
import { rawCellText } from "@/lib/native-google-intake-ui";
import { nativeArtifactScopeKey } from "@/lib/native-ai-artifact";
import {
  NATIVE_GOOGLE_PARSER_VERSION,
  fileKindForDimension,
  nativeReportParsedRecordSchema,
} from "@/lib/native-google-intake";
import {
  NATIVE_BING_PARSER_VERSION,
  bingFileKindForDimension,
  parseNativeBingReportCsv,
} from "@/lib/native-bing-ai-csv";
import { parseNativeGoogleReportCsv } from "@/lib/native-google-ai-csv";
import { fixture } from "./fixture.js";
import { driver } from "./driver.js";

const params = new URLSearchParams(location.search);
const locale = ["en", "pl", "sv", "da"].includes(params.get("locale"))
  ? params.get("locale")
  : "en";
const SURFACES = ["workspace", "owner-author", "owner-review", "reviewer", "report"];
const initialSurface = SURFACES.includes(params.get("surface"))
  ? params.get("surface")
  : "workspace";

const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

// Committed-unmount proof (BFR1-03): a Sentinel mounted inside the live tree bumps a counter on mount and on
// its effect CLEANUP (which React runs only after it commits the unmount). case() waits for the cleanup
// before resetting, so a retired case's effects are demonstrably torn down first.
let mountCount = 0;
let unmountCount = 0;
function Sentinel() {
  React.useEffect(() => {
    mountCount += 1;
    return () => {
      unmountCount += 1;
    };
  }, []);
  return null;
}

const ui = {
  version: 0,
  surface: initialSurface,
  findingRowId: fixture.control.rows.boundNative,
  client: newQueryClient(),
  clientKey: 0,
  remountKey: 0,
  mounted: true,
  onSaved: 0, // harness-only counter for the author's existing onSaved prop (group 10)
};
const onSaved = () => {
  ui.onSaved += 1;
};
const uiListeners = new Set();
const bump = () => {
  ui.version += 1;
  uiListeners.forEach((fn) => fn());
};
const useUi = () =>
  useSyncExternalStore(
    (fn) => (uiListeners.add(fn), () => uiListeners.delete(fn)),
    () => ui.version,
  );

function setLang(l) {
  try {
    localStorage.removeItem("milo.uiLocale");
  } catch {
    /* storage may be unavailable */
  }
  document.documentElement.lang = l;
}

// Combined owner workspace, matching the route: the real intake panel, the real author and the real owner
// review list share ONE QueryClient and the production-equivalent session/project boundary, so an import or
// delete through the actual intake controls is observable by the author/grant freshness.
function OwnerWorkspace({ user, activeProjectId }) {
  return (
    <div className="space-y-6" key={`${user.id}:${activeProjectId}`}>
      <NativeGoogleIntakePanel projectId={activeProjectId} />
      <CitationFindingAuthor projectId={activeProjectId} ownerId={user.id} onSaved={onSaved} />
      <CitationReviewPanel projectId={activeProjectId} />
    </div>
  );
}

function Surface() {
  const t = useT();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const { user } = useAuth();
  if (ui.surface === "report") return <ReportSurface t={t} />;
  if (ui.surface === "reviewer")
    return (
      <CitationReviewPanel
        projectId={fixture.control.ids.project}
        reviewerContext={{ ownerId: fixture.control.ids.owner, findingRowId: ui.findingRowId }}
      />
    );
  if (!user) return null;
  if (ui.surface === "workspace")
    return <OwnerWorkspace user={user} activeProjectId={activeProjectId} />;
  if (ui.surface === "owner-author")
    return (
      <CitationFindingAuthor projectId={activeProjectId} ownerId={user.id} onSaved={onSaved} />
    );
  if (ui.surface === "owner-review") return <CitationReviewPanel projectId={activeProjectId} />;
  return null;
}

function ReportSurface({ t }) {
  const art = fixture.db.artifacts.find((a) => a.source === "gsc_generative_ai_search" && a.parsed);
  if (!art)
    return <p className="m-2 text-sm text-destructive">No parsed Google artifact seeded.</p>;
  return (
    <ReportView
      view={art.parsed}
      note={art.parsed.limitationNote}
      label={(k) => t("nativeIntake." + k)}
      t={t}
    />
  );
}

function Controls() {
  const btn = (onClick, text) => (
    <button type="button" className="rounded border px-2 py-1" onClick={onClick}>
      {text}
    </button>
  );
  return (
    <div
      className="m-2 flex flex-wrap items-center gap-2 rounded border border-dashed p-2 text-xs"
      data-fixture-controls
    >
      <span className="font-medium">Fixture controls (outside the product):</span>
      Surface:{" "}
      <select
        className="rounded border px-1 py-1"
        value={ui.surface}
        onChange={(e) => {
          ui.surface = e.target.value;
          fixture.control.setActor(e.target.value === "reviewer" ? "reviewer" : "owner");
          bump();
        }}
      >
        {SURFACES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {btn(() => fixture.control.setActor("owner"), "Owner")}
      {btn(() => fixture.control.setActor("reviewer"), "Reviewer")}
      {btn(() => fixture.control.signOut(), "Sign out")}
      {btn(() => fixture.control.reHydrateSameActor(), "Same-actor re-sign-in")}
      {btn(() => fixture.control.pauseWorkspace(), "Pause")}
      {btn(() => fixture.control.resumeWorkspace(), "Resume")}
      {btn(() => fixture.control.switchProject(), "Switch project")}
      {btn(() => window.__nativeFindings.remount(), "Remount (same client)")}
    </div>
  );
}

function Root() {
  useUi();
  if (!ui.mounted) return <div data-fixture-retired />; // between-case: the tree is retired before reset
  return (
    <QueryClientProvider client={ui.client} key={ui.clientKey}>
      <Sentinel />
      <Controls />
      <div key={ui.remountKey}>
        <Surface />
      </div>
    </QueryClientProvider>
  );
}

const root = createRoot(document.getElementById("root"));

// Deterministic setup/control/inspect API for the root browser matrix.
window.__nativeFindings = {
  fixture,
  control: fixture.control,
  inspect: fixture.inspect,
  driver,
  get client() {
    return ui.client;
  },
  // RETIRE the live tree, FAIL-CLOSED. Proves React committed its unmount (Sentinel effect-cleanup ran), then
  // cancels+clears the client (owned here), calls the REQUIRED foundation control.retireCase() (rejects
  // controlled pending work, preserves calls/violations/network/DB/auth), and waits a bounded time for the
  // ACTUAL inspect.inFlight() drain. Any missing API, uncommitted cleanup, thrown error or undrained work is
  // `retireError` and is STICKY (`ui.retireFailure`): no later case may reset or remount until a reload, so
  // the unresolved evidence is never erased. An already-retired tree still reports CURRENT unsettled work.
  async retire() {
    const apis = {
      retireCaseApi: typeof fixture.control.retireCase === "function",
      inFlightApi: typeof fixture.inspect.inFlight === "function",
    };
    const unsettled = () => (apis.inFlightApi ? fixture.inspect.inFlight() : []);
    if (!ui.mounted) {
      const inFlight = unsettled();
      const retireError =
        ui.retireFailure ??
        (!apis.retireCaseApi || !apis.inFlightApi
          ? "required foundation retireCase()/inFlight() API missing"
          : inFlight.length
            ? "in-flight work outstanding on the retired tree: " +
              inFlight.map((e) => e.name).join(", ")
            : null);
      return {
        ...apis,
        already: true,
        committed: !ui.retireFailure,
        drained: apis.inFlightApi && !inFlight.length,
        inFlight,
        retireError,
        generation: fixture.gen ?? null,
      };
    }
    const errors = [];
    if (!apis.retireCaseApi) errors.push("control.retireCase() missing");
    if (!apis.inFlightApi) errors.push("inspect.inFlight() missing");
    const expectUnmounts = mountCount;
    ui.mounted = false;
    bump(); // render the retired placeholder → the old QueryClientProvider subtree unmounts
    let until = Date.now() + 3000;
    while (unmountCount < expectUnmounts && Date.now() < until) await raf();
    const committed = unmountCount >= expectUnmounts;
    if (!committed) errors.push("Sentinel cleanup did not commit (tree not unmounted)");
    const old = ui.client;
    try {
      await old.cancelQueries();
      old.clear();
    } catch (e) {
      errors.push("client cancel/clear threw: " + (e?.message ?? e));
    }
    let retireCase = null;
    if (apis.retireCaseApi) {
      try {
        retireCase = await fixture.control.retireCase();
      } catch (e) {
        errors.push("retireCase threw: " + (e?.message ?? e));
      }
    }
    let inFlight = unsettled();
    until = Date.now() + 3000;
    while (inFlight.length && Date.now() < until) {
      await raf();
      inFlight = unsettled();
    }
    const drained = apis.inFlightApi && inFlight.length === 0;
    if (apis.inFlightApi && !drained)
      errors.push("in-flight work not drained: " + inFlight.map((e) => e.name).join(", "));
    const retireError = errors.length ? errors.join("; ") : null;
    if (retireError) ui.retireFailure = retireError;
    return {
      ...apis,
      committed,
      drained,
      inFlight,
      retireError,
      retireCase,
      generation: fixture.gen ?? null,
    };
  },
  // A fresh INDEPENDENT case. Refuses ({ ok:false }) WITHOUT any reset/remount when a prior retirement failed
  // or this retirement is incomplete. Otherwise: reset the fixture, run the optional pre-mount `seed(fixture)`
  // (valid starting data only — never a tested action), clear the network trace, arm pre-mount deferrals, and
  // mount a brand-new client/tree. The driver snapshots the previous case via retire() BEFORE this reset.
  async case(opts = {}) {
    if (ui.retireFailure)
      return { ok: false, refused: true, reason: "prior retirement failed: " + ui.retireFailure };
    const next = { locale, ...opts };
    const fin = await this.retire();
    if (fin.retireError || !fin.committed || !fin.drained)
      return { ok: false, refused: true, reason: fin.retireError ?? "retirement incomplete" };
    await fixture.control.setupCase(next);
    if (opts.seed) await opts.seed(fixture);
    setLang(next.locale);
    if (window.__miloNetworkAttempts) window.__miloNetworkAttempts.length = 0;
    ui.surface = opts.surface ?? ui.surface;
    ui.findingRowId = opts.findingRowId ?? fixture.control.rows.boundNative;
    ui.onSaved = 0;
    if (ui.surface === "reviewer" || opts.actor === "reviewer")
      fixture.control.setActor("reviewer");
    // Arm deferrals BEFORE the mount so a surface's FIRST authorized read is held (group 7/11 pending-read).
    for (const n of opts.deferBeforeMount ?? []) fixture.control.defer(n);
    ui.client = newQueryClient();
    ui.clientKey += 1;
    ui.remountKey = 0;
    ui.mounted = true;
    bump();
    await raf(); // let the fresh tree mount before the caller interacts
    return { ok: true, generation: fixture.gen ?? null };
  },
  // Teardown evidence (BFR1-03): the root can read these to confirm each case retired its predecessor.
  get teardownCounts() {
    return { mountCount, unmountCount };
  },
  // How many times the author's onSaved callback fired in this case (harness counter, no product hook).
  get onSavedCount() {
    return ui.onSaved;
  },
  surface(name, findingRowId) {
    ui.surface = name;
    if (findingRowId) ui.findingRowId = findingRowId;
    if (name === "reviewer") fixture.control.setActor("reviewer");
    bump();
  },
  // WITHIN a case: keep the SAME QueryClient but remount the surface subtree (re-open the reviewer link).
  remount() {
    ui.remountKey += 1;
    bump();
  },
  render() {
    root.render(<Root />);
  },
};
// Seed one stored artifact from synthetic CSV through the REAL parser + record schema, shaped exactly like the
// fixture's own seeded artifacts (valid starting data for groups 6/8; never a tested intake action).
const te = new TextEncoder();
const hex = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
async function seedArtifact(fx, { id, metadata, csv, completeness = "partial", note = "" }) {
  const bytes = te.encode(csv);
  const google = metadata.source === "gsc_generative_ai_search";
  const file = google
    ? fileKindForDimension(metadata.dimension)
    : bingFileKindForDimension(metadata.dimension);
  const period = { start: metadata.period.start, end: metadata.period.end };
  const common = { declaredProperty: metadata.declaredProperty, capturedAt: metadata.capturedAt };
  const preview = google
    ? await parseNativeGoogleReportCsv(file, bytes, {
        ...common,
        period: { ...period, timezone: metadata.period.timezone ?? "" },
        completeness,
        filterContext: { filters: metadata.filters, marketScope: metadata.marketScope },
        filename: metadata.filename,
      })
    : await parseNativeBingReportCsv(file, bytes, {
        ...common,
        period,
        completeness,
        filename: metadata.filename,
      });
  const parsed = nativeReportParsedRecordSchema.parse({
    artifactId: id,
    artifactSha256: preview.input.artifact.sha256,
    parserVersion: google ? NATIVE_GOOGLE_PARSER_VERSION : NATIVE_BING_PARSER_VERSION,
    file,
    withheldPageRows: preview.withheldPageRows,
    partial: preview.partial,
    limitationNote: note,
    input: preview.input,
  });
  const row = {
    id,
    owner: fx.control.ids.owner,
    project: fx.control.ids.project,
    source: metadata.source,
    metadata: {
      ...metadata,
      reportKind: parsed.input.reportKind,
      dimension: parsed.input.dimension,
      aggregation: parsed.input.aggregation,
    },
    base64: btoa(String.fromCharCode(...bytes)),
    byteLength: bytes.length,
    rawSha256: preview.input.artifact.sha256,
    scopeKey: nativeArtifactScopeKey(metadata),
    status: "pending_parser",
    parseState: "parsed",
    parsed,
    parsedSha256: await hex(te.encode("parsed:" + id)), // opaque synthetic digest, like the fixture's
    parsedAt: "2026-11-13T09:05:00.000Z",
    bindable: true,
    createdAt: "2026-11-13T09:00:00.000Z",
    supersedesId: null,
    predecessorDeleted: false,
  };
  fx.db.artifacts.push(row);
  return row;
}
// Actual product helpers the driver needs (the driver itself imports only i18n).
window.__nativeFindingsProduct = { rawCellText, nativeArtifactScopeKey, seedArtifact };
// Copy writes to a LOCAL recorder only (the browser clipboard is outside the product; nothing leaves the page).
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (text) => fixture.control.recordClipboard(text) },
});

(async () => {
  setLang(locale);
  await fixture.control.setupCase({
    locale,
    actor: initialSurface === "reviewer" ? "reviewer" : "owner",
  });
  root.render(<Root />);
  // `?driver=1`: identity gate → negative self-checks → the stable per-cell journeys at the CURRENT viewport →
  // the EN race journeys → #results + window.__nativeFindingsDriver. A mismatched/absent bundle identity or a
  // failed self-check HALTS before any journey; an incomplete retirement halts the following ones. The ROOT
  // resizes the real browser per cell and calls `driver.runCell({ locale, width, height })`. Not acceptance.
  if (params.get("driver") === "1") {
    await raf();
    const buildIdentity = driver.buildIdentity(); // executed-bundle id must match the HTML's expected id
    const size = { locale, width: window.innerWidth, height: window.innerHeight };
    let selfCheck = null;
    let cell = null;
    let races = null;
    let halted = null;
    if (!buildIdentity.match) halted = "executed bundle identity mismatch/absent: no case run";
    else if (!(selfCheck = await driver.selfCheck()).ok)
      halted = "self-check failed: no journey run";
    else if ((cell = await driver.runCell(size)).halted) halted = "cell halted: " + cell.halted;
    else races = await driver.runRaces(size);
    window.__nativeFindingsDriver = {
      ...(window.__nativeFindingsDriver ?? {}),
      buildIdentity,
      halted,
      selfCheck,
      cell,
      races,
      teardownCounts: window.__nativeFindings.teardownCounts,
    };
    const el = document.getElementById("results");
    if (el) el.textContent = JSON.stringify(window.__nativeFindingsDriver, null, 2);
  }
})();
