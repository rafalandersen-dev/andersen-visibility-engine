// Interactive acceptance DRIVER for the native-findings fixture. It drives the ACTUAL author / owner-review /
// reviewer / intake controls through real React/DOM event paths and asserts, for each case, BOTH a visible
// outcome AND the expected transport/payload/effect (via the fixture inspect API and the synthetic DB), plus the
// everyCase invariants: a fail-closed retirement (committed unmount, required foundation APIs, actual drain),
// an unconditional post-boundary snapshot, zero unexpected network/violations (exact-count named refusals only),
// zero owner-only reads in a reviewer phase, no unreleased holds and no late calls.
//
// Honesty: this exercises the actual components; the ROOT executes it in a real browser. A missing, disabled or
// renamed control is a FAILURE, never a silent skip or a hand-set pass. The action under test always goes through
// product controls; fixture setup only seeds valid starting data (case `seed`) and controls timing/failures and
// external changes. Stage R4B covers the scripted part of all 14 groups; see README "Stage status".
//
// Selectors are reconciled against the actual UI: the reviewer ReportView has NO product hook — it is the actual
// `div.space-y-2.text-sm` whose first `p.font-medium` is the localized native source label and which contains a
// `<ul>` of row `<li>`; the intake Delete opens an inline `div[role=alert]` (not a dialog) whose own Delete
// confirms. Literal labels resolve per locale via `translate`.
import { translate } from "@/i18n";
import { fixture } from "./fixture.js";

const api = () => window.__nativeFindings;
const control = () => fixture.control;
const inspect = () => fixture.inspect;
const db = () => fixture.db;
// Actual product helpers exposed by entry.jsx (kept out of this module's imports).
const product = () => window.__nativeFindingsProduct;

/* ------------------------------------------------------------ interaction harness */

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const raf2 = async () => {
  await raf();
  await raf();
};
class Failed extends Error {}
async function waitFor(fn, what, ms = 4000) {
  const until = Date.now() + ms;
  for (;;) {
    let v;
    try {
      v = fn();
    } catch {
      v = undefined;
    }
    if (v) return v;
    if (Date.now() > until) throw new Failed(`control/outcome not found: ${what}`);
    await tick();
  }
}
function assert(cond, msg) {
  if (!cond) throw new Failed(msg);
}
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const short = (id) => String(id).slice(-6);
const clone = (v) => JSON.parse(JSON.stringify(v));
// Key-order-insensitive deep equality (payload vs stored rows vs seeds).
const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canon(v[k])]),
        )
      : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// Real React-compatible setters (native select/inputs need the prototype setter + events).
function setNativeValue(el, value) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function setFile(el, file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  el.files = dt.files;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
const csvFile = (name, body) => new File([body], name, { type: "text/csv" });
const clickEl = (el) => {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
};
const setCheckbox = (el, checked) => {
  if (el.checked !== checked) clickEl(el);
};
const enabled = (el) => !!el && el.isConnected && !el.matches(":disabled");
const enabledEl = (el) => (enabled(el) ? el : null);
// Wait until the control exists AND is enabled, then activate it (a click on a disabled control does nothing).
async function clickEnabled(find, what, ms) {
  const el = await waitFor(() => enabledEl(find()), `${what} (enabled)`, ms);
  clickEl(el);
  return el;
}
const root = () => document.getElementById("root");
// Product-only scope: everything under #root EXCEPT the fixture controls block.
const productNodes = (sel) =>
  [...(root()?.querySelectorAll(sel) ?? [])].filter((n) => !n.closest("[data-fixture-controls]"));
const byText = (text, sel = "button") =>
  productNodes(sel).find((n) => norm(n.textContent) === text);
const containsText = (text, sel = "*") =>
  productNodes(sel).find((n) => n.textContent.includes(text));
const within = (node, sel) => [...(node?.querySelectorAll(sel) ?? [])];
// A form field whose label's FIRST text node is exactly `text` (the house `<label>{text}<input/></label>`).
const labelledIn = (scope, text) =>
  within(scope, "label")
    .find((l) => l.childNodes[0]?.textContent?.trim() === text)
    ?.querySelector("input,select,textarea");

// House Select (Radix): open the ENABLED trigger by its exact aria-label, choose the EXACT option text inside the
// ACTIVE popup only, and wait until the popup closed and the trigger shows the selection.
async function chooseRadixOption(ctx, ariaLabel, optionText) {
  const trigger = await waitFor(
    () =>
      enabledEl(
        productNodes("button[role=combobox]").find(
          (b) => b.getAttribute("aria-label") === ariaLabel,
        ),
      ),
    `enabled select "${ariaLabel}"`,
  );
  clickEl(trigger);
  const listbox = await waitFor(
    () =>
      [...document.querySelectorAll("[role=listbox]")].find(
        (l) => l.isConnected && l.getAttribute("data-state") !== "closed",
      ),
    `open popup for "${ariaLabel}"`,
  );
  const opt = await waitFor(
    () =>
      within(listbox, "[role=option]").find(
        (o) => norm(o.textContent) === optionText && o.getAttribute("data-disabled") == null,
      ),
    `exact option "${optionText}" in the active popup`,
  );
  clickEl(opt);
  await waitFor(
    () => !listbox.isConnected || listbox.getAttribute("data-state") === "closed",
    `popup for "${ariaLabel}" closed`,
  );
  await waitFor(() => norm(trigger.textContent) === optionText, `"${optionText}" selected`);
  return trigger;
}

// The ACTUAL ReportView (author, consent disclosure, intake and reviewer): a `div.space-y-2.text-sm` whose first
// `p.font-medium` is a localized native source label and which contains a `<ul>` of rows. No product data-hook is
// used or added; the reviewer has none. The RawAudit <details>/<pre> JSON is excluded (no such labelled <p>).
function reportViewsIn(ctx, scope) {
  const labels = new Set([
    ctx.t("nativeIntake.nativeLabel.gsc"),
    ctx.t("nativeIntake.nativeLabel.bing"),
  ]);
  return within(scope, "div.space-y-2.text-sm").filter((d) => {
    const firstP = d.querySelector(":scope > p.font-medium");
    return (
      !d.closest("[data-fixture-controls]") &&
      !!firstP &&
      labels.has(norm(firstP.textContent)) &&
      !!d.querySelector(":scope > ul")
    );
  });
}
const reportViews = (ctx) => reportViewsIn(ctx, root());
const reportSourceLabel = (d) => norm(d?.querySelector(":scope > p.font-medium")?.textContent);
const reportRows = (d) => within(d, ":scope > ul > li").map((li) => norm(li.textContent));
const reportText = (d) => norm(d?.textContent);

// The exact row text the ReportView must render for EVERY retained row/cell/status of a parsed record, built
// from the record with the product's own rawCellText and the localized labels.
function expectedRows(ctx, parsed) {
  const L = (k) => ctx.t("nativeIntake." + k);
  const rows = parsed.input.rows;
  const metrics = rows.length ? Object.keys(rows[0].cells) : [];
  return rows.map((row) =>
    norm(
      row.key +
        metrics
          .map((m) => {
            const c = row.cells[m];
            return ` · ${L("metric." + m)} ${L("rawCellLabel")}: ${product().rawCellText(c.raw)} · ${L("interpretedStatusHeading")}: ${L("cell." + c.status)}${c.value !== null ? ` (${c.value})` : ""}`;
          })
          .join(""),
    ),
  );
}
// Full-material check of one rendered report against its parsed record: source, EVERY row/cell/status (incl the
// last), row count, window/timezone/captured/property/aggregation/completeness, scope, partial/withheld, note.
function checkReport(ctx, d, parsed, what) {
  const L = (k) => ctx.t("nativeIntake." + k);
  const t = (k, v) => norm(ctx.t("nativeIntake." + k, v));
  const inp = parsed.input;
  const src = inp.source === "bing_ai_performance" ? "bing" : "gsc";
  const txt = reportText(d);
  const exp = expectedRows(ctx, parsed);
  ctx.step(
    `${what}: rendered as the actual ${src} ReportView`,
    !!d && reportSourceLabel(d) === L("nativeLabel." + src),
  );
  ctx.step(
    `${what}: every retained row/cell/status equals the parsed report (${exp.length} rows incl the last)`,
    same(reportRows(d), exp),
  );
  const country = inp.filters["Country"] ?? inp.marketScope.country ?? null;
  const meta = [
    t("rowsHeading", { count: inp.rows.length }),
    t("windowLabel", { start: inp.period.start, end: inp.period.end }),
    inp.period.timezone ? t("timezoneLabel", { tz: inp.period.timezone }) : L("timezoneUnknown"),
    norm(`${L("capturedAtLabel")}: ${inp.capturedAt}`),
    t("propertyHeading", { property: inp.declaredProperty }),
    t("aggregationLabel", {
      aggregation: L("aggregation." + inp.aggregation),
      reportKind: L("reportKind." + inp.reportKind),
    }),
    norm(`${L("completenessShow")}: ${L("completeness." + inp.completeness)}`),
    country ? t("countryFilter", { country }) : L("scopeUnsegmented"),
  ];
  ctx.step(
    `${what}: window/timezone/captured/property/aggregation/completeness/scope shown`,
    meta.every((m) => txt.includes(m)),
  );
  const partialText = t("partialWarn", { count: parsed.withheldPageRows });
  ctx.step(
    `${what}: partial/withheld state honest (${parsed.partial ? "withheld count shown" : "not partial"})`,
    parsed.partial ? txt.includes(partialText) : !txt.includes(partialText),
  );
  const noteText = norm(`${L("limitationShow")}: ${parsed.limitationNote}`);
  ctx.step(
    `${what}: limitation note ${parsed.limitationNote ? "shown verbatim" : "absent"}`,
    parsed.limitationNote ? txt.includes(noteText) : !txt.includes(norm(L("limitationShow") + ":")),
  );
}

/* --------------------------------------------------------------- case scaffolding */

const OWNER_ONLY = new Set([
  "readCitationProtocolFn",
  "readAnswerEvidenceFn",
  "readProjectKnowledgeFn",
  "readCitationBusinessFactsFn",
  "readCitationFindingsFn",
  "getCitationFindingFn",
  "readNativeArtifactsFn",
  "readNativeReportParseStatesFn",
  "readNativeReportParsedFn",
  "readNativeReportBindingFn",
  "readProjectTeamRosterFn",
  "readOwnerTeamPolicyFn",
  "stageNativeArtifactFn",
  "persistNativeReportFn",
  "removeNativeArtifactFn",
  "saveCitationFindingFn",
  "grantCitationReviewAssignmentFn",
  "revokeCitationReviewAssignmentFn",
  "grantCitationReviewNativeAssignmentFn",
]);
const MUTATIONS = /save|grant|revoke|remove|stage|persist/i;
const compact = (c) => ({
  seq: c.seq,
  name: c.name,
  actor: c.actor,
  generation: c.generation ?? null,
  id: c.data?.id ?? c.data?.findingRowId ?? null,
});
const take = (fn, dflt) => {
  try {
    return fn();
  } catch {
    return dflt;
  }
};
// Settled = every unsettled invocation is a deliberately HELD deferral (twice in a row) — an actual drain
// observation, never a fixed sleep.
async function quiet(what, ms = 4000) {
  let calm = 0;
  await waitFor(
    () => {
      const held = new Set(
        inspect()
          .pending()
          .map((p) => p.id),
      );
      calm = inspect()
        .inFlight()
        .every((e) => held.has(e.id))
        ? calm + 1
        : 0;
      return calm >= 2;
    },
    `settled: ${what}`,
    ms,
  );
}

// One recorded case. Setup: entry case() (refuses without reset if a prior retirement failed). Body: real
// controls. FINISH, whatever the verdict: holds left by the body fail it (release explicitly), then the
// fail-closed entry retire(), then an UNCONDITIONAL snapshot (calls/counts/violations/network/inFlight/generation)
// even if retirement threw. Every invariant miss is collected into the phase (none short-circuits another).
// `retirementComplete` is false unless committed unmount + required APIs + zero inFlight + no retire error;
// runCell/runRaces stop on it so the next case cannot reset away the evidence.
async function runCase(name, cell, opts, body) {
  const rec = {
    name,
    locale: cell.locale,
    viewport: cell.viewport,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    status: "not-run",
    phase: null,
    assertions: [],
    transports: 0,
    mutations: 0,
    network: 0,
    violations: 0,
    violationNames: [],
    trace: [],
    lateCalls: [],
    holdsAtEnd: [],
    inFlightAfter: null,
    generation: null,
    actor: null,
    teardown: null,
    retirementComplete: false,
    marks: [], // in-case transport snapshots (e.g. the retirement boundary of a race)
  };
  const reviewerPhase = opts.surface === "reviewer";
  const ctx = {
    cell,
    expected: new Map(), // violation name -> EXACT allowed count (exactly these, exactly this many)
    t: (k, v) => translate(cell.locale, k, v),
    step(desc, ok) {
      rec.assertions.push({ desc, ok: !!ok });
      if (!ok) throw new Failed(desc);
    },
    expect(nameV, count = 1) {
      ctx.expected.set(nameV, count);
    },
    calls: () => inspect().calls(),
    countOf: (n) =>
      inspect()
        .calls()
        .filter((c) => c.name === n).length,
    // Snapshot the transport sequence + unsettled work at a boundary; returns the boundary seq.
    mark(label) {
      const calls = inspect().calls();
      const seq = calls.length ? calls[calls.length - 1].seq : 0;
      rec.marks.push({
        label,
        seq,
        trace: calls.map(compact),
        inFlight: inspect()
          .inFlight()
          .map((e) => e.name),
      });
      return seq;
    },
  };
  let setupOk = false;
  try {
    const res = await api().case({ locale: cell.locale, ...opts });
    if (res && res.ok === false) throw new Failed("case setup refused: " + res.reason);
    setupOk = true;
    await raf2();
    await quiet("startup reads");
    await body(ctx);
    rec.status = "passed";
  } catch (e) {
    rec.status = "failed";
    rec.phase = String(e?.message ?? e);
  }
  const problems = [];
  rec.holdsAtEnd = take(
    () =>
      inspect()
        .pending()
        .map((p) => p.name),
    [],
  );
  rec.openHarnessHolds = openHarnessHolds; // external (non-fixture) holds, e.g. a held client digest
  if (openHarnessHolds)
    problems.push(`open harness digest hold(s) at case end: ${openHarnessHolds}`);
  if (setupOk && rec.holdsAtEnd.length)
    problems.push(
      `unreleased holds at case end (release explicitly): ${rec.holdsAtEnd.join(", ")}`,
    );
  const beforeRetire = take(() => inspect().calls().length, 0);
  let fin = null;
  try {
    fin = await api().retire();
  } catch (e) {
    problems.push("retirement threw: " + String(e?.message ?? e));
  }
  // Unconditional snapshot AFTER the boundary.
  const calls = take(() => inspect().calls(), []);
  const violations = take(() => inspect().violations(), []);
  rec.transports = calls.length;
  rec.mutations = calls.filter((c) => MUTATIONS.test(c.name)).length;
  rec.network = take(() => inspect().network().length, null);
  rec.violations = violations.length;
  rec.violationNames = violations.map((v) => v.name);
  rec.trace = calls.map(compact);
  rec.lateCalls = calls.slice(beforeRetire).map((c) => c.name);
  rec.inFlightAfter = take(
    () =>
      inspect()
        .inFlight()
        .map((e) => e.name),
    null,
  );
  rec.generation = take(() => fixture.gen ?? null, null);
  rec.actor = take(() => fixture.auth?.actorId ?? null, null);
  rec.teardown = fin && {
    committed: fin.committed,
    already: !!fin.already,
    retireCaseApi: fin.retireCaseApi,
    inFlightApi: fin.inFlightApi,
    drained: fin.drained ?? null,
    retireError: fin.retireError ?? fin.retireNote ?? null,
    generation: fin.generation ?? null,
  };
  if (fin) {
    if (fin.committed !== true) problems.push("tree did not commit its unmount at retirement");
    if (fin.retireCaseApi !== true || fin.inFlightApi !== true)
      problems.push("required foundation retireCase()/inFlight() API missing");
    if (fin.retireError || fin.retireNote)
      problems.push("retirement error: " + (fin.retireError ?? fin.retireNote));
  }
  if (!Array.isArray(rec.inFlightAfter))
    problems.push("inspect.inFlight() unavailable: drain cannot be proven");
  else if (rec.inFlightAfter.length)
    problems.push(`outstanding in-flight work after retirement: ${rec.inFlightAfter.join(", ")}`);
  // No exemption by expected-refusal name: any call after the boundary is late.
  if (rec.lateCalls.length)
    problems.push(`late calls after the retirement boundary: ${rec.lateCalls.join(", ")}`);
  if (setupOk) {
    if (rec.network !== 0) problems.push(`unexpected network attempts: ${rec.network}`);
    const counts = {};
    for (const v of violations) counts[v.name] = (counts[v.name] ?? 0) + 1;
    for (const [n, c] of ctx.expected)
      if (counts[n] !== c)
        problems.push(`expected exactly ${c} ${n} refusal(s), saw ${counts[n] ?? 0}`);
    const unexpected = violations.filter((v) => !ctx.expected.has(v.name));
    if (unexpected.length)
      problems.push(`unexpected violations: ${unexpected.map((v) => v.name).join(", ")}`);
    if (reviewerPhase) {
      const ownerReads = calls.filter((c) => OWNER_ONLY.has(c.name));
      if (ownerReads.length)
        problems.push(
          `reviewer phase issued owner-only reads: ${ownerReads.map((c) => c.name).join(", ")}`,
        );
    }
  }
  rec.retirementComplete =
    !!fin &&
    fin.committed === true &&
    fin.retireCaseApi === true &&
    fin.inFlightApi === true &&
    !fin.retireError &&
    !fin.retireNote &&
    Array.isArray(rec.inFlightAfter) &&
    rec.inFlightAfter.length === 0 &&
    rec.openHarnessHolds === 0; // a leaked external hold must also halt the sequence
  if (problems.length) {
    rec.status = "failed";
    rec.phase = (rec.phase ? rec.phase + " | " : "") + "finish: " + problems.join("; ");
  }
  publish(rec);
  return rec;
}

/* ---------------------------------------------------- shared control helpers */

const lastSeq = (ctx) => {
  const c = ctx.calls();
  return c.length ? c[c.length - 1].seq : 0;
};
const callsAfter = (ctx, seq, name) =>
  ctx.calls().filter((c) => c.seq > seq && (!name || c.name === name));
// Synthetic DB inspection (effects only; never used to perform an action).
const artifactOf = (id) => db().artifacts.find((a) => a.id === id) ?? null;
const bindingOfArtifact = (a) => ({
  rawSha256: a.rawSha256,
  source: a.source,
  parserVersion: a.parsed.parserVersion,
  parsedSha256: a.parsedSha256,
});
const chainOf = (findingId) => db().findings.get(findingId) ?? [];
function rowOf(rowId) {
  for (const c of db().findings.values()) {
    const r = c.find((x) => x.id === rowId);
    if (r) return r;
  }
  return null;
}

// The author section (h3 title) — every author lookup is scoped to it, so the intake/review panels sharing the
// workspace can never satisfy an author selector.
const authorSection = (ctx) =>
  productNodes("section").find(
    (s) =>
      norm(s.querySelector(":scope > header > h3")?.textContent) ===
      ctx.t("citationAuthoring.author.title"),
  );
const authorReady = (ctx) => authorSection(ctx);
const inAuthor = (ctx, sel) => within(authorSection(ctx), sel);
const authorButton = (ctx, text) =>
  inAuthor(ctx, "button").find((b) => norm(b.textContent) === text);
const reviewBtn = (ctx) => authorButton(ctx, ctx.t("citationAuthoring.author.review"));
const saveLabel = (ctx, version) => ctx.t("citationAuthoring.author.save", { version });
const savedNotice = (ctx, version) =>
  inAuthor(ctx, "p").find(
    (p) => norm(p.textContent) === norm(ctx.t("citationAuthoring.author.saved", { version })),
  );
const newFindingButton = (ctx, family) =>
  authorButton(
    ctx,
    `${ctx.t("citationAuthoring.author.new")} · ${ctx.t(`citationReview.family.${family}`)}`,
  );
const addNativeSelect = (ctx) =>
  inAuthor(ctx, "select").find(
    (s) => s.getAttribute("aria-label") === ctx.t("nativeIntake.bind.addLabel"),
  );
function observationTextarea(ctx) {
  const lbl = inAuthor(ctx, "label").find((l) =>
    l.textContent.includes(ctx.t("citationAuthoring.author.observation")),
  );
  return lbl?.querySelector("textarea");
}
const refNode = (id) => root()?.querySelector(`[data-native-ref="${id}"]`);
const citedRefIds = () =>
  within(root(), "[data-native-ref]").map((n) => n.getAttribute("data-native-ref"));
const refButton = (ctx, id, key) =>
  within(refNode(id), "button").find((b) => norm(b.textContent) === ctx.t(key));
const hasMaterial = (id) => refNode(id)?.getAttribute("data-native-material") === "true";
function pairedReads(ctx, seq, id, what) {
  const n = (fn) => callsAfter(ctx, seq, fn).filter((c) => c.data.id === id).length;
  ctx.step(
    `${what} ${short(id)}: exactly one paired binding + parsed read`,
    n("readNativeReportBindingFn") === 1 && n("readNativeReportParsedFn") === 1,
  );
}
// Cite a saved native via the REAL add-select + "Cite with current material" (writes the current binding).
async function citeNative(ctx, id) {
  const sel = await waitFor(
    () =>
      enabledEl(addNativeSelect(ctx)) &&
      within(addNativeSelect(ctx), "option").some((o) => o.value === id) &&
      addNativeSelect(ctx),
    `native add-select offering ${short(id)}`,
  );
  setNativeValue(sel, id);
  await raf2();
  const seq = lastSeq(ctx);
  await clickEnabled(
    () => authorButton(ctx, ctx.t("nativeIntake.bind.cite")),
    "Cite with current material",
  );
  await waitFor(
    () => refNode(id)?.getAttribute("data-native-bound") === "true" && hasMaterial(id),
    `native ${short(id)} bound with its material`,
  );
  pairedReads(ctx, seq, id, "cite");
}
// READ-ONLY View of an existing bound ref on this mount (the stored pin must equal the current binding).
async function viewBound(ctx, id) {
  ctx.step(
    `bound ref ${short(id)} shows no material before its View on this mount`,
    !hasMaterial(id),
  );
  const seq = lastSeq(ctx);
  await clickEnabled(() => refButton(ctx, id, "nativeIntake.view"), `View report ${short(id)}`);
  await waitFor(() => hasMaterial(id), `material for ${short(id)} after View`);
  pairedReads(ctx, seq, id, "View");
}
const editPicker = (ctx) => {
  const lbl = inAuthor(ctx, "label").find(
    (l) =>
      norm(l.querySelector(":scope > span")?.textContent) ===
      ctx.t("citationAuthoring.author.editExisting"),
  );
  return lbl ? { select: lbl.querySelector("select"), button: lbl.querySelector("button") } : null;
};
// Open an EXACT row through the real author edit picker (its <option value> is the row id) and prove the detail
// read targeted that row.
async function startEdit(ctx, rowId) {
  const p = await waitFor(
    () => {
      const x = editPicker(ctx);
      return x && enabled(x.select) && within(x.select, "option").some((o) => o.value === rowId)
        ? x
        : null;
    },
    `author edit picker offering row ${short(rowId)}`,
  );
  setNativeValue(p.select, rowId);
  await raf2();
  const seq = lastSeq(ctx);
  await clickEnabled(() => editPicker(ctx)?.button, "Edit existing");
  await waitFor(
    () => callsAfter(ctx, seq, "getCitationFindingFn").some((c) => c.data.id === rowId),
    `detail read for row ${short(rowId)}`,
  );
  await waitFor(() => observationTextarea(ctx), "edit form open");
  await quiet("edit detail read");
}
async function setObservation(ctx, text) {
  setNativeValue(await waitFor(() => observationTextarea(ctx), "observation"), text);
  await raf2();
}
const clickReview = (ctx) => clickEnabled(() => reviewBtn(ctx), "Review");
const savesIn = (ctx) => ctx.calls().filter((c) => c.name === "saveCitationFindingFn");
// Review → enabled Save v{n} → the EXACT saved notice; returns the single save request payload.
async function reviewAndSave(ctx, version) {
  await clickReview(ctx);
  const save = await waitFor(
    () => enabledEl(authorButton(ctx, saveLabel(ctx, version))),
    `Save v${version} (enabled)`,
  );
  const before = savesIn(ctx).length;
  clickEl(save);
  await waitFor(() => savedNotice(ctx, version), `exact "saved as version ${version}" notice`);
  await quiet("post-save refetch");
  const saves = savesIn(ctx).slice(before);
  ctx.step(
    `Save v${version}: exactly one save request and the exact saved notice`,
    saves.length === 1,
  );
  return saves[0].data;
}
const requiredAuthorTargets = (ctx) =>
  [
    ...inAuthor(ctx, "[data-native-ref] button"),
    addNativeSelect(ctx),
    authorButton(ctx, ctx.t("nativeIntake.bind.cite")),
    reviewBtn(ctx),
    authorButton(ctx, ctx.t("citationAuthoring.common.cancel")),
    observationTextarea(ctx),
  ].filter(Boolean);

// Owner review (CitationReviewPanel owner mode): its root holds the owner intro.
const ownerReviewRoot = (ctx) =>
  productNodes("p").find(
    (p) => norm(p.textContent) === norm(ctx.t("nativeIntake.review.ownerIntro")),
  )?.parentElement;
// The owner opens a SPECIFIC finding row with ONE click on its own row button (the list renders the server's
// head order), PROVEN by the detail read's traced id. `arm` (a timing control) runs just before that click, so
// a held/failed read can only belong to this row's mount.
async function openOwnerFinding(ctx, rowId, arm) {
  const label = ctx.t("citationReview.owner.openFinding", {
    family: ctx.t(`citationReview.family.${rowOf(rowId).family}`),
  });
  const heads = [...db().findings.values()]
    .map((c) => c[c.length - 1])
    .filter((h) => h.project === fixture.state.activeProjectId);
  const buttons = await waitFor(() => {
    // The finding LIST rows only (`ul > li > button`); an opened detail's house Select triggers also carry
    // aria-expanded but live outside the list.
    const b = within(ownerReviewRoot(ctx), ":scope > ul > li > button[aria-expanded]");
    return b.length === heads.length ? b : null;
  }, "owner finding row buttons");
  // Collapse any open row first, so the target is always (re)opened by its own click → fresh detail.
  for (const open of buttons.filter((x) => x.getAttribute("aria-expanded") === "true")) {
    clickEl(open);
    await waitFor(() => open.getAttribute("aria-expanded") === "false", "open row collapsed");
  }
  const b = buttons[heads.findIndex((h) => h.id === rowId)];
  if (!b || b.getAttribute("aria-label") !== label)
    throw new Failed(`owner finding row ${rowId} has no matching row button`);
  arm?.();
  const seq = lastSeq(ctx);
  clickEl(b);
  const detail = await waitFor(
    () => callsAfter(ctx, seq, "getCitationFindingFn")[0],
    "owner detail read",
  );
  ctx.step(`opened owner row ${short(rowId)} (traced detail read id)`, detail.data.id === rowId);
  await waitFor(() => containsText(ctx.t("citationReview.grant.title")), "grant controls");
  await quiet("owner detail + grant reads");
  return b;
}
const grantLabel = (ctx) =>
  `${fixture.actors.reviewer.email} · ${ctx.t("citationReview.role.reviewer")}`;
// The revoke list shows the email ONLY (plus "departed" for an inactive member) — not the grant's email · role.
const revokeLabel = () => fixture.actors.reviewer.email;
const consentBox = () => root()?.querySelector("[data-native-consent]");
const consentItem = (id) => root()?.querySelector(`[data-native-consent-item="${id}"]`);
const consentCheckbox = (ctx) =>
  within(consentBox(), "input[type=checkbox]").find(
    (c) => norm(c.closest("label")?.textContent) === ctx.t("nativeIntake.consent.checkbox"),
  );
const nativeGrantBtn = (ctx) =>
  within(consentBox(), "button").find(
    (b) => norm(b.textContent) === ctx.t("nativeIntake.consent.grant"),
  );

// Intake (NativeGoogleIntakePanel).
const intakeSection = () => document.querySelector("[aria-labelledby=native-intake-title]");
const buttonIn = (scope, text) => within(scope, "button").find((b) => norm(b.textContent) === text);
const intakeArticle = (id) => intakeSection()?.querySelector(`[data-intake-artifact="${id}"]`);
// The list header Refresh (not one inside an error alert).
const intakeListRefresh = (ctx) =>
  within(intakeSection(), "button").find(
    (b) => norm(b.textContent) === ctx.t("nativeIntake.refresh") && !b.closest("[role=alert]"),
  );

/* ------------------------------------------------------------- starting-data seeds */

// Seeds run in entry case() after setupCase and BEFORE mount: valid starting records only.
const LONG_PROPERTY = "https://example.test/" + "very-long-report-path-segment/".repeat(6) + "end";
const LONG_NOTE =
  "Owner limitation note: " +
  "this export omits rows below the reporting threshold and must not be read as complete; "
    .repeat(5)
    .trim();
function seedLongGoogleReport(fx) {
  const a = fx.db.artifacts.find((x) => x.id === fx.control.artifacts.google);
  a.metadata = { ...a.metadata, declaredProperty: LONG_PROPERTY };
  a.scopeKey = product().nativeArtifactScopeKey(a.metadata);
  a.parsed = {
    ...a.parsed,
    limitationNote: LONG_NOTE,
    input: { ...a.parsed.input, declaredProperty: LONG_PROPERTY },
  };
}
// Evidence-limit boundary: the project at its 20-artifact cap and a mixed finding at EXACTLY 20 evidence items
// (answer + bound Bing + 18 bare refs). Google stays uncited so the owner can deliberately add a 21st.
const LIMIT_ROW = "00000000-0000-4000-8000-000000800020";
const LIMIT_FINDING = "00000000-0000-4000-8000-000000700020";
const COMPETING_ROW = "00000000-0000-4000-8000-000000800030";
function seedEvidenceLimit(fx) {
  const { google, bing, unparsed } = fx.control.artifacts;
  const base = fx.db.artifacts.find((a) => a.id === unparsed);
  for (let i = 1; fx.db.artifacts.length < 20; i++) {
    const a = clone(base);
    a.id = "00000000-0000-4000-8000-0000001001" + String(i).padStart(2, "0");
    a.metadata = { ...a.metadata, filename: `Extra-${i}.csv` };
    a.scopeKey = product().nativeArtifactScopeKey(a.metadata);
    fx.db.artifacts.push(a);
  }
  const mixed = [...fx.db.findings.values()].flat().find((r) => r.id === fx.control.rows.mixed);
  const row = clone(mixed);
  row.id = LIMIT_ROW;
  row.findingId = LIMIT_FINDING;
  const bare = fx.db.artifacts
    .filter((a) => a.id !== google && a.id !== bing)
    .map((a) => ({ kind: "native", id: a.id }));
  row.record = {
    ...row.record,
    findingId: LIMIT_FINDING,
    evidence: [...row.record.evidence, ...bare],
  };
  fx.db.findings.set(LIMIT_FINDING, [row]);
}
// External competing write (another session committed a newer head) — an allowed timing/external change.
function insertCompetingHead(findingId, observation) {
  const chain = chainOf(findingId);
  const head = chain[chain.length - 1];
  const row = clone(head);
  Object.assign(row, {
    id: COMPETING_ROW,
    version: head.version + 1,
    supersedesId: head.id,
    createdAt: new Date().toISOString(),
  });
  row.record = { ...row.record, observation };
  db().findings.set(findingId, [...chain, row]);
  return clone(row);
}

/* ------------------------------------------------------------------- the groups */

async function group1_nativeOnlyCreate(ctx) {
  const { google, bing } = control().artifacts;
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New · citation source");
  await citeNative(ctx, google);
  await citeNative(ctx, bing);
  ctx.step(
    "exactly the two chosen reports are cited, both bound",
    same(citedRefIds(), [google, bing]) &&
      [google, bing].every((id) => refNode(id).getAttribute("data-native-bound") === "true"),
  );
  for (const id of [google, bing]) {
    const a = artifactOf(id);
    ctx.step(
      `ref ${short(id)} distinguishable by source · property · period`,
      norm(refNode(id).firstElementChild?.textContent) ===
        norm(
          `${ctx.t("nativeIntake.source." + a.metadata.source)} · ${a.metadata.declaredProperty} · ${a.metadata.period.start} → ${a.metadata.period.end}`,
        ),
    );
    checkReport(ctx, reportViewsIn(ctx, refNode(id))[0], a.parsed, `author report ${short(id)}`);
  }
  ctx.step(
    "native-only notice shown; answer-derived controls (completeness, recommendation, support) omitted",
    !!authorSection(ctx).querySelector("[data-native-only]") &&
      !inAuthor(ctx, "label").some((l) =>
        ["answerComplete", "citationsComplete", "recommendation"].some(
          (k) => norm(l.textContent) === ctx.t(`citationAuthoring.author.${k}`),
        ),
      ) &&
      !authorButton(ctx, ctx.t("citationAuthoring.author.addSupport")),
  );
  measureHere(ctx, "author-create-bind-long-report", { scope: authorSection(ctx) });
  const observation =
    "Driver: two source reports retain distinct metrics and unknown exported zeros.";
  await setObservation(ctx, observation);
  const p = await reviewAndSave(ctx, 1);
  const fin = p.finding;
  ctx.step(
    "saved set exactly equals the two selected bindings (all four binding fields each)",
    same(
      fin.evidence,
      [google, bing].map((id) => ({
        kind: "native",
        id,
        nativeBinding: bindingOfArtifact(artifactOf(id)),
      })),
    ),
  );
  ctx.step(
    "new-finding token: expectedVersion 0, expectedHeadId null",
    p.expectedVersion === 0 && p.expectedHeadId === null,
  );
  ctx.step(
    "no answer-derived claims or capture timestamp in the frozen payload",
    fin.capture.answerComplete === false &&
      fin.capture.citationsComplete === false &&
      fin.recommendation === null &&
      fin.ownCited === null &&
      fin.competitorCited === null &&
      fin.support.length === 0 &&
      fin.accuracy.length === 0 &&
      !JSON.stringify(fin).includes("answerCapturedAt") &&
      fin.observation === observation &&
      fin.review.reviewer === control().ids.owner &&
      fin.secondReview === null,
  );
  const chain = chainOf(fin.findingId);
  ctx.step(
    "stored exactly one immutable v1 whose record equals the frozen payload; one ledger write",
    chain.length === 1 &&
      chain[0].version === 1 &&
      same(chain[0].record, fin) &&
      chain[0].panelId === p.scope.panelId &&
      inspect().ledgerSize() === 1,
  );
  ctx.step(
    "no automatic reviewer grant",
    ctx.countOf("grantCitationReviewAssignmentFn") === 0 &&
      ctx.countOf("grantCitationReviewNativeAssignmentFn") === 0,
  );
  const picker = await waitFor(() => editPicker(ctx), "author edit picker after save");
  measureHere(ctx, "author-edit-picker", {
    scope: authorSection(ctx),
    required: [picker.select, picker.button, newFindingButton(ctx, "citation_source")].filter(
      Boolean,
    ),
  });
  // REOPEN the actual saved head (bound to the saved finding id, not a picker scan) and re-inspect.
  await startEdit(ctx, chain[0].id);
  ctx.step(
    "reopened draft cites exactly the saved set, all bound",
    same(citedRefIds(), [google, bing]) &&
      [google, bing].every((id) => refNode(id).getAttribute("data-native-bound") === "true"),
  );
  ctx.step(
    "Review blocked until each bound report's current material is viewed",
    !enabled(reviewBtn(ctx)),
  );
  for (const id of [google, bing]) await viewBound(ctx, id);
  for (const id of [google, bing])
    checkReport(
      ctx,
      reportViewsIn(ctx, refNode(id))[0],
      artifactOf(id).parsed,
      `reopened report ${short(id)}`,
    );
  ctx.step(
    "Review available once both stored pins resolved to current material",
    enabled(reviewBtn(ctx)),
  );
}

async function group2_mixedEdit(ctx) {
  const { google, bing } = control().artifacts;
  const rowId = control().rows.mixed;
  const v1 = clone(rowOf(rowId));
  const answerId = v1.record.evidence.find((e) => e.kind === "answer").id;
  await startEdit(ctx, rowId);
  ctx.step(
    "mixed finding opens with its answer and its bound Bing ref",
    same(citedRefIds(), [bing]) &&
      refNode(bing).getAttribute("data-native-bound") === "true" &&
      labelledIn(authorSection(ctx), ctx.t("citationAuthoring.author.answer"))?.value === answerId,
  );
  ctx.step(
    "Review blocked until the existing bound report is viewed on this mount",
    !enabled(reviewBtn(ctx)),
  );
  await viewBound(ctx, bing);
  checkReport(
    ctx,
    reportViewsIn(ctx, refNode(bing))[0],
    artifactOf(bing).parsed,
    "existing Bing report",
  );
  await citeNative(ctx, google); // deliberately add a second native
  measureHere(ctx, "author-edit-mixed", {
    scope: authorSection(ctx),
    required: requiredAuthorTargets(ctx),
  });
  // Deliberate removal + reselection of the added report; the existing Bing ref must stay untouched.
  await clickEnabled(
    () => refButton(ctx, google, "citationAuthoring.common.remove"),
    "Remove Google",
  );
  await waitFor(() => !refNode(google), "Google ref removed");
  ctx.step(
    "removal changed only the deliberately removed ref; Bing still bound with its material",
    same(citedRefIds(), [bing]) &&
      hasMaterial(bing) &&
      refNode(bing).getAttribute("data-native-bound") === "true",
  );
  await citeNative(ctx, google);
  ctx.step(
    "reselection re-cites Google after the untouched Bing",
    same(citedRefIds(), [bing, google]),
  );
  const p = await reviewAndSave(ctx, 2);
  const fin = p.finding;
  ctx.step(
    "answer ref and Bing ref byte-identical to v1 (all four binding fields untouched)",
    fin.evidence.length === 3 && same(fin.evidence.slice(0, 2), v1.record.evidence),
  );
  ctx.step(
    "reselected Google carries exactly its current binding",
    same(fin.evidence[2], {
      kind: "native",
      id: google,
      nativeBinding: bindingOfArtifact(artifactOf(google)),
    }),
  );
  const untouched = [
    "findingId",
    "family",
    "entityMatch",
    "capture",
    "observation",
    "hypothesis",
    "competitorCited",
    "ownCited",
    "recommendation",
    "support",
    "accuracy",
    "priority",
    "decision",
    "secondReview",
    "linkedTaskId",
  ];
  ctx.step(
    "every untouched answer-semantics field equals v1",
    untouched.every((k) => same(fin[k], v1.record[k])),
  );
  ctx.step("anchored to the opened head", p.expectedVersion === 1 && p.expectedHeadId === rowId);
  const chain = chainOf(v1.findingId);
  ctx.step(
    "v2 appended on top of v1; immutable v1 unchanged",
    chain.length === 2 &&
      same(chain[0], v1) &&
      chain[1].version === 2 &&
      chain[1].supersedesId === rowId &&
      same(chain[1].record, fin),
  );
}

async function group2_evidenceLimit20(ctx) {
  const { google, bing } = control().artifacts;
  const v1 = clone(rowOf(LIMIT_ROW));
  ctx.step(
    "seed: answer + 19 native refs = exactly 20 evidence items; 20 project artifacts",
    v1.record.evidence.length === 20 && db().artifacts.length === 20,
  );
  await startEdit(ctx, LIMIT_ROW);
  const natives = v1.record.evidence.filter((e) => e.kind === "native").map((e) => e.id);
  ctx.step(
    "all 19 cited native refs open (bound Bing + 18 bare), none dropped",
    same(citedRefIds(), natives),
  );
  await viewBound(ctx, bing);
  await citeNative(ctx, google); // the 21st evidence item, chosen deliberately
  const savesBefore = savesIn(ctx).length;
  await clickReview(ctx);
  const issue = await waitFor(
    () => inAuthor(ctx, "li").find((li) => /^evidence\b/.test(norm(li.textContent))),
    "visible evidence-limit issue",
  );
  ctx.step(
    "a 21st evidence item is refused at Review with a visible limit issue — nothing truncated, nothing saved",
    !!issue &&
      !authorButton(ctx, saveLabel(ctx, 2)) &&
      savesIn(ctx).length === savesBefore &&
      same(citedRefIds(), [...natives, google]),
  );
  await clickEnabled(
    () => refButton(ctx, google, "citationAuthoring.common.remove"),
    "Remove the 21st (Google)",
  );
  await waitFor(() => !refNode(google), "Google ref removed");
  const p = await reviewAndSave(ctx, 2);
  ctx.step(
    "saved exactly the 20 original evidence items in order (bindings untouched)",
    same(p.finding.evidence, v1.record.evidence),
  );
  const chain = chainOf(LIMIT_FINDING);
  ctx.step(
    "v2 stored with 20 evidence; v1 unchanged",
    chain.length === 2 && same(chain[0], v1) && chain[1].record.evidence.length === 20,
  );
}

async function group3_legacyUpgrade(ctx) {
  const { google } = control().artifacts;
  const rowId = control().rows.legacyNative;
  const v1 = clone(rowOf(rowId));
  // 1) ORDINARY legacy edit WITHOUT binding: the bare ref must survive, unpromoted, as a new version.
  const seq0 = lastSeq(ctx);
  await startEdit(ctx, rowId);
  const ref = await waitFor(() => refNode(google), "legacy bare native ref");
  ctx.step(
    "legacy ref opens BARE: no binding added and no binding/material read on open",
    ref.getAttribute("data-native-bound") === "false" &&
      callsAfter(ctx, seq0, "readNativeReportBindingFn").length === 0 &&
      callsAfter(ctx, seq0, "readNativeReportParsedFn").length === 0,
  );
  ctx.step(
    "a bare ref needs no material: Review available for an ordinary edit",
    enabled(reviewBtn(ctx)),
  );
  measureHere(ctx, "author-legacy-edit", {
    scope: authorSection(ctx),
    required: requiredAuthorTargets(ctx),
  });
  await setObservation(ctx, "Driver: ordinary legacy edit without binding.");
  const p2 = await reviewAndSave(ctx, 2);
  ctx.step(
    "ordinary edit preserves the bare ref exactly (no nativeBinding key)",
    same(p2.finding.evidence, v1.record.evidence) && !("nativeBinding" in p2.finding.evidence[0]),
  );
  ctx.step(
    "anchored to the opened legacy head",
    p2.expectedVersion === 1 && p2.expectedHeadId === rowId,
  );
  let chain = chainOf(v1.findingId);
  ctx.step(
    "v2 appended bare; immutable v1 unchanged",
    chain.length === 2 && same(chain[0], v1) && same(chain[1].record.evidence, v1.record.evidence),
  );
  const v2 = clone(chain[1]);
  // 2) EXPLICIT upgrade on the new head: bind current material, inspect, Review + Save a NEW bound version.
  await startEdit(ctx, v2.id);
  ctx.step(
    "reopened v2 ref is still bare (no auto-promotion)",
    refNode(google)?.getAttribute("data-native-bound") === "false",
  );
  const seq = lastSeq(ctx);
  await clickEnabled(
    () => refButton(ctx, google, "nativeIntake.bind.bindCurrent"),
    "Bind current (explicit upgrade)",
  );
  await waitFor(
    () => refNode(google)?.getAttribute("data-native-bound") === "true" && hasMaterial(google),
    "ref bound with material after explicit upgrade",
  );
  pairedReads(ctx, seq, google, "explicit Bind current");
  checkReport(
    ctx,
    reportViewsIn(ctx, refNode(google))[0],
    artifactOf(google).parsed,
    "upgraded report",
  );
  measureHere(ctx, "author-legacy-bind", {
    scope: authorSection(ctx),
    required: requiredAuthorTargets(ctx),
  });
  const p3 = await reviewAndSave(ctx, 3);
  ctx.step(
    "explicit upgrade wrote the current binding into a NEW version anchored on v2",
    same(p3.finding.evidence, [
      { kind: "native", id: google, nativeBinding: bindingOfArtifact(artifactOf(google)) },
    ]) &&
      p3.expectedVersion === 2 &&
      p3.expectedHeadId === v2.id,
  );
  chain = chainOf(v1.findingId);
  ctx.step(
    "v3 appended; v1 and v2 stay bare and unchanged",
    chain.length === 3 && same(chain[0], v1) && same(chain[1], v2) && chain[2].version === 3,
  );
}

const IMPORT_PROPERTY = "https://example.test/imported-report/";
const IMPORT_CSV = "Date,Impressions\n2026-10-01,5\n2026-10-02,0\n";
const IMPORT_FILTERS_CSV =
  "Filter,Value\nSearch type,Web (text-based)\nDate,Last 3 months\nCountry,Sweden\n";

async function group4_intakeFreshness(ctx) {
  const { google } = control().artifacts;
  const I = (k) => ctx.t("nativeIntake." + k);
  // A) ACTUAL intake import/save through the real form (File/DataTransfer), Preview, Save.
  const field = (k) => labelledIn(intakeSection(), I(k));
  await waitFor(() => field("sourceLabel"), "intake form");
  setNativeValue(field("sourceLabel"), "gsc_generative_ai_search");
  await raf2();
  setNativeValue(field("propertyLabel"), IMPORT_PROPERTY);
  setNativeValue(field("startLabel"), "2026-10-01");
  setNativeValue(field("endLabel"), "2026-10-02");
  setNativeValue(field("capturedAtLabel"), "2026-11-13T09:00");
  setNativeValue(field("completenessLabel"), "partial");
  setNativeValue(field("limitationLabel"), "Driver import: owner-declared partial export.");
  setFile(field("dataCsvLabel"), csvFile("Chart.csv", IMPORT_CSV));
  setFile(field("filtersCsvLabel"), csvFile("Filters.csv", IMPORT_FILTERS_CSV));
  await raf2();
  await clickEnabled(() => buttonIn(intakeSection(), I("previewBtn")), "intake Preview");
  const preview = await waitFor(
    () => intakeSection()?.querySelector("[data-intake-preview]"),
    "intake preview",
  );
  ctx.step(
    "intake preview shows the actual ReportView before Save",
    reportViewsIn(ctx, preview).length === 1,
  );
  measureHere(ctx, "intake-import-preview", {
    scope: intakeSection(),
    required: [buttonIn(preview, I("saveBtn")), buttonIn(intakeSection(), I("previewBtn"))].filter(
      Boolean,
    ),
  });
  const seqI = lastSeq(ctx);
  await clickEnabled(() => buttonIn(preview, I("saveBtn")), "intake Save");
  const persist = await waitFor(
    () => callsAfter(ctx, seqI, "persistNativeReportFn")[0],
    "persist issued",
    8000,
  );
  const newId = persist.data.id;
  const imported = await waitFor(
    () => (artifactOf(newId)?.parsed ? artifactOf(newId) : null),
    "imported artifact parsed",
  );
  await waitFor(
    () => intakeArticle(newId)?.querySelector('[data-intake-badge="ready"]'),
    "imported article Ready",
    8000,
  );
  await quiet("post-import refetch");
  const stages = callsAfter(ctx, seqI, "stageNativeArtifactFn");
  ctx.step(
    "exactly one stage + one persist of the reviewed bytes; the new artifact is listed Ready",
    stages.length === 1 &&
      callsAfter(ctx, seqI, "persistNativeReportFn").length === 1 &&
      atob(stages[0].data.base64) === IMPORT_CSV &&
      imported.metadata.declaredProperty === IMPORT_PROPERTY &&
      persist.data.completeness === "partial",
  );
  // B) the new intake save is selectable in the author (shared list) and binds its current material.
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New finding");
  ctx.step(
    "the new intake save is offered by the author's native picker without navigation",
    within(addNativeSelect(ctx), "option").some((o) => o.value === newId),
  );
  await citeNative(ctx, newId);
  checkReport(
    ctx,
    reportViewsIn(ctx, refNode(newId))[0],
    imported.parsed,
    "imported report in the author",
  );
  await citeNative(ctx, google);
  await setObservation(ctx, "Driver: intake freshness across author and grant.");
  ctx.step("author Review ready with both current reports", enabled(reviewBtn(ctx)));
  // C) the grant surface is open on a finding citing Google, with consent ticked.
  await openOwnerFinding(ctx, control().rows.boundNative);
  await chooseRadixOption(ctx, ctx.t("citationReview.grant.selectReviewer"), grantLabel(ctx));
  await waitFor(
    () =>
      consentItem(google)?.getAttribute("data-native-consent-resolved") === "true" &&
      consentCheckbox(ctx),
    "consent disclosure resolved for Google",
  );
  setCheckbox(consentCheckbox(ctx), true);
  await waitFor(() => enabledEl(nativeGrantBtn(ctx)), "native grant enabled after consent");
  // D) a FAILED list read cannot keep using the cached success (author AND grant), and recovery needs re-consent.
  control().failNext("readNativeArtifactsFn");
  const seqF = lastSeq(ctx);
  await clickEnabled(() => intakeListRefresh(ctx), "intake Refresh (read will fail)");
  await waitFor(
    () =>
      within(intakeSection(), "p[role=alert]").some((p) => norm(p.textContent) === I("loadError")),
    "intake list read failed",
  );
  await waitFor(
    () => !enabled(reviewBtn(ctx)) && authorSection(ctx).querySelector("[data-native-unconfirmed]"),
    "author blocked",
  );
  ctx.step(
    "failed list read: one shared read; author Review blocked with the unconfirmed notice, no material",
    callsAfter(ctx, seqF, "readNativeArtifactsFn").length === 1 &&
      !enabled(reviewBtn(ctx)) &&
      !authorSection(ctx).querySelector("[data-native-material]"),
  );
  ctx.step(
    "failed list read: grant consent retired (no checkbox/grant, unbindable notice)",
    !consentCheckbox(ctx) &&
      !nativeGrantBtn(ctx) &&
      consentBox()?.textContent.includes(I("consent.unbindable")),
  );
  await clickEnabled(() => intakeListRefresh(ctx), "intake Refresh (recover)");
  await waitFor(
    () => enabled(reviewBtn(ctx)) && hasMaterial(google) && hasMaterial(newId),
    "author recovered",
  );
  const again = await waitFor(() => consentCheckbox(ctx), "consent checkbox after recovery");
  ctx.step(
    "recovery after a fresh successful read requires explicit re-consent",
    again.checked === false && !enabled(nativeGrantBtn(ctx)),
  );
  setCheckbox(again, true);
  await waitFor(() => enabledEl(nativeGrantBtn(ctx)), "re-consented");
  // E) ACTUAL intake delete of Google through the inline confirmation, with the shared refetch HELD.
  await clickEnabled(
    () => buttonIn(intakeArticle(google), I("deleteBtn")),
    "intake Delete (opens confirm)",
  );
  const alert = await waitFor(
    () =>
      within(intakeArticle(google), "[role=alert]").find((al) =>
        al.textContent.includes(I("confirmDelete")),
      ),
    "inline delete confirmation",
  );
  const gm = artifactOf(google).metadata;
  ctx.step(
    "inline confirmation names the exact artifact (source · property · window)",
    norm(alert.textContent).includes(
      norm(
        `${I("source." + gm.source)} · ${gm.declaredProperty} · ${gm.period.start} → ${gm.period.end}`,
      ),
    ),
  );
  measureHere(ctx, "intake-delete-confirm", { scope: intakeArticle(google) });
  control().defer("readNativeArtifactsFn");
  const seqD = lastSeq(ctx);
  await clickEnabled(() => buttonIn(alert, I("deleteBtn")), "confirm Delete INSIDE the alert");
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "readNativeArtifactsFn"),
    "post-delete list refetch held",
  );
  const removes = callsAfter(ctx, seqD, "removeNativeArtifactFn");
  ctx.step(
    "exactly one delete, for the exact artifact, through the inline confirmation",
    removes.length === 1 && removes[0].data.id === google && !artifactOf(google),
  );
  await waitFor(() => !enabled(reviewBtn(ctx)), "author blocked while the refetch is pending");
  ctx.step(
    "pending list read: author Review blocked + unconfirmed; cached material masked",
    !!authorSection(ctx).querySelector("[data-native-unconfirmed]") &&
      !authorSection(ctx).querySelector("[data-native-material]"),
  );
  ctx.step(
    "pending list read: grant consent retired and disclosure material masked",
    !consentCheckbox(ctx) && !nativeGrantBtn(ctx) && reportViewsIn(ctx, consentBox()).length === 0,
  );
  await control().release("readNativeArtifactsFn", "ok");
  await waitFor(
    () => refNode(google)?.textContent.includes(I("bind.missing")),
    "stale Google ref after the refetch",
  );
  await quiet("post-delete refetch");
  ctx.step(
    "deleted cited ref stays VISIBLE as missing (binding kept, no material)",
    refNode(google).getAttribute("data-native-bound") === "true" && !hasMaterial(google),
  );
  ctx.step("imported ref untouched: still bound with its material", hasMaterial(newId));
  ctx.step(
    "author readiness retired: Review stays blocked by the stale ref",
    !enabled(reviewBtn(ctx)),
  );
  ctx.step(
    "deleted artifact gone from the intake list and the author picker",
    !intakeArticle(google) &&
      !within(addNativeSelect(ctx), "option").some((o) => o.value === google),
  );
  ctx.step(
    "grant: deleted member unresolved, no consent or grant offered",
    consentItem(google)?.getAttribute("data-native-consent-resolved") === "false" &&
      !consentCheckbox(ctx) &&
      !nativeGrantBtn(ctx),
  );
  ctx.step(
    "no grant was issued at any point",
    ctx.countOf("grantCitationReviewNativeAssignmentFn") === 0 &&
      ctx.countOf("grantCitationReviewAssignmentFn") === 0,
  );
}

async function group5_doubleSubmitConflict(ctx) {
  const { google, bing } = control().artifacts;
  // (a) Double activation → exactly one mutation, one stored version.
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New finding");
  await citeNative(ctx, google);
  await setObservation(ctx, "Driver double-submit probe.");
  await clickReview(ctx);
  const save1 = await waitFor(
    () => enabledEl(authorButton(ctx, saveLabel(ctx, 1))),
    "Save v1 (enabled)",
  );
  clickEl(save1);
  clickEl(save1);
  await waitFor(() => savedNotice(ctx, 1), "exact saved v1 notice");
  await quiet("post-save refetch");
  const a = savesIn(ctx);
  const aHead = clone(chainOf(a[0]?.data.finding.findingId)[0] ?? null);
  ctx.step(
    "double Save activation: exactly one request, one stored v1, one ledger entry",
    a.length === 1 &&
      chainOf(a[0].data.finding.findingId).length === 1 &&
      aHead.version === 1 &&
      inspect().ledgerSize() === 1,
  );
  // (b) Lost acknowledgement: the server commits, the client sees a failure; the retry resends the identical
  // frozen request and gets the SAME stored row/version back with no duplicate write.
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New finding 2");
  await citeNative(ctx, bing);
  await setObservation(ctx, "Driver lost-ack idempotency probe.");
  await clickReview(ctx);
  const ledger0 = inspect().ledgerSize();
  control().setFlag("lostAck", true);
  const s0 = lastSeq(ctx);
  await clickEnabled(() => authorButton(ctx, saveLabel(ctx, 1)), "Save v1 (ack will be lost)");
  await waitFor(
    () => callsAfter(ctx, s0, "saveCitationFindingFn").length === 1,
    "first save issued",
  );
  const errText = norm(
    `${ctx.t("citationAuthoring.author.error")}: ${ctx.t("citationAuthoring.saveError.unavailable")}`,
  );
  await waitFor(
    () => inAuthor(ctx, "p").some((p) => norm(p.textContent) === errText),
    "visible lost-ack failure",
  );
  const retry = await waitFor(
    () => enabledEl(authorButton(ctx, saveLabel(ctx, 1))),
    "Save re-enabled after the failure",
  );
  const first = callsAfter(ctx, s0, "saveCitationFindingFn")[0];
  const committed = clone(chainOf(first.data.finding.findingId));
  ctx.step(
    "the server committed exactly one v1 before the lost ack; the UI shows the failure and keeps the draft",
    committed.length === 1 &&
      committed[0].version === 1 &&
      inspect().ledgerSize() === ledger0 + 1 &&
      !savedNotice(ctx, 1),
  );
  clickEl(retry);
  await waitFor(() => savedNotice(ctx, 1), "exact saved v1 notice after the retry");
  await quiet("post-retry refetch");
  const b = callsAfter(ctx, s0, "saveCitationFindingFn");
  ctx.step(
    "exactly two save requests with the IDENTICAL full frozen payload (findingId, reviewedAt, expected head)",
    b.length === 2 &&
      same(b[0].data, b[1].data) &&
      b[0].data.expectedVersion === 0 &&
      b[0].data.expectedHeadId === null &&
      typeof b[0].data.finding.review.reviewedAt === "string",
  );
  ctx.step(
    "the retry returned the same stored row/version: still one v1 row, ledger unchanged",
    same(chainOf(first.data.finding.findingId), committed) &&
      inspect().ledgerSize() === ledger0 + 1,
  );
  // (c) GENUINE conflict: edit (a)'s v1, Review, then another session commits a newer head; Save conflicts, the
  // UI reads and shows the CURRENT head, and only an explicit Continue + Save writes on top of it.
  await startEdit(ctx, aHead.id);
  await viewBound(ctx, google);
  await setObservation(ctx, "Driver conflict probe: my edit on v1.");
  await clickReview(ctx);
  await waitFor(() => enabledEl(authorButton(ctx, saveLabel(ctx, 2))), "Save v2 (enabled)");
  const competing = insertCompetingHead(
    aHead.findingId,
    "Competing edit committed by another session.",
  );
  const s1 = lastSeq(ctx);
  await clickEnabled(() => authorButton(ctx, saveLabel(ctx, 2)), "Save v2 (stale head)");
  const conflictHead = norm(
    `${ctx.t("citationAuthoring.author.conflictTitle")} · v${competing.version}`,
  );
  const box = await waitFor(
    () =>
      inAuthor(ctx, "div").find(
        (d) => norm(d.firstElementChild?.textContent) === conflictHead && d.querySelector("button"),
      ),
    "conflict comparison with the current head",
  );
  const continueBtn = await waitFor(
    () =>
      within(box, "button").find(
        (x) =>
          norm(x.textContent) ===
          ctx.t("citationAuthoring.author.conflictContinue", { version: competing.version }),
      ),
    "explicit Continue on the inspected head",
  );
  await quiet("conflict follow-up reads");
  const conflicted = callsAfter(ctx, s1, "saveCitationFindingFn");
  ctx.step(
    "stale-head save refused as a conflict: one request on the opened v1, no write",
    conflicted.length === 1 &&
      conflicted[0].data.expectedVersion === 1 &&
      conflicted[0].data.expectedHeadId === aHead.id &&
      chainOf(aHead.findingId).length === 2,
  );
  ctx.step(
    "the UI read the CURRENT head and shows it for comparison (competing observation visible)",
    callsAfter(ctx, s1, "readCitationFindingsFn").length === 1 &&
      callsAfter(ctx, s1, "getCitationFindingFn").some((c) => c.data.id === competing.id) &&
      box.textContent.includes(competing.record.observation),
  );
  measureHere(ctx, "author-conflict-continue", {
    scope: authorSection(ctx),
    // The explicit Continue is an essential action: required at 44px like Save/Back.
    required: [
      continueBtn,
      authorButton(ctx, saveLabel(ctx, 2)),
      authorButton(ctx, ctx.t("citationAuthoring.author.back")),
    ].filter(Boolean),
  });
  const savesBefore = savesIn(ctx).length;
  await clickEnabled(() => continueBtn, "Continue on the competing head");
  const save3 = await waitFor(
    () => enabledEl(authorButton(ctx, saveLabel(ctx, 3))),
    "Save v3 after the explicit Continue",
  );
  ctx.step(
    "Continue only moves the token: no request, no write",
    savesIn(ctx).length === savesBefore && chainOf(aHead.findingId).length === 2,
  );
  const s2 = lastSeq(ctx);
  clickEl(save3);
  await waitFor(() => savedNotice(ctx, 3), "exact saved v3 notice");
  await quiet("post-continue save");
  const fin = callsAfter(ctx, s2, "saveCitationFindingFn");
  ctx.step(
    "explicit Save on the inspected head: byte-identical frozen finding, token = the competing v2",
    fin.length === 1 &&
      same(fin[0].data.finding, conflicted[0].data.finding) &&
      fin[0].data.expectedVersion === competing.version &&
      fin[0].data.expectedHeadId === competing.id,
  );
  const chain = chainOf(aHead.findingId);
  ctx.step(
    "v3 supersedes the competing head; competing v2 and v1 untouched",
    chain.length === 3 &&
      same(chain[0], aHead) &&
      same(chain[1], competing) &&
      chain[2].supersedesId === competing.id &&
      same(chain[2].record, conflicted[0].data.finding),
  );
}

/* ------------------------------------- groups 6-11: seeds (valid starting data only) + helpers */

const G2_ART = "00000000-0000-4000-8000-000000100040";
const SAMESRC_ROW = "00000000-0000-4000-8000-000000800040";
const SAMESRC_FINDING = "00000000-0000-4000-8000-000000700040";
const V_UNKNOWN = "00000000-0000-4000-8000-000000100051";
const V_PAGES = "00000000-0000-4000-8000-000000100052";
const V_GAPS = "00000000-0000-4000-8000-000000100053";
const V_ROW = "00000000-0000-4000-8000-000000800050";
const V_FINDING = "00000000-0000-4000-8000-000000700050";
const boundRef = (a) => ({ kind: "native", id: a.id, nativeBinding: bindingOfArtifact(a) });
const seededArtifact = (fx, id) => fx.db.artifacts.find((a) => a.id === id);
// A finding row shaped exactly like the seeded bound-native row, citing `evidence`.
function seedFinding(fx, rowId, findingId, evidence) {
  const base = [...fx.db.findings.values()]
    .flat()
    .find((r) => r.id === fx.control.rows.boundNative);
  const row = clone(base);
  Object.assign(row, { id: rowId, findingId });
  row.record = { ...row.record, findingId, evidence };
  fx.db.findings.set(findingId, [row]);
}
// Group 6: a SECOND real-parsed Google report (same source, different property/period, long URL + note) and a
// finding citing both bound; editors may approve, so the editor is a second eligible reviewer.
async function seedSameSource(fx) {
  fx.db.policy.mode = "editors_can_approve";
  const google = seededArtifact(fx, fx.control.artifacts.google);
  const g2 = await product().seedArtifact(fx, {
    id: G2_ART,
    metadata: {
      ...google.metadata,
      declaredProperty: LONG_PROPERTY + "/",
      period: { ...google.metadata.period, start: "2026-09-03", end: "2026-09-04" },
      filename: "Chart-second.csv",
    },
    csv: "Date,Impressions\n2026-09-03,7\n2026-09-04,0\n",
    note: LONG_NOTE,
  });
  seedFinding(fx, SAMESRC_ROW, SAMESRC_FINDING, [boundRef(google), boundRef(g2)]);
}
// Group 7: long report + ordinary (consent-less) assignments on the bare and the unbound finding.
function seedReviewerLinks(fx) {
  seedLongGoogleReport(fx);
  fx.control.grant(fx.control.rows.legacyNative);
  fx.control.grant(fx.control.rows.unbindableNative);
}
// Group 8: real-parsed all-unknown Google chart, Google pages with a withheld row, Bing overview with a gap;
// one finding binds all three under the reviewer's current full-set consent.
async function seedVariants(fx) {
  const g = seededArtifact(fx, fx.control.artifacts.google).metadata;
  const b = seededArtifact(fx, fx.control.artifacts.bing).metadata;
  const P = product();
  const unknown = await P.seedArtifact(fx, {
    id: V_UNKNOWN,
    metadata: { ...g, filename: "AllUnknown.csv" },
    csv: "Date,Impressions\n2026-09-01,0\n2026-09-02,0\n",
    completeness: "unknown",
  });
  const pages = await P.seedArtifact(fx, {
    id: V_PAGES,
    metadata: {
      ...g,
      reportKind: "table",
      dimension: "page",
      aggregation: "page",
      filename: "Pages.csv",
    },
    csv: "Top pages,Impressions\nhttps://example.test/a,3\nhttps://example.test/b?utm_source=x,2\n",
    note: "Owner note: page rows carrying query strings are withheld by the export.",
  });
  const gaps = await P.seedArtifact(fx, {
    id: V_GAPS,
    metadata: {
      ...b,
      period: { start: "2026-08-13", end: "2026-08-16", timezone: null },
      filename: "Gaps.csv",
    },
    csv: "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/16/2026 12:00:00 AM,0,0\n",
  });
  seedFinding(fx, V_ROW, V_FINDING, [unknown, pages, gaps].map(boundRef));
  await fx.control.grantNative(V_ROW);
}

const editorLabel = (ctx) =>
  `${fixture.actors.editor.email} · ${ctx.t("citationReview.role.editor")}`;
const grantedShown = (ctx) => containsText(ctx.t("citationReview.grant.granted"));
const consentItems = () => within(consentBox(), "[data-native-consent-item]");
const decisionTrigger = (ctx) =>
  productNodes("button[role=combobox]").find(
    (b) => b.getAttribute("aria-label") === ctx.t("citationReview.reviewer.decisionLabel"),
  );
const noteInput = (ctx) =>
  productNodes("input").find(
    (i) => i.getAttribute("aria-label") === ctx.t("citationReview.reviewer.noteLabel"),
  );
const reviewerSubmitBtn = (ctx) => byText(ctx.t("citationReview.reviewer.submit"));
const withdrawBtn = (ctx) => byText(ctx.t("citationReview.reviewer.withdraw"));
const unavailableShown = (ctx) => !!containsText(ctx.t("citationReview.reviewer.unavailable"));
// The reviewer header states whole-set inspectability as " · <inspectable> · " (vs the not-inspectable copy).
const claimsInspectable = (ctx) =>
  productNodes("header p").some((p) =>
    norm(p.textContent).includes(` · ${ctx.t("citationReview.reviewer.inspectable")} · `),
  );
// Reopen the exact reviewer link on the SAME client (real remount) and wait for this mount's own read.
async function reopenReviewer(ctx) {
  const seq = lastSeq(ctx);
  api().remount();
  await waitFor(
    () => callsAfter(ctx, seq, "getCitationFindingForReviewFn").length >= 1,
    "fresh reviewer read after reopen",
  );
  return seq;
}
// Choose a decision (+ optional note) through the house Select/input and press the ENABLED Submit.
async function submitDecision(ctx, note) {
  await chooseRadixOption(
    ctx,
    ctx.t("citationReview.reviewer.decisionLabel"),
    ctx.t("citationReview.reviewDecision.approved"),
  );
  if (note !== undefined) {
    setNativeValue(await waitFor(() => noteInput(ctx), "note input"), note);
    await raf2();
  }
  const seq = lastSeq(ctx);
  await clickEnabled(() => reviewerSubmitBtn(ctx), "Submit decision");
  return waitFor(
    () => callsAfter(ctx, seq, "saveCitationFindingReviewFn")[0],
    "review submit issued",
  );
}
function assertHidden(ctx, what) {
  ctx.step(
    `${what}: denial notice; NO report material, record, decision form or Submit`,
    unavailableShown(ctx) &&
      reportViews(ctx).length === 0 &&
      !containsText(ctx.t("citationReview.record.observation")) &&
      !decisionTrigger(ctx) &&
      !reviewerSubmitBtn(ctx),
  );
}

/* ------------------------------------------------------------------- groups 6-9 */

async function group6_consent(ctx) {
  const t = ctx.t;
  const { google } = control().artifacts;
  const { reviewer: rev, editor: ed, project, owner } = control().ids;
  const grantCalls = (seq) => callsAfter(ctx, seq, "grantCitationReviewNativeAssignmentFn");
  const asg = (rowId, who = rev) => db().assignments.get(`${project}:${rowId}:${who}`);
  const selectReviewer = (label) =>
    chooseRadixOption(ctx, t("citationReview.grant.selectReviewer"), label);
  // 1) Whole-set disclosure of TWO SAME-SOURCE reports.
  await openOwnerFinding(ctx, SAMESRC_ROW);
  ctx.step(
    "a native-bearing finding offers NO legacy (non-native) grant",
    !byText(t("citationReview.grant.grant")),
  );
  await selectReviewer(grantLabel(ctx));
  await waitFor(() => consentCheckbox(ctx), "full-set consent checkbox");
  await quiet("consent disclosure reads");
  const items = consentItems();
  ctx.step(
    "the whole cited set is disclosed: both same-source members, both resolved",
    same(
      items.map((i) => i.getAttribute("data-native-consent-item")),
      [google, G2_ART],
    ) &&
      items.every((i) => i.getAttribute("data-native-consent-resolved") === "true") &&
      norm(consentBox().textContent).includes(norm(t("nativeIntake.consent.scope", { count: 2 }))),
  );
  const heads = items.map((i) => norm(i.firstElementChild?.textContent));
  for (const [i, id] of [google, G2_ART].entries()) {
    const inp = artifactOf(id).parsed.input;
    ctx.step(
      `member ${short(id)} identified by source · property · period`,
      heads[i] ===
        norm(
          `${t("nativeIntake.source." + inp.source)} · ${inp.declaredProperty} · ${inp.period.start} → ${inp.period.end}`,
        ),
    );
    checkReport(
      ctx,
      reportViewsIn(ctx, items[i])[0],
      artifactOf(id).parsed,
      `consent member ${short(id)}`,
    );
  }
  ctx.step(
    "the two SAME-SOURCE reports are distinguishable (same source label, different property/period)",
    new Set(heads).size === 2 &&
      items.every(
        (i) => reportSourceLabel(reportViewsIn(ctx, i)[0]) === t("nativeIntake.nativeLabel.gsc"),
      ),
  );
  ctx.step(
    "consent starts UNCHECKED and the native grant is disabled",
    consentCheckbox(ctx).checked === false && !enabled(nativeGrantBtn(ctx)),
  );
  // 2) The actual grant: exact payload, client-composed full-set digest, stored effect.
  setCheckbox(consentCheckbox(ctx), true);
  const s1 = lastSeq(ctx);
  await clickEnabled(() => nativeGrantBtn(ctx), "native grant");
  await waitFor(() => grantedShown(ctx), "visible grant success");
  await quiet("grant");
  const digest = await control().expectedNativeSetDigest(SAMESRC_ROW);
  ctx.step(
    "exactly one native grant: exact project/row/reviewer + the full-set digest of the finding's bindings",
    typeof digest === "string" &&
      grantCalls(s1).length === 1 &&
      same(grantCalls(s1)[0].data, {
        projectId: project,
        findingRowId: SAMESRC_ROW,
        reviewerId: rev,
        nativeSetSha256: digest,
      }),
  );
  ctx.step(
    "the stored assignment is active with native consent bound to that digest",
    asg(SAMESRC_ROW)?.active === true &&
      asg(SAMESRC_ROW).native?.active === true &&
      asg(SAMESRC_ROW).native.setSha === digest,
  );
  // 3) Copy: the local clipboard only.
  const link = await waitFor(
    () =>
      productNodes("input").find(
        (i) => i.getAttribute("aria-label") === t("citationReview.grant.link"),
      ),
    "scoped review link",
  );
  ctx.step(
    "the scoped link names the exact owner and finding row",
    link.value.includes(owner) && link.value.includes(SAMESRC_ROW),
  );
  measureHere(ctx, "owner-grant-consent-copy"); // long URL + note members, reviewer select, consent, grant, copy
  await clickEnabled(() => byText(t("citationReview.grant.copy")), "Copy link");
  await waitFor(() => byText(t("citationReview.grant.copied")), "copied state");
  ctx.step(
    "Copy wrote exactly the link to the LOCAL clipboard; zero network/message",
    same(inspect().clipboard(), [link.value]) && inspect().network().length === 0,
  );
  // 4) Reviewer change resets the checkbox, success, link and copied state.
  await selectReviewer(editorLabel(ctx));
  await waitFor(() => !grantedShown(ctx), "success cleared on reviewer change");
  ctx.step(
    "reviewer change clears success/link/copied and consent",
    !byText(t("citationReview.grant.copy")) &&
      !byText(t("citationReview.grant.copied")) &&
      consentCheckbox(ctx)?.checked === false &&
      !enabled(nativeGrantBtn(ctx)),
  );
  // 5) A late OLD grant completion cannot restore success.
  setCheckbox(consentCheckbox(ctx), true);
  control().defer("grantCitationReviewNativeAssignmentFn", "hold");
  const s2 = lastSeq(ctx);
  await clickEnabled(() => nativeGrantBtn(ctx), "native grant for the editor (held)");
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "grantCitationReviewNativeAssignmentFn"),
    "editor grant held after the client digest",
  );
  ctx.mark("editor grant held; reviewer selection changes next");
  await selectReviewer(grantLabel(ctx));
  await control().release("grantCitationReviewNativeAssignmentFn", "ok");
  await quiet("late grant settled");
  await waitFor(() => enabledEl(consentCheckbox(ctx)), "controls recovered");
  ctx.step(
    "the late editor grant cannot restore success/link; consent stays unchecked",
    !grantedShown(ctx) &&
      !byText(t("citationReview.grant.copy")) &&
      consentCheckbox(ctx)?.checked === false &&
      grantCalls(s2).length === 1 &&
      grantCalls(s2)[0].data.reviewerId === ed,
  );
  // 6) Revoke (email-only option) with exact payload and stored effect.
  await chooseRadixOption(ctx, t("citationReview.grant.selectRevoke"), revokeLabel());
  measureHere(ctx, "owner-revoke");
  const s3 = lastSeq(ctx);
  await clickEnabled(() => byText(t("citationReview.grant.revoke")), "Revoke");
  await waitFor(() => containsText(t("citationReview.grant.revoked")), "visible revoke result");
  await quiet("revoke");
  const rv = callsAfter(ctx, s3, "revokeCitationReviewAssignmentFn");
  ctx.step(
    "exactly one revoke for the exact reviewer/row; stored access AND native consent inactive",
    rv.length === 1 &&
      same(rv[0].data, { projectId: project, findingRowId: SAMESRC_ROW, reviewerId: rev }) &&
      asg(SAMESRC_ROW)?.active === false &&
      asg(SAMESRC_ROW).native?.active === false,
  );
  // 7) Every non-current member blocks all-set consent.
  const openWithReviewer = async (rowId, what, arm) => {
    await openOwnerFinding(ctx, rowId, arm);
    await selectReviewer(grantLabel(ctx));
    await waitFor(() => consentBox(), `${what}: consent disclosure`);
  };
  const noConsent = (what) =>
    ctx.step(
      `${what}: no all-set consent and no native grant`,
      !consentCheckbox(ctx) && !nativeGrantBtn(ctx),
    );
  for (const [rowId, what] of [
    [control().rows.legacyNative, "bare/legacy member"],
    [control().rows.unbindableNative, "unbound member"],
  ]) {
    await openWithReviewer(rowId, what);
    await quiet(what);
    noConsent(what);
    ctx.step(
      `${what}: shown unresolved`,
      consentItems()[0]?.getAttribute("data-native-consent-resolved") === "false",
    );
  }
  fixture.db.artifacts = fixture.db.artifacts.filter((a) => a.id !== G2_ART); // external deletion
  await openWithReviewer(SAMESRC_ROW, "missing member");
  await quiet("missing member");
  noConsent("missing (deleted) member");
  await openWithReviewer(control().rows.multiNative, "pending member", () =>
    control().defer("readNativeReportParsedFn", "hold"),
  );
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "readNativeReportParsedFn"),
    "member read held",
  );
  ctx.step(
    "pending member read: material masked, no consent or grant",
    reportViewsIn(ctx, consentBox()).length === 0 && !consentCheckbox(ctx) && !nativeGrantBtn(ctx),
  );
  await control().release("readNativeReportParsedFn", "ok");
  const recovered = await waitFor(
    () => consentCheckbox(ctx),
    "consent after the member read settles",
  );
  await quiet("pending member settled");
  ctx.step(
    "after the read settles consent is offered UNCHECKED (explicit consent still required)",
    recovered.checked === false && !enabled(nativeGrantBtn(ctx)),
  );
  await openWithReviewer(control().rows.multiNative, "failed member", () =>
    control().failNext("readNativeReportBindingFn"),
  );
  await quiet("failed member");
  noConsent("failed member read");
  ctx.step(
    "failed member read: the unbindable notice is shown",
    norm(consentBox()?.textContent).includes(norm(t("nativeIntake.consent.unbindable"))),
  );
  // 8) A legacy (non-native) grant never opts into native material.
  const src = control().rows.sourceFinding;
  await openOwnerFinding(ctx, src);
  await selectReviewer(grantLabel(ctx));
  ctx.step("a non-native finding shows no native consent disclosure", !consentBox());
  const s4 = lastSeq(ctx);
  await clickEnabled(() => byText(t("citationReview.grant.grant")), "legacy grant");
  await waitFor(() => grantedShown(ctx), "legacy grant success");
  await quiet("legacy grant");
  const lg = callsAfter(ctx, s4, "grantCitationReviewAssignmentFn");
  ctx.step(
    "legacy grant: exact payload with no native digest; stored assignment carries NO native consent",
    lg.length === 1 &&
      same(lg[0].data, { projectId: project, findingRowId: src, reviewerId: rev }) &&
      asg(src)?.active === true &&
      asg(src).native === null &&
      grantCalls(s4).length === 0,
  );
  // 9) A session change clears the checked consent (last: the bound mount is retired by the new epoch).
  await openWithReviewer(control().rows.multiNative, "session change");
  setCheckbox(await waitFor(() => consentCheckbox(ctx), "consent"), true);
  await waitFor(() => enabledEl(nativeGrantBtn(ctx)), "grant ready");
  ctx.mark("consent checked; same-actor epoch changes next");
  control().reHydrateSameActor(); // real same-actor session epoch change (store notifies)
  await waitFor(() => !consentCheckbox(ctx)?.checked, "consent retired by the session change");
  await quiet("session change");
  ctx.step(
    "session change clears the checked consent and admits no grant",
    !consentCheckbox(ctx)?.checked && !enabled(nativeGrantBtn(ctx)) && !grantedShown(ctx),
  );
  ctx.step("no external message/invitation (zero network)", inspect().network().length === 0);
}

async function group7_reviewerFreshRead(ctx) {
  const t = ctx.t;
  const row = control().rows.boundNative;
  const { project, owner, reviewer } = control().ids;
  // The FIRST authorized read was deferred BEFORE mount: nothing private may appear while it is pending.
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "getCitationFindingForReviewFn"),
    "first reviewer read pending",
  );
  ctx.step(
    "pending first read: no record/native/note/hash, no decision form, no receipt",
    reportViews(ctx).length === 0 &&
      !containsText(rowOf(row).record.observation) &&
      !containsText(t("citationReview.record.observation")) &&
      !decisionTrigger(ctx) &&
      !noteInput(ctx) &&
      !withdrawBtn(ctx),
  );
  await control().release("getCitationFindingForReviewFn", "ok");
  const report = await waitFor(() => reportViews(ctx)[0], "authorized native material rendered");
  await quiet("reviewer reads");
  checkReport(ctx, report, artifactOf(control().artifacts.google).parsed, "reviewer report");
  ctx.step(
    "the exact stored record is shown and whole-set inspection is claimed (every member inspectable)",
    !!containsText(rowOf(row).record.observation) && claimsInspectable(ctx),
  );
  // Submit a decision + note through the real controls.
  const note = "driver: inspected every retained row and approved";
  await chooseRadixOption(
    ctx,
    t("citationReview.reviewer.decisionLabel"),
    t("citationReview.reviewDecision.approved"),
  );
  setNativeValue(await waitFor(() => noteInput(ctx), "note input"), note);
  await raf2();
  measureHere(ctx, "reviewer-decision-note-submit"); // long URL + note report, decision, note, submit
  const s = lastSeq(ctx);
  await clickEnabled(() => reviewerSubmitBtn(ctx), "Submit decision");
  await waitFor(
    () => callsAfter(ctx, s, "saveCitationFindingReviewFn").length === 1,
    "review submitted",
  );
  await waitFor(() => withdrawBtn(ctx), "own receipt shown");
  await quiet("receipt follow-up reads");
  const sent = callsAfter(ctx, s, "saveCitationFindingReviewFn")[0];
  const served = await fixture.invoke("getCitationFindingForReviewFn", [
    { data: { projectId: project, ownerId: owner, findingRowId: row } },
  ]);
  const receipts = db().reviews.get(row) ?? [];
  const setSha = await control().expectedNativeSetDigest(row);
  ctx.step(
    "exactly one submit: exact scoped target, decision, note and the served version hash",
    callsAfter(ctx, s, "saveCitationFindingReviewFn").length === 1 &&
      same(sent.data, {
        projectId: project,
        ownerId: owner,
        findingRowId: row,
        expectedSha: served.recordSha256,
        decision: "approved",
        note,
      }),
  );
  ctx.step(
    "the stored receipt pins the exact version/hash and whole-set inspection under the current full-set consent",
    receipts.length === 1 &&
      receipts[0].reviewerId === reviewer &&
      receipts[0].findingVersion === rowOf(row).version &&
      receipts[0].recordSha256 === served.recordSha256 &&
      receipts[0].inspectionComplete === true &&
      typeof setSha === "string" &&
      db().assignments.get(`${project}:${row}:${reviewer}`)?.native?.setSha === setSha,
  );
  // A bare/legacy and an unbound native finding (ordinary assignment only) are refused, never "inspectable".
  for (const [rowId, what] of [
    [control().rows.legacyNative, "bare/legacy native"],
    [control().rows.unbindableNative, "unbound native"],
  ]) {
    const seq = lastSeq(ctx);
    api().surface("reviewer", rowId); // the reviewer opens another exact link (fresh mount, same client)
    await waitFor(
      () =>
        callsAfter(ctx, seq, "getCitationFindingForReviewFn").some(
          (c) => c.data.findingRowId === rowId,
        ),
      `${what}: exact-link read`,
    );
    await waitFor(() => unavailableShown(ctx), `${what}: refused`);
    await quiet(what);
    ctx.step(
      `${what} finding is refused: no material, never presented as complete inspection`,
      reportViews(ctx).length === 0 && !claimsInspectable(ctx) && !reviewerSubmitBtn(ctx),
    );
  }
}

async function group8_unknownHonest(ctx) {
  const L = (k) => ctx.t("nativeIntake." + k);
  await waitFor(() => reportViews(ctx).length === 3, "all three authorized reports rendered");
  await quiet("reviewer reads");
  const views = reportViews(ctx);
  const ids = [V_UNKNOWN, V_PAGES, V_GAPS];
  ids.forEach((id, i) =>
    checkReport(ctx, views[i], artifactOf(id).parsed, `reviewer variant ${short(id)}`),
  );
  ctx.step(
    "all-unknown Google: every retained row incl the last is unknown (exported zero), never a numeric zero",
    reportRows(views[0]).length === 2 &&
      reportRows(views[0]).every(
        (r) => r.includes(L("cell.unknown_export_zero")) && !/\(\d+\)/.test(r),
      ),
  );
  ctx.step(
    "Google pages: the withheld row is counted (partial), only the retained page row is rendered",
    artifactOf(V_PAGES).parsed.withheldPageRows === 1 &&
      reportText(views[1]).includes(norm(ctx.t("nativeIntake.partialWarn", { count: 1 }))) &&
      reportRows(views[1]).length === 1,
  );
  ctx.step(
    "Bing: the date gap is flagged; timezone unknown; market unsegmented",
    reportText(views[2]).includes(norm(L("coverageGapWarn"))) &&
      reportText(views[2]).includes(norm(L("timezoneUnknown"))) &&
      reportText(views[2]).includes(norm(L("scopeUnsegmented"))),
  );
  ctx.step(
    "source-specific metrics: Google impressions only; Bing citations + cited pages, never impressions",
    [0, 1].every(
      (i) =>
        reportText(views[i]).includes(L("metric.impressions")) &&
        !reportText(views[i]).includes(L("metric.citations")),
    ) &&
      reportText(views[2]).includes(L("metric.citations")) &&
      reportText(views[2]).includes(L("metric.cited_pages")) &&
      !reportText(views[2]).includes(L("metric.impressions")),
  );
  ctx.step(
    "whole-set inspectionComplete is shown WITHOUT rewriting any source completeness or hiding it",
    claimsInspectable(ctx) &&
      ids.every((id, i) =>
        reportText(views[i]).includes(
          norm(
            ctx.t("nativeIntake.sourceIncompleteWarn", {
              completeness: L("completeness." + artifactOf(id).parsed.input.completeness),
            }),
          ),
        ),
      ),
  );
}

async function group9_lossOfAccess(ctx) {
  const t = ctx.t;
  const row = control().rows.boundNative;
  const { project, owner, reviewer } = control().ids;
  const receipts = () => db().reviews.get(row) ?? [];
  const restore = async () => {
    for (const f of ["reviewExpired", "policyDenied", "findingDeleted", "mask"])
      control().setFlag(f, false);
    await control().grantNative(row);
  };
  await waitFor(() => reportViews(ctx)[0], "authorized material");
  await quiet("reviewer reads");
  // The actual PRIOR own receipt.
  const save = await submitDecision(ctx, "driver: own receipt before loss of access");
  await waitFor(
    () =>
      callsAfter(ctx, save.seq, "getCitationFindingForReviewFn").length >= 1 &&
      callsAfter(ctx, save.seq, "readCitationFindingReviewsFn").length >= 1,
    "receipt follow-up reads",
  );
  await quiet("receipt follow-up reads");
  await waitFor(
    () => withdrawBtn(ctx) && enabledEl(decisionTrigger(ctx)),
    "own receipt shown, form ready",
  );
  const receipt = clone(receipts()[0]);
  ctx.step(
    "the prior own receipt is stored",
    receipts().length === 1 && receipt.reviewerId === reviewer && !receipt.withdrawn,
  );
  // A) Assignment revoked outside the UI → the next submit is refused → immediate sticky hide.
  control().revoke(row);
  await submitDecision(ctx);
  await waitFor(() => unavailableShown(ctx), "revoked: refusal hides the surface");
  await quiet("revoked refusal");
  assertHidden(ctx, "revoked (refused submit)");
  const withdraw = await waitFor(() => withdrawBtn(ctx), "own-receipt withdraw control");
  measureHere(ctx, "reviewer-withdraw");
  const sW = lastSeq(ctx);
  await clickEnabled(() => withdraw, "Withdraw own receipt");
  await waitFor(
    () => containsText(t("citationReview.reviewer.withdrawn")),
    "visible withdrawal result",
  );
  await quiet("withdrawal");
  const rm = callsAfter(ctx, sW, "removeCitationFindingReviewFn");
  ctx.step(
    "own withdrawal completes for the exact receipt id; history preserved (withdrawn, not erased)",
    rm.length === 1 &&
      same(rm[0].data, { projectId: project, ownerId: owner, id: receipt.id }) &&
      receipts().length === 1 &&
      receipts()[0].id === receipt.id &&
      receipts()[0].withdrawn === true,
  );
  assertHidden(ctx, "after the withdrawal (denial stays sticky)");
  // A2) A fresh revoked remount cannot discover the receipt id.
  const sR = await reopenReviewer(ctx);
  await waitFor(() => unavailableShown(ctx), "fresh revoked remount refused");
  await quiet("fresh revoked remount");
  assertHidden(ctx, "fresh revoked remount");
  ctx.step(
    "fresh revoked remount offers no withdrawal and issues none",
    !withdrawBtn(ctx) && callsAfter(ctx, sR, "removeCitationFindingReviewFn").length === 0,
  );
  // B-D) Authority restored → fresh read → each external denial (distinct server branch) refuses the submit.
  for (const [flag, what] of [
    ["reviewExpired", "expired"],
    ["policyDenied", "policy denied"],
    ["findingDeleted", "finding deleted"],
  ]) {
    await restore();
    await reopenReviewer(ctx);
    await waitFor(
      () => reportViews(ctx).length === 1,
      `${what}: material after the restored fresh read`,
    );
    await quiet(`${what}: restored read`);
    control().setFlag(flag, true);
    await submitDecision(ctx);
    await waitFor(() => unavailableShown(ctx), `${what}: refused`);
    await quiet(`${what}: refusal`);
    assertHidden(ctx, `${what} (refused submit)`);
    ctx.step(`${what}: no receipt written`, receipts().length === 1);
  }
  // E) Schema-valid MASKED success: withheld, never inspectable, approval impossible.
  await restore();
  control().setFlag("mask", true);
  await reopenReviewer(ctx);
  await waitFor(() => containsText(t("citationReview.reviewer.withheld")), "masked projection");
  await quiet("masked read");
  ctx.step(
    "masked projection: withheld notice, no record/material, not claimed inspectable, Submit refused",
    reportViews(ctx).length === 0 &&
      !containsText(rowOf(row).record.observation) &&
      !claimsInspectable(ctx) &&
      !enabled(reviewerSubmitBtn(ctx)),
  );
  // F) A failed read on a fresh mount.
  control().setFlag("mask", false);
  control().failNext("getCitationFindingForReviewFn");
  await reopenReviewer(ctx);
  await waitFor(() => unavailableShown(ctx), "failed read");
  await quiet("failed read");
  assertHidden(ctx, "failed read");
  // G) A failed submit transport on an authorized mount.
  await reopenReviewer(ctx);
  await waitFor(() => reportViews(ctx).length === 1, "material again after a fresh success");
  await quiet("fresh success");
  control().failNext("saveCitationFindingReviewFn", "network_error");
  await submitDecision(ctx);
  await waitFor(() => unavailableShown(ctx), "failed submit");
  await quiet("failed submit");
  assertHidden(ctx, "failed submit");
  ctx.step(
    "only the original (withdrawn) receipt exists; nothing invented",
    receipts().length === 1,
  );
}

/* ----------------------------------- group 10: one held REAL chain per retirement trigger */

async function group10_citeReadDraftChange(ctx) {
  const { google } = control().artifacts;
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New finding");
  const sel = await waitFor(() => enabledEl(addNativeSelect(ctx)), "native add-select");
  setNativeValue(sel, google);
  await raf2();
  control().defer("readNativeReportBindingFn", "hold");
  control().defer("readNativeReportParsedFn", "hold");
  await clickEnabled(() => authorButton(ctx, ctx.t("nativeIntake.bind.cite")), "Cite (reads held)");
  await waitFor(
    () =>
      ["readNativeReportBindingFn", "readNativeReportParsedFn"].every((n) =>
        inspect()
          .pending()
          .some((p) => p.name === n),
      ),
    "both cite reads held",
  );
  // Draft change on the SAME mounted tree/client: Cancel, then a NEW draft.
  await clickEnabled(
    () => authorButton(ctx, ctx.t("citationAuthoring.common.cancel")),
    "Cancel draft",
  );
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New finding (new draft)");
  const boundary = ctx.mark("draft replaced while both cite reads are held");
  await control().release("readNativeReportBindingFn", "ok");
  await control().release("readNativeReportParsedFn", "ok");
  await quiet("late cite reads");
  ctx.step(
    "the late cite cannot patch the new draft: no ref, binding or material",
    citedRefIds().length === 0 && reportViewsIn(ctx, authorSection(ctx)).length === 0,
  );
  ctx.step(
    "no dependent call after the retirement boundary",
    callsAfter(ctx, boundary).length === 0,
  );
}

async function group10_saveSignOut(ctx) {
  const { google } = control().artifacts;
  // Positive control: the harness onSaved counter observes a normal save.
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New finding");
  await citeNative(ctx, google);
  await setObservation(ctx, "Driver race: positive onSaved control.");
  await reviewAndSave(ctx, 1);
  await waitFor(() => api().onSavedCount === 1, "onSaved after a normal save");
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "New finding 2");
  await citeNative(ctx, google);
  await setObservation(ctx, "Driver race: save held across sign-out.");
  await clickReview(ctx);
  const save = await waitFor(() => enabledEl(authorButton(ctx, saveLabel(ctx, 1))), "Save v1");
  control().defer("saveCitationFindingFn");
  clickEl(save);
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "saveCitationFindingFn"),
    "save held",
  );
  control().signOut();
  await raf2();
  const boundary = ctx.mark("signed out while the save is held");
  await control().release("saveCitationFindingFn", "ok");
  await quiet("late save");
  ctx.step(
    "late save: no saved notice, no invalidation refetch, no onSaved",
    !savedNotice(ctx, 1) && callsAfter(ctx, boundary).length === 0 && api().onSavedCount === 1,
  );
}

async function group10_conflictFollowupEpoch(ctx) {
  const row = control().rows.boundNative;
  const v1 = clone(rowOf(row));
  await startEdit(ctx, row);
  await viewBound(ctx, control().artifacts.google);
  await setObservation(ctx, "Driver race: conflict follow-up across a same-actor epoch.");
  await clickReview(ctx);
  const save = await waitFor(() => enabledEl(authorButton(ctx, saveLabel(ctx, 2))), "Save v2");
  insertCompetingHead(v1.findingId, "Competing edit committed by another session.");
  control().defer("readCitationFindingsFn", "hold");
  clickEl(save);
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "readCitationFindingsFn"),
    "conflict follow-up read held",
  );
  control().reHydrateSameActor();
  await raf2();
  const boundary = ctx.mark("same-actor epoch changed while the conflict follow-up is held");
  await control().release("readCitationFindingsFn", "ok");
  await quiet("late follow-up");
  ctx.step(
    "late follow-up: no head detail read, no save, no conflict comparison; chain untouched",
    callsAfter(ctx, boundary, "getCitationFindingFn").length === 0 &&
      callsAfter(ctx, boundary, "saveCitationFindingFn").length === 0 &&
      !containsText(ctx.t("citationAuthoring.author.conflictTitle")) &&
      chainOf(v1.findingId).length === 2,
  );
  ctx.step(
    "the retired author exposes no private draft or material",
    reportViewsIn(ctx, authorSection(ctx)).length === 0 && !observationTextarea(ctx),
  );
}

// Test-local, ONE-SHOT hold on the REAL WebCrypto digest of a native consent set (input text
// "native_review_set_v1…", as composed by the product helper). The original method computes the actual
// result; only its DELIVERY waits for release()/reject(). Any other digest passes straight through. The method
// is restored at the first matching call (and again by settle()), and settle() always settles an open hold.
let openHarnessHolds = 0;
function holdNativeSetDigest() {
  const subtle = globalThis.crypto.subtle;
  const original = subtle.digest; // the prototype method
  const h = { input: null, computed: null, settled: false };
  let started;
  h.started = new Promise((r) => (started = r));
  let deliver;
  let fail;
  const gate = new Promise((res, rej) => {
    deliver = res;
    fail = rej;
  });
  subtle.digest = function (algorithm, data) {
    const text = new TextDecoder().decode(data);
    if (!text.startsWith("native_review_set_v1")) return original.call(subtle, algorithm, data);
    delete subtle.digest; // one shot: back to the real prototype method
    h.input = text;
    h.computed = original.call(subtle, algorithm, data); // the ACTUAL result
    openHarnessHolds += 1;
    started();
    return gate.then(() => h.computed);
  };
  const done = () => {
    if (!h.settled && h.input !== null) {
      h.settled = true;
      openHarnessHolds -= 1;
    }
  };
  gate.then(done, done);
  h.release = () => deliver();
  h.reject = (e) => fail(e);
  h.settle = () => {
    if (Object.prototype.hasOwnProperty.call(subtle, "digest")) delete subtle.digest;
    if (h.input !== null && !h.settled) fail(Error("harness_digest_hold_retired"));
  };
  return h;
}

async function group10_consentDigestSessionEpoch(ctx) {
  const row = control().rows.multiNative;
  await openOwnerFinding(ctx, row);
  await chooseRadixOption(ctx, ctx.t("citationReview.grant.selectReviewer"), grantLabel(ctx));
  const consent = await waitFor(() => consentCheckbox(ctx), "consent");
  setCheckbox(consent, true);
  // Positive control FIRST (same mount): the uninterrupted actual Grant issues exactly one grant.
  const s0 = lastSeq(ctx);
  await clickEnabled(() => nativeGrantBtn(ctx), "grant (no interference)");
  await waitFor(() => grantedShown(ctx), "grant success");
  await quiet("positive grant");
  const expected = await control().expectedNativeSetDigest(row);
  const g0 = callsAfter(ctx, s0, "grantCitationReviewNativeAssignmentFn");
  ctx.step(
    "positive control: the actual Grant issues exactly one grant with the full-set digest",
    g0.length === 1 && g0[0].data.nativeSetSha256 === expected,
  );
  // Re-consent explicitly (clears the shown success), then HOLD the real client digest of the next Grant.
  setCheckbox(consentCheckbox(ctx), false);
  await waitFor(() => !grantedShown(ctx), "success cleared");
  setCheckbox(consentCheckbox(ctx), true);
  await waitFor(() => enabledEl(nativeGrantBtn(ctx)), "grant enabled again");
  await quiet("settled before arming");
  const hold = holdNativeSetDigest();
  try {
    const s1 = lastSeq(ctx);
    await clickEnabled(() => nativeGrantBtn(ctx), "Grant (client digest held)");
    await waitFor(() => hold.input !== null, "the client consent-set digest started and is held");
    ctx.step(
      "digest entered and held before any grant request",
      hold.input.startsWith("native_review_set_v1") &&
        callsAfter(ctx, s1, "grantCitationReviewNativeAssignmentFn").length === 0,
    );
    const boundary = ctx.mark("client consent digest held; same-actor session epoch changes next");
    control().reHydrateSameActor(); // real same-actor session epoch change (store notifies)
    await waitFor(
      () => !consentBox() && !nativeGrantBtn(ctx) && reportViews(ctx).length === 0,
      "disclosure masked by the session change",
    );
    ctx.step(
      "the retired session masks the disclosure at once (no consent, material or grant control)",
      !consentBox() && !nativeGrantBtn(ctx) && reportViews(ctx).length === 0,
    );
    hold.release(); // deliver the ACTUAL computed digest to the retired grant continuation
    await hold.computed;
    await raf2();
    await quiet("released digest");
    const hex = [...new Uint8Array(await hold.computed)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    ctx.step("the held result is the real digest of the full set", hex === expected);
    ctx.step(
      "late digest: zero grant/dependent calls, no success, no private re-exposure",
      callsAfter(ctx, boundary).length === 0 &&
        !grantedShown(ctx) &&
        !consentBox() &&
        reportViews(ctx).length === 0,
    );
  } finally {
    hold.settle(); // restore WebCrypto and settle the hold even on failure
  }
}

async function group10_grantProjectSwitch(ctx) {
  await openOwnerFinding(ctx, control().rows.multiNative);
  await chooseRadixOption(ctx, ctx.t("citationReview.grant.selectReviewer"), grantLabel(ctx));
  setCheckbox(await waitFor(() => consentCheckbox(ctx), "consent"), true);
  control().defer("grantCitationReviewNativeAssignmentFn");
  await clickEnabled(() => nativeGrantBtn(ctx), "native grant (held)");
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "grantCitationReviewNativeAssignmentFn"),
    "grant held",
  );
  control().switchProject();
  await raf2();
  const boundary = ctx.mark("project switched while the grant is held");
  await control().release("grantCitationReviewNativeAssignmentFn", "ok");
  await quiet("late grant");
  ctx.step(
    "late grant: no success, link or disclosure under the new project",
    !grantedShown(ctx) && !byText(ctx.t("citationReview.grant.copy")) && !consentBox(),
  );
  ctx.step(
    "after the boundary only the new project's own reads ran; no further grant",
    callsAfter(ctx, boundary).every((c) => c.data?.projectId === control().ids.project2) &&
      callsAfter(ctx, boundary, "grantCitationReviewNativeAssignmentFn").length === 0,
  );
}

async function group10_submitActorReplacement(ctx) {
  await waitFor(() => reportViews(ctx)[0], "authorized material");
  await quiet("reviewer reads");
  await chooseRadixOption(
    ctx,
    ctx.t("citationReview.reviewer.decisionLabel"),
    ctx.t("citationReview.reviewDecision.approved"),
  );
  control().defer("saveCitationFindingReviewFn");
  await clickEnabled(() => reviewerSubmitBtn(ctx), "Submit (held)");
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "saveCitationFindingReviewFn"),
    "submit held",
  );
  control().setActor("owner"); // actor replacement on the same tree/client
  await raf2();
  const boundary = ctx.mark("actor replaced (reviewer → owner) while the review submit is held");
  await control().release("saveCitationFindingReviewFn", "ok");
  await quiet("late submit");
  // The replacement actor's OWN fresh mount reads the reviewer endpoint as the owner: the fixture refuses it
  // and records exactly that one refusal — it is not old work.
  ctx.expect("getCitationFindingForReviewFn", 1);
  ctx.step(
    "late submit: no follow-up call under the old reviewer actor; no receipt or material exposed",
    callsAfter(ctx, boundary).every((c) => c.actor !== control().ids.reviewer) &&
      reportViews(ctx).length === 0 &&
      !withdrawBtn(ctx),
  );
}

async function group10_withdrawHydrationLoss(ctx) {
  await waitFor(() => reportViews(ctx)[0], "authorized material");
  await quiet("reviewer reads");
  await submitDecision(ctx);
  await waitFor(() => withdrawBtn(ctx), "own receipt shown");
  await quiet("receipt follow-up");
  control().defer("removeCitationFindingReviewFn");
  await clickEnabled(() => withdrawBtn(ctx), "Withdraw (held)");
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "removeCitationFindingReviewFn"),
    "withdrawal held",
  );
  control().pauseWorkspace(); // hydration loss
  await raf2();
  const boundary = ctx.mark("hydration lost while the withdrawal is held");
  ctx.step(
    "hydration loss masks all private material at once",
    reportViews(ctx).length === 0 && !decisionTrigger(ctx),
  );
  await control().release("removeCitationFindingReviewFn", "ok");
  control().resumeWorkspace();
  await raf2();
  await quiet("late withdrawal + resume");
  ctx.step(
    "late withdrawal: no refetch, no withdrawn notice, no private re-exposure after resume",
    callsAfter(ctx, boundary).length === 0 &&
      !containsText(ctx.t("citationReview.reviewer.withdrawn")) &&
      reportViews(ctx).length === 0,
  );
}

/* ----------------------------------------- group 11: same-QueryClient remounts (real reopen) */

async function group11_freshRemount(ctx) {
  const t = ctx.t;
  const row = control().rows.boundNative;
  const first = await waitFor(() => reportViews(ctx)[0], "initial authorized material");
  await quiet("reviewer reads");
  ctx.step(
    "prior authorized material shown before remount",
    reportSourceLabel(first) === t("nativeIntake.nativeLabel.gsc"),
  );
  // An UNSUBMITTED decision + note on the cached mount.
  await chooseRadixOption(
    ctx,
    t("citationReview.reviewer.decisionLabel"),
    t("citationReview.reviewDecision.approved"),
  );
  setNativeValue(await waitFor(() => noteInput(ctx), "note input"), "driver: unsent note");
  await raf2();
  // Fresh PENDING read on the same client.
  control().defer("getCitationFindingForReviewFn");
  await reopenReviewer(ctx);
  await waitFor(
    () =>
      inspect()
        .pending()
        .some((p) => p.name === "getCitationFindingForReviewFn"),
    "fresh read pending",
  );
  ctx.step(
    "pending fresh read: no prior material, record, decision, note or receipt flashes",
    reportViews(ctx).length === 0 &&
      !containsText(rowOf(row).record.observation) &&
      !decisionTrigger(ctx) &&
      !noteInput(ctx) &&
      !withdrawBtn(ctx),
  );
  await control().release("getCitationFindingForReviewFn", "ok");
  await waitFor(() => reportViews(ctx).length >= 1, "material after the fresh successful read");
  await quiet("fresh success");
  ctx.step(
    "the new mount starts without the old decision/note; approval is not pre-qualified",
    norm(decisionTrigger(ctx)?.textContent) === t("citationReview.reviewer.chooseDecision") &&
      noteInput(ctx)?.value === "" &&
      !enabled(reviewerSubmitBtn(ctx)),
  );
  // Fresh FAILURE while a prior success is cached.
  control().failNext("getCitationFindingForReviewFn");
  await reopenReviewer(ctx);
  await waitFor(() => unavailableShown(ctx), "fresh read failed");
  await quiet("fresh failure");
  assertHidden(ctx, "fresh failed read after a cached success");
  const s = await reopenReviewer(ctx);
  await waitFor(() => reportViews(ctx).length >= 1, "material after a later fresh success");
  await quiet("later success");
  ctx.step(
    "a later reopen exposes material only after its own successful read",
    callsAfter(ctx, s, "getCitationFindingForReviewFn").length === 1,
  );
}

async function group11_ownerRemountConsent(ctx) {
  const t = ctx.t;
  const row = control().rows.multiNative;
  const reopenOwner = async () => {
    const seq = lastSeq(ctx);
    api().remount(); // re-open the owner surface on the SAME client
    await waitFor(
      () => callsAfter(ctx, seq, "readCitationFindingsFn").length >= 1,
      "fresh owner list read",
    );
    await quiet("owner remount");
  };
  await openOwnerFinding(ctx, row);
  await chooseRadixOption(ctx, t("citationReview.grant.selectReviewer"), grantLabel(ctx));
  setCheckbox(await waitFor(() => consentCheckbox(ctx), "consent"), true);
  await waitFor(() => enabledEl(nativeGrantBtn(ctx)), "consent accepted on the cached mount");
  await reopenOwner();
  ctx.step("the remount drops the open row and its accepted consent", !consentBox());
  await openOwnerFinding(ctx, row, () => control().defer("readNativeReportParsedFn", "hold"));
  await chooseRadixOption(ctx, t("citationReview.grant.selectReviewer"), grantLabel(ctx));
  ctx.step(
    "pending member read after remount: no cached material, consent or grant",
    reportViewsIn(ctx, consentBox()).length === 0 && !consentCheckbox(ctx) && !nativeGrantBtn(ctx),
  );
  await control().release("readNativeReportParsedFn", "ok");
  const c = await waitFor(() => consentCheckbox(ctx), "consent after the fresh read");
  await quiet("fresh member reads");
  ctx.step(
    "the old consent is not restored: unchecked, grant disabled",
    c.checked === false && !enabled(nativeGrantBtn(ctx)),
  );
  await reopenOwner();
  await openOwnerFinding(ctx, row, () => control().failNext("readNativeReportBindingFn"));
  await chooseRadixOption(ctx, t("citationReview.grant.selectReviewer"), grantLabel(ctx));
  await quiet("failed member read");
  ctx.step(
    "failed member read after remount: no cached material or consent",
    !consentCheckbox(ctx) && reportViewsIn(ctx, consentBox()).length === 0,
  );
  ctx.step("no grant was issued", ctx.countOf("grantCitationReviewNativeAssignmentFn") === 0);
}

async function group12_localeRender(ctx) {
  assert(
    document.documentElement.lang === ctx.cell.locale,
    `document.lang is ${document.documentElement.lang}, expected ${ctx.cell.locale}`,
  );
  ctx.step(
    "actual i18n active: localized author title renders",
    !!(await waitFor(() => authorReady(ctx), "localized author title")),
  );
  ctx.step(
    "clean session: workspace userId equals the signed-in actor",
    fixture.state.userId === fixture.auth.actorId,
  );
}

/* -------------------------------- measured targets + overflow across exercised states */

// Accumulated measurement records for the summary; reset per cell by runCell.
let TARGET_LOG = [];
const TARGETS = "button, select, textarea, input, [role=combobox], [role=checkbox]";
// Measure every visible product target in the CURRENT state (within `scope`), record each under-44px one, and
// assert >= 44px for the `required` checklist targets (all measured targets when none are given) plus no
// horizontal overflow. A checkbox's real hit target is its label.
function measureHere(ctx, label, { scope = root(), required = null } = {}) {
  const targets = within(scope, TARGETS).filter(
    (n) => !n.closest("[data-fixture-controls]") && n.offsetParent !== null && n.type !== "hidden",
  );
  const small = [];
  const requiredSmall = [];
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    let w = r.width;
    let h = r.height;
    if (el.type === "checkbox") {
      const lr = el.closest("label")?.getBoundingClientRect();
      if (lr) {
        w = Math.max(w, lr.width);
        h = Math.max(h, lr.height);
      }
    }
    if (Math.min(w, h) >= 44 - 0.5) continue;
    const entry = {
      text: (el.textContent || el.getAttribute("aria-label") || el.type || "").trim().slice(0, 40),
      w: Math.round(w),
      h: Math.round(h),
    };
    small.push(entry);
    if (!required || required.includes(el)) requiredSmall.push(entry);
  }
  const asserted = required ? targets.filter((el) => required.includes(el)).length : targets.length;
  const de = document.documentElement;
  const overflow =
    root().scrollWidth > root().clientWidth + 1 || de.scrollWidth > de.clientWidth + 1;
  TARGET_LOG.push({
    state: label,
    locale: ctx.cell.locale,
    viewport: ctx.cell.viewport,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    measured: targets.length,
    asserted,
    small,
    requiredSmall,
    overflow,
    scrollWidth: root().scrollWidth,
    clientWidth: root().clientWidth,
  });
  ctx.step(
    `[${label}] all ${asserted} ${required ? "required" : "exercised"} targets >= 44px (${requiredSmall.length} under)`,
    requiredSmall.length === 0 && (!required || asserted === required.length),
  );
  ctx.step(`[${label}] no horizontal overflow`, !overflow);
}

async function group13_targetsAndOverflow(ctx) {
  // Author create/bind + review states, with long content to probe overflow. Grant/revoke/copy, reviewer
  // decision/submit/note and withdraw target sizes are measured IN their own exercised groups (6/7/9).
  await waitFor(() => authorReady(ctx), "author");
  await clickEnabled(() => newFindingButton(ctx, "citation_source"), "new finding");
  await raf2();
  await citeNative(ctx, control().artifacts.google);
  await setObservation(
    ctx,
    "measure — a long observation line to probe horizontal overflow on the author surface with extended content that should wrap and never produce a horizontal scrollbar even at 390px width.",
  );
  measureHere(ctx, "author-create-bind");
  await clickReview(ctx);
  await waitFor(() => authorButton(ctx, saveLabel(ctx, 1)), "save button");
  measureHere(ctx, "author-review");
}

async function group14_boundary(ctx) {
  await waitFor(() => authorReady(ctx), "author");
  // The ONE explicit negative probe: an unknown transport is refused (fail-closed) and is the ONLY violation
  // allowed, with an EXACT count of 1 (runCase enforces zero others and exactly this count).
  ctx.expect("someUnknownFn", 1);
  let refused = false;
  try {
    await fixture.invoke("someUnknownFn", [{ data: {} }]);
  } catch {
    refused = true;
  }
  ctx.step(
    "unknown transport refused (fail-closed) and recorded",
    refused &&
      inspect()
        .violations()
        .some((v) => v.name === "someUnknownFn"),
  );
}

/* ------------------------------------------------- negative self-checks (BDR3-03/05) */

// The harness MUST fail each injected counterexample FOR ITS INTENDED REASON, with a complete drain: an owner read
// in a reviewer phase, an unexpected violation, a forbidden call during STARTUP (before the body), and a fresh
// HTML with an old/absent executed bundle id (refused before ANY case). A bad self-check halts the autorun.
async function selfCheck() {
  const identity = buildIdentity();
  if (!identity.match)
    return {
      ok: false,
      halted: "executed bundle identity mismatch/absent: self-check cases not run",
      identity,
      checks: [],
    };
  const out = [];
  const cell = { locale: "en", viewport: `${window.innerWidth}x${window.innerHeight}` };
  const ownerRead = () =>
    fixture
      .invoke("readCitationFindingsFn", [
        { data: { projectId: control().ids.project, expectedOwnerId: control().ids.owner } },
      ])
      .catch(() => {});
  const negatives = [
    [
      "selfcheck_owner_read_in_reviewer",
      { surface: "reviewer", actor: "reviewer" },
      async (ctx) => {
        await ownerRead();
        ctx.step(
          "injection executed: owner read present in trace",
          ctx.countOf("readCitationFindingsFn") >= 1,
        );
      },
      (r) =>
        /owner-only reads/.test(r.phase || "") &&
        r.trace.some((c) => c.name === "readCitationFindingsFn"),
    ],
    [
      "selfcheck_injected_violation",
      { surface: "owner-author" },
      async (ctx) => {
        await fixture.invoke("someUnknownFn", [{ data: {} }]).catch(() => {}); // NOT expected → must fail
        ctx.step("injection executed: violation recorded", ctx.countOf("someUnknownFn") === 1);
      },
      (r) =>
        /unexpected violations: someUnknownFn/.test(r.phase || "") &&
        r.violationNames.includes("someUnknownFn"),
    ],
    [
      "selfcheck_startup_violation",
      { surface: "reviewer", actor: "reviewer", seed: ownerRead }, // forbidden call BEFORE mount/body
      async (ctx) => {
        ctx.step(
          "startup injection is in the case trace before the body",
          ctx.calls()[0]?.name === "readCitationFindingsFn",
        );
      },
      (r) =>
        /owner-only reads/.test(r.phase || "") &&
        /unexpected violations/.test(r.phase || "") &&
        r.trace[0]?.name === "readCitationFindingsFn",
    ],
  ];
  for (const [name, opts, body, intended] of negatives) {
    const r = await runCase(name, cell, opts, body);
    out.push({
      name,
      ok: r.status === "failed" && intended(r) && r.retirementComplete,
      phase: r.phase,
    });
    if (!r.retirementComplete) break;
  }
  // Fresh HTML + old/absent executed bundle id: runCell must refuse BEFORE any case (no setup, no record).
  for (const [name, executed] of [
    ["selfcheck_old_bundle_new_html", "stale-old-bundle-id"],
    ["selfcheck_absent_bundle_id", undefined],
  ]) {
    const saved = window.__miloFixtureBundleId;
    const resultsBefore = results.length;
    const mountsBefore = api().teardownCounts?.mountCount;
    window.__miloFixtureBundleId = executed;
    let r;
    try {
      r = await runCell({ locale: "en", width: window.innerWidth, height: window.innerHeight });
    } finally {
      window.__miloFixtureBundleId = saved;
    }
    out.push({
      name,
      ok:
        r.status === "failed-setup" &&
        /identity/.test(r.reason || "") &&
        r.groups.length === 0 &&
        results.length === resultsBefore &&
        api().teardownCounts?.mountCount === mountsBefore,
      phase: r.reason,
    });
  }
  // Remove the deliberately-failed self-check cases from the published results; keep only the meta.
  for (let i = results.length - 1; i >= 0; i--)
    if (results[i].name.startsWith("selfcheck_")) results.splice(i, 1);
  return {
    ok: out.length === negatives.length + 2 && out.every((x) => x.ok),
    identity,
    checks: out,
  };
}

/* ------------------------------------------------------------------- the matrix */

// Stable per-cell journeys. Groups 7/11 defer the FIRST reviewer read before mount so the pending-read masking
// is real. `seed` runs after setupCase, before mount (valid starting data only).
const PER_CELL = [
  [
    "group1_nativeOnlyCreate",
    group1_nativeOnlyCreate,
    { surface: "workspace", seed: seedLongGoogleReport },
  ],
  ["group2_mixedEdit", group2_mixedEdit, { surface: "owner-author" }],
  [
    "group2_evidenceLimit20",
    group2_evidenceLimit20,
    { surface: "owner-author", seed: seedEvidenceLimit },
  ],
  ["group3_legacyUpgrade", group3_legacyUpgrade, { surface: "owner-author" }],
  ["group4_intakeFreshness", group4_intakeFreshness, { surface: "workspace" }],
  ["group5_doubleSubmitConflict", group5_doubleSubmitConflict, { surface: "owner-author" }],
  ["group6_consent", group6_consent, { surface: "owner-review", seed: seedSameSource }],
  [
    "group7_reviewerFreshRead",
    group7_reviewerFreshRead,
    {
      surface: "reviewer",
      actor: "reviewer",
      deferBeforeMount: ["getCitationFindingForReviewFn"],
      seed: seedReviewerLinks,
    },
  ],
  [
    "group8_unknownHonest",
    group8_unknownHonest,
    { surface: "reviewer", actor: "reviewer", findingRowId: V_ROW, seed: seedVariants },
  ],
  [
    "group9_lossOfAccess",
    group9_lossOfAccess,
    { surface: "reviewer", actor: "reviewer", seed: seedLongGoogleReport },
  ],
  ["group12_localeRender", group12_localeRender, { surface: "owner-author" }],
  ["group13_targetsAndOverflow", group13_targetsAndOverflow, { surface: "owner-author" }],
  ["group14_boundary", group14_boundary, { surface: "owner-author" }],
];

// BDR3-05: the EXECUTED bundle's first-line marker (window.__miloFixtureBundleId, a hash of the actual emitted
// bundle content) must equal the id the fresh HTML expects (window.__miloFixtureExpectedBundleId). A cached old
// bundle.js emits an OLD id → mismatch → refused before any case. The root also compares build-info.json.
function buildIdentity() {
  const expected = window.__miloFixtureExpectedBundleId ?? null;
  const executed = window.__miloFixtureBundleId ?? null;
  return {
    expected,
    executed,
    buildId: window.__miloFixtureBuildId ?? null,
    buildInfo: window.__miloFixtureBuildInfo ?? null, // bundle/content/CSS/guard hashes echoed by the HTML
    match: !!expected && !!executed && expected === executed,
    note: "Executed-bundle id must equal the HTML's expected id (defeats a cached old bundle); compare both and the hashes to build-info.json.",
  };
}

// Required before ANY case: matching executed identity, the foundation retirement APIs, the entry API, and the
// EXACT requested CSS viewport (no tolerance).
function preflight(width, height) {
  const p = [];
  const id = buildIdentity();
  if (!id.match)
    p.push(
      `executed bundle identity mismatch/absent (expected ${id.expected}, executed ${id.executed})`,
    );
  if (
    typeof fixture.control?.retireCase !== "function" ||
    typeof fixture.inspect?.inFlight !== "function"
  )
    p.push("required foundation control.retireCase()/inspect.inFlight() missing");
  if (typeof api()?.case !== "function" || typeof api()?.retire !== "function")
    p.push("entry case()/retire() missing");
  if (!Number.isFinite(width) || !Number.isFinite(height))
    p.push("exact requested width AND height are required");
  else if (window.innerWidth !== width || window.innerHeight !== height)
    p.push(
      `viewport ${window.innerWidth}x${window.innerHeight} is not the requested ${width}x${height} (resize the real browser first)`,
    );
  return p;
}

const results = [];
function publish(rec) {
  results.push(rec);
  const el = document.getElementById("results");
  if (el) el.textContent = JSON.stringify(summarize(), null, 2);
  window.__nativeFindingsDriver = summarize();
}
function summarize() {
  return {
    driver: "native-findings",
    stage:
      "R4B: scripted coverage of groups 1-14 (races via runRaces); native keyboard is a separate manual checklist",
    disclaimer:
      "Executed by the root in a real browser. No SQL/live-authorization, native-keyboard or human-language acceptance is claimed here.",
    counts: {
      passed: results.filter((r) => r.status === "passed").length,
      failed: results.filter((r) => r.status === "failed").length,
      total: results.length,
    },
    buildIdentity: buildIdentity(),
    foundationApi: {
      retireCase: typeof fixture.control.retireCase === "function",
      inFlight: typeof fixture.inspect.inFlight === "function",
      note: "control.retireCase()/inspect.inFlight() are REQUIRED; their absence fails preflight and every case.",
    },
    nativeKeyboardChecklist: NATIVE_KEYBOARD_CHECKLIST,
    targetMeasurements: TARGET_LOG,
    results,
  };
}

const NATIVE_KEYBOARD_CHECKLIST = {
  note: "Run with a real keyboard in a real browser; a programmatic DOM driver cannot prove native keyboard usability (checklist only).",
  locales: ["en desktop", "en 390px", "pl 390px", "sv 390px", "da 390px"],
  checks: [
    "Tab/Shift+Tab reaches every create/edit/native-picker/bind/Review/Save/grant/revoke/decision/withdraw/copy control in a logical order with a visible focus ring.",
    "House Select (reviewer picker, decision) opens with Enter/Space and options are chosen with the arrow keys + Enter.",
    "The consent checkbox toggles with Space; Review/Save/Grant/Submit activate with Enter.",
    "No focus trap. The intake delete confirm is an inline alert (no Escape handler): Tab/Shift+Tab reaches its Cancel and Delete, Enter/Space activates them, and focus then continues logically. Escape-close with focus return is checked on the house Select popups only.",
  ],
};

// Run cases in order, STOPPING after one whose retirement is incomplete (its evidence must not be reset away).
async function runSequence(target, list, cell) {
  for (let i = 0; i < list.length; i++) {
    const [name, fn, opts] = list[i];
    const rec = await runCase(name, cell, opts, fn);
    target.groups.push(rec);
    if (!rec.retirementComplete) {
      target.halted = `${name}: retirement incomplete — following cases not run so its evidence is preserved`;
      target.notRun = list.slice(i + 1).map(([n]) => n);
      return;
    }
  }
}
function cellRecord(locale, width, height) {
  return {
    locale,
    requestedWidth: width ?? null,
    requestedHeight: height ?? null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    buildIdentity: buildIdentity(),
    status: "running",
    halted: null,
    notRun: [],
    groups: [],
  };
}

// A SINGLE externally-resized cell. The ROOT resizes the real browser to EXACTLY `width`x`height` CSS px first
// (1440x906 desktop, 390x<fixed> mobile); preflight refuses any case otherwise.
async function runCell({ locale, width, height } = {}) {
  const cellRec = cellRecord(locale, width, height);
  TARGET_LOG = []; // measured target/overflow records for THIS cell only
  const problems = preflight(width, height);
  if (problems.length) {
    cellRec.status = "failed-setup";
    cellRec.reason = problems.join("; ");
    window.__nativeFindingsCell = cellRec;
    return cellRec;
  }
  await runSequence(cellRec, PER_CELL, { locale, viewport: `${width}x${height}`, width, height });
  cellRec.status = cellRec.halted
    ? "halted"
    : cellRec.groups.every((g) => g.status === "passed")
      ? "passed"
      : "failed";
  cellRec.targetMeasurements = TARGET_LOG;
  window.__nativeFindingsCell = cellRec;
  return cellRec;
}

// The async race journeys: group 10 = one held REAL chain per distinct async chain, together covering every
// retirement trigger once (selection/draft change, sign-out, same-actor re-hydration epoch, session epoch,
// project, actor replacement, hydration loss); group 11 = same-client reviewer and owner remounts. Each case
// keeps ONE tree/client.
const RACES = [
  ["group10_citeRead_draftChange", group10_citeReadDraftChange, { surface: "owner-author" }],
  ["group10_save_signOut", group10_saveSignOut, { surface: "owner-author" }],
  [
    "group10_conflictFollowup_sameActorEpoch",
    group10_conflictFollowupEpoch,
    { surface: "owner-author" },
  ],
  [
    "group10_consentDigest_sessionEpoch",
    group10_consentDigestSessionEpoch,
    { surface: "owner-review" },
  ],
  ["group10_grant_projectSwitch", group10_grantProjectSwitch, { surface: "owner-review" }],
  [
    "group10_reviewSubmit_actorReplacement",
    group10_submitActorReplacement,
    { surface: "reviewer", actor: "reviewer" },
  ],
  [
    "group10_withdrawal_hydrationLoss",
    group10_withdrawHydrationLoss,
    { surface: "reviewer", actor: "reviewer" },
  ],
  ["group11_reviewerRemount", group11_freshRemount, { surface: "reviewer", actor: "reviewer" }],
  ["group11_ownerRemountConsent", group11_ownerRemountConsent, { surface: "owner-review" }],
];
// At the EXACT externally-set viewport. `names` (optional) selects the critical 390px repetitions.
async function runRaces({ locale = "en", width, height, names } = {}) {
  const raceRec = cellRecord(locale, width, height);
  const problems = preflight(width, height);
  const list = names ? RACES.filter(([n]) => names.includes(n)) : RACES;
  if (names && list.length !== names.length) problems.push("unknown race name(s) requested");
  if (problems.length) {
    raceRec.status = "failed-setup";
    raceRec.reason = problems.join("; ");
    return raceRec;
  }
  TARGET_LOG = [];
  await runSequence(raceRec, list, { locale, viewport: `${width}x${height}`, width, height });
  raceRec.targetMeasurements = TARGET_LOG;
  raceRec.status = raceRec.halted
    ? "halted"
    : raceRec.groups.every((g) => g.status === "passed")
      ? "passed"
      : "failed";
  return raceRec;
}

export const driver = {
  runCell,
  runRaces,
  selfCheck,
  buildIdentity,
  perCell: PER_CELL.map(([n]) => n),
  races: RACES.map(([n]) => n),
  nativeKeyboardChecklist: NATIVE_KEYBOARD_CHECKLIST,
  results,
};
