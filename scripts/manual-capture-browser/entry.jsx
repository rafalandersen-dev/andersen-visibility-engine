// CG-03C manual-capture fixture. Mounts the ACTUAL citation-review route with the real AppShell (project picker and
// navigation), CitationPanelProtocolPanel, ManualCaptureEntry and Radix dialogs under a REAL TanStack router on
// hash history: Back/Forward, router blocking and the unload guard are the browser's own. Store, auth and server
// functions are synthetic (store.js, auth.js, fixture.js); the network guard in index.html refuses every request.
//
//   index.html?locale=en|pl|sv|da[&check=1]
//
// Without check=1 the page is interactive (fixture controls are labelled as outside the product). With check=1 a
// scripted check drives the real controls through every guard and uncertain-response case and writes a JSON report
// to #results and window.__manualCaptureReport. Expected values are written out here, never derived by the code
// under test.
import React from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route as citationReview } from "@/routes/_authenticated/app.citation-review";
import { buildPanelDraft, emptyPanelDraftForm } from "@/lib/citation-panel-ui";
import { MANUAL_CAPTURE_METHOD } from "@/lib/manual-capture-ui";
import { seedProjects } from "@/lib/mock-data";
import { translate } from "@/i18n";
import { fixture } from "./fixture.js";

const params = new URLSearchParams(location.search);
const locale = ["en", "pl", "sv", "da"].includes(params.get("locale"))
  ? params.get("locale")
  : "en";
const check = params.get("check") === "1";
if (location.search) history.replaceState(history.state, "", location.pathname + location.hash);
const t = (key, vars) => translate(locale, key, vars);
try {
  localStorage.removeItem("milo.uiLocale");
} catch {
  // Storage may be unavailable; the synthetic project language then decides.
}

// ---- explicit synthetic seed ----------------------------------------------------------------------------------
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const PANEL = "d0d0d0d0-0000-4000-8000-0000000000d1";
const DAY = 86400000;
const stockholmDate = (ms) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(new Date(ms));
// Rounds at 10:00 Stockholm on day −15, −8, −1 and +6: rounds 1–3 are due, round 4 is not.
const FIRST_SLOT = stockholmDate(Date.now() - 15 * DAY);
const prompts = Array.from({ length: 10 }, (_, i) => ({
  id: `c0c0c0c0-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
  revision: 1,
  createdAt: "2026-08-01T00:00:00Z",
  data: {
    prompt: `FIXTURE Who services heat pumps in Oslo? (#${i + 1})`,
    intent: "discovery",
    source: "manual",
    market: "NO — Oslo",
    language: "en",
    brand: "Nordlys",
    websiteUrl: "https://nordlys.example.com",
    competitorUrls: [],
    active: true,
  },
}));
const built = buildPanelDraft(
  {
    ...emptyPanelDraftForm({ clientName: "Nordlys", market: "NO — Oslo", language: "en" }),
    surface: {
      service: "Synthetic chat app",
      interface: "web",
      mode: "consumer-web",
      searchMode: "",
      modelLabel: "",
      webSearchEvidenced: "unknown",
    },
    // A planned collection country, so an unrecorded country shows as a gap in the recorded details.
    collection: { country: "NO", city: "", devicePermission: "unknown", vpn: "unknown" },
    questionKeys: prompts.map((p) => `${p.id}:1`),
    firstSlot: { date: FIRST_SLOT, time: "10:00" },
  },
  PANEL,
  0,
  prompts.map((p) => ({ id: p.id, revision: 1, text: p.data.prompt, language: "en" })),
);
if (!built.ok) throw Error("fixture panel: " + built.issues.join(", "));
const panel = {
  ...built.draft,
  status: "locked",
  approval: { approvedBy: ACTOR, approvedAt: new Date(Date.now() - 17 * DAY).toISOString() },
};
const slotAt = (questionIndex, round) =>
  panel.schedule.slots.find((s) => s.round === round).intendedAt;
function seedDb() {
  return {
    prompts,
    panels: [panel],
    // NO-D02 round 1 already has an original; NO-D02 round 2 was used by a deleted one.
    answers: [
      {
        id: "0a0a0a0a-0000-4000-8000-000000000001",
        createdAt: "2026-10-01T00:00:00Z",
        hash: "0".repeat(64),
        input: {
          captureContext: {
            panelId: PANEL,
            panelVersion: 1,
            slot: { questionId: "NO-D02", round: 1 },
          },
        },
      },
    ],
    captures: [
      {
        answerId: "0a0a0a0a-0000-4000-8000-000000000001",
        panelId: PANEL,
        panelVersion: 1,
        kind: "discovery",
        outcome: "complete",
        deviations: [],
        panelResolved: true,
        brandRunResolved: null,
        contextMalformed: false,
        slot: { questionId: "NO-D02", round: 1 },
        brandRunId: null,
        captureContext: null,
      },
    ],
    erasedSlots: [
      {
        answerId: "0e0e0e0e-0000-4000-8000-000000000001",
        panelId: PANEL,
        panelVersion: 1,
        brandRunId: null,
        questionId: "NO-D02",
        round: 2,
        panelResolved: true,
        brandRunResolved: null,
      },
    ],
    reports: [
      {
        panelId: PANEL,
        panelVersion: 1,
        kind: "discovery",
        planned: 40,
        observed: 1,
        erased: 1,
        erasedExtra: 0,
        liveExtra: 0,
        recorded: 2,
        neverObserved: 38,
        coverageComplete: true,
        excluded: 0,
        outcomes: { complete: 1, failed: 0, truncated: 0, missed: 0, protocol_deviant: 0 },
        brandRuns: [],
      },
    ],
  };
}
const projectRow = {
  ...seedProjects[0],
  id: "p",
  name: "Nordlys Heating",
  businessName: "Nordlys Heating",
  appLanguage: locale,
};
delete projectRow.websiteUrl;
function seedState() {
  return {
    projects: [
      projectRow,
      { ...projectRow, id: "q", name: "Second client", businessName: "Second client" },
    ],
    services: [],
    opportunities: [],
    discoverySuggestions: [],
    calendar: [],
    content: [],
    audits: [],
    competitorAnalyses: [],
    authorityAnalyses: [],
    aiVisibilityAnalyses: [],
    backlinkAnalyses: [],
    linkMarketplaceOrders: [],
    outreachDrafts: [],
    authorityOpportunities: [],
    aiEvaluationRuns: [],
    tasks: [],
    pendingActions: [],
    activeProjectId: "p",
    hydrated: true,
    hydrationFailed: false,
    userId: ACTOR,
    rev: 1,
  };
}
fixture.actorId = ACTOR;
fixture.state = seedState();
fixture.db = seedDb();
fixture.reset = () => {
  fixture.db = seedDb();
  fixture.outcomes = [];
  fixture.failReads = false;
  fixture.failReadNames.clear();
};
// Session controls, exactly as resetStore/hydrateForUser behave: the epoch advances on every (re)hydration.
fixture.signOut = () => {
  fixture.actorId = null;
  fixture.epoch += 1;
  fixture.state = { ...fixture.state, userId: null, hydrated: false };
  fixture.emit();
};
fixture.signIn = () => {
  fixture.actorId = ACTOR;
  fixture.epoch += 1;
  fixture.state = { ...seedState() };
  fixture.emit();
};
/** `n` unrelated (non-panel) answer records, to bring the project near its 100-record capacity. */
fixture.addUnrelatedAnswers = (n) => {
  for (let i = 0; i < n; i++) {
    const k = fixture.db.answers.length + 1;
    fixture.db.answers.push({
      id: `0b0b0b0b-0000-4000-8000-${String(k).padStart(12, "0")}`,
      createdAt: "2026-10-01T00:00:00Z",
      hash: String(k).padStart(64, "0"),
      input: {
        promptId: prompts[9].id,
        promptRevision: 1,
        surface: "Synthetic chat app",
        mode: "consumer-web",
        method: "manual",
        modelVersion: null,
        capturedAt: "2026-10-01T00:00:00Z",
        status: "complete",
        rawAnswer: `Unrelated evidence ${k}`,
        citations: [],
        citationsComplete: false,
        failure: null,
        reportedCostUsd: null,
        sourceUrl: null,
        supersedesId: null,
      },
    });
  }
};
/** Deterministic delayed session loss. These controls are inside the app root, which the open entry makes
 * inert, so schedule first, then open the entry and a leave dialog (Escape or Back) within the delay. */
fixture.later = (fn, ms = 30000) => {
  const at = new Date(Date.now() + ms).toLocaleTimeString("en-GB");
  const note = document.querySelector("[data-fixture-schedule]");
  if (note) note.textContent = `Session loss scheduled at ${at}`;
  return setTimeout(() => {
    if (note) note.textContent = `Session loss applied (was scheduled for ${at})`;
    fn();
  }, ms);
};
fixture.reHydrateSameActor = () => {
  // As resetStore then hydrateForUser do for the same user: the epoch advances and hydration passes through false.
  fixture.epoch += 1;
  fixture.state = { ...fixture.state, hydrated: false };
  fixture.emit();
  setTimeout(() => {
    fixture.epoch += 1;
    fixture.state = { ...fixture.state, hydrated: true };
    fixture.emit();
  }, 0);
};

// ---- real routes under a real router --------------------------------------------------------------------------
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const authenticated = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: () => <Outlet />,
});
citationReview.update({
  id: "/app/citation-review",
  path: "/app/citation-review",
  getParentRoute: () => authenticated,
});
const destination = (label) => () => (
  <p data-fixture-destination={label} className="p-6 text-sm">
    {label} (fixture destination outside CG-03C)
  </p>
);
const extra = ["/app", "/app/today", "/app/setup", "/app/plan", "/app/analytics"].map((p) =>
  createRoute({ getParentRoute: () => authenticated, path: p, component: destination(p) }),
);
const auth = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: destination("/auth"),
});
// Start on another page so the browser has a real Back entry behind the citation-review page. Both entries are
// written through the installed history API, so each carries its own index (0, then 1): a blocked Back then has
// a real delta, and Stay returns to the page instead of go(0) reloading it.
const hashHistory = createHashHistory();
if (!location.hash || location.hash === "#" || location.hash === "#/") {
  hashHistory.replace("/app/today");
  hashHistory.push("/app/citation-review");
}
const router = createRouter({
  routeTree: rootRoute.addChildren([authenticated.addChildren([citationReview, ...extra]), auth]),
  history: hashHistory,
});
window.__manualCaptureRouter = router;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.__manualCaptureClient = client;
function FixtureControls() {
  return (
    <p
      className="m-2 flex flex-wrap gap-2 rounded border border-dashed p-2 text-xs"
      data-fixture-controls
    >
      Fixture controls (outside the product):
      <button type="button" className="rounded border px-2 py-1" onClick={() => fixture.signOut()}>
        Sign out elsewhere
      </button>
      <button type="button" className="rounded border px-2 py-1" onClick={() => fixture.signIn()}>
        Sign in
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1"
        onClick={() => fixture.reHydrateSameActor()}
      >
        Same-actor re-sign-in
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1"
        onClick={() => fixture.later(() => fixture.signOut())}
        data-fixture-delayed="sign-out"
      >
        Sign out elsewhere in 30 s
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1"
        onClick={() => fixture.later(() => fixture.reHydrateSameActor())}
        data-fixture-delayed="re-sign-in"
      >
        Same-actor re-sign-in in 30 s
      </button>
      <span data-fixture-schedule aria-live="polite" />
    </p>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <FixtureControls />
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
if (check) void runCheck();

// ---- scripted check -------------------------------------------------------------------------------------------
async function runCheck() {
  const report = {
    fixture: "manual-capture",
    locale,
    viewport: { width: innerWidth, height: innerHeight },
    results: [],
    ledger: [],
    overflow: [],
  };
  const out = document.getElementById("results");
  const publish = () => {
    report.networkAttempts = window.__miloNetworkAttempts;
    report.calls = fixture.calls;
    window.__manualCaptureReport = report;
    out.textContent = JSON.stringify(report, null, 2);
  };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  async function waitFor(fn, what, ms = 6000) {
    const until = Date.now() + ms;
    for (;;) {
      let v;
      try {
        v = fn();
      } catch {
        v = undefined;
      }
      if (v) return v;
      if (Date.now() > until) throw Error(`Timed out waiting for ${what} (at ${location.hash})`);
      await tick();
    }
  }
  const assert = (v, m) => {
    if (!v) throw Error(m);
  };
  const eq = (a, b, m) =>
    assert(
      JSON.stringify(a) === JSON.stringify(b),
      `${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`,
    );
  /** Exact importManualCaptureFn calls each case must make (written out here, not derived). */
  const EXPECTED_WRITES = {
    "eligible rounds: occupied, deleted and future rounds are unavailable for a new original": 0,
    "incomplete occupancy, a deleted prompt or a failed read never offer a free round": 0,
    "Back and Continue keep every value; optional context is labelled, closed and unknown": 0,
    "Escape, outside click, X and Cancel ask first; Stay keeps everything, Discard clears": 0,
    "while open, the background (AppShell picker, navigation) is hidden and inert": 0,
    "router Back, programmatic navigation and search changes are blocked; Stay keeps the page": 0,
    "local refusal is 'not sent' with zero calls": 0,
    "a stored save confirms with the question, round, time and the saved record; a double click sends once": 1,
    "a resolved deviation reads as a plain label, not a code": 1,
    "a read failure or a new occupant between Review and the first Save blocks it and keeps the entry": 0,
    "R2: a project that reaches capacity after Review blocks the first Save and keeps the entry": 0,
    "R2: an exact resend at capacity stays explicit and sends the same frozen entry": 2,
    "R2: a failure reason stays visible after choosing Complete, with a removal action": 0,
    "R2: answer and reason limits are named on step 2 and nothing is cut; an optional limit opens its group": 0,
    "R2: an unrecorded planned country reads as a gap in the recorded details": 1,
    "a lost acknowledgement after commit stays unconfirmed until Check finds the exact record": 1,
    "a malformed id after commit stays unconfirmed until Check finds the exact record": 1,
    "a refusal (even a pre-write code) stays unconfirmed; Check without a match stays unconfirmed": 2,
    "a different occupant at the slot is not this submission": 1,
    "after a timeout, the exact resend stays explicit and allowed though eligibility changed; a refused resend keeps the uncertainty": 3,
    "confirmed stays confirmed when the refreshed view cannot load": 1,
    "leaving while sending says it cannot be cancelled; a late result only refreshes reads": 1,
    "same-actor re-sign-in retires the entry; its late result is ignored": 1,
    "R2: session loss while a leave dialog is open drops both dialogs without a prompt": 0,
    "signed out elsewhere: the redirect to sign-in is not blocked": 0,
  };
  // Per-case audit: every case owns the calls made from its start, and declares how many writes it expects.
  // The whole-run audit (fixture.calls) is never cleared; the ledger at the end ties every write to a case.
  let caseStart = 0;
  async function step(name, fn) {
    const start = fixture.calls.length;
    caseStart = start;
    let result;
    try {
      const detail = await fn();
      result = { name, ok: true, ...(detail ? { detail } : {}) };
    } catch (e) {
      result = { name, ok: false, error: String(e?.message ?? e) };
    }
    const writes = fixture.calls.slice(start).filter((c) => c.name === "importManualCaptureFn");
    const expected = EXPECTED_WRITES[name];
    report.ledger.push({
      name,
      expected,
      actual: writes.length,
      calls: [start, fixture.calls.length],
    });
    if (expected !== writes.length) {
      result.ok = false;
      result.error = [result.error, `writes: expected ${expected}, made ${writes.length}`]
        .filter(Boolean)
        .join("; ");
    }
    report.results.push(result);
    const w = document.documentElement.scrollWidth;
    if (w > innerWidth + 1) report.overflow.push({ step: name, scrollWidth: w, innerWidth });
    publish();
  }
  const dialog = () => document.querySelector("[data-manual-capture-dialog]");
  const phase = () => dialog()?.dataset.manualCaptureDialog;
  const leaveDialog = () => document.querySelector("[data-manual-capture-leave]");
  const button = (scope, text) =>
    [...(scope ?? document).querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const labelled = (text) => {
    const label = [...dialog().querySelectorAll("label")].find(
      (l) => l.childNodes[0]?.textContent?.trim() === text,
    );
    return label?.querySelector("input,select,textarea");
  };
  const setValue = (el, value) => {
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  /** This case's writes only (from its start or its latest clean start). */
  const imports = () =>
    fixture.calls.slice(caseStart).filter((c) => c.name === "importManualCaptureFn");
  const reads = (name) => fixture.calls.filter((c) => c.name === name).length;
  const loc = () => router.state.location;
  async function home() {
    await router.navigate({ to: "/app/citation-review" });
    await waitFor(
      () => document.querySelector("[data-manual-capture-open]:not([disabled])"),
      "entry action",
    );
  }
  /** Close whatever entry is open through its own controls: Close, or Cancel and then the leave dialog's
   * Discard / Leave anyway (the real guard, never bypassed). */
  async function closeEntry() {
    for (let i = 0; i < 3 && (dialog() || leaveDialog()); i++) {
      if (!leaveDialog()) {
        (
          button(dialog(), t("manualCapture.close")) ?? button(dialog(), t("manualCapture.cancel"))
        ).click();
        await waitFor(() => !dialog() || leaveDialog(), "closed or asked to confirm");
      }
      const leave = leaveDialog();
      if (leave) {
        (
          button(leave, t("manualCapture.leave.discard")) ??
          button(leave, t("manualCapture.leave.abandon"))
        ).click();
        await waitFor(() => !leaveDialog(), "leave confirmed");
      }
    }
    await waitFor(() => !dialog() && !leaveDialog(), "entry closed through its controls");
  }
  /** Settle what an earlier case left pending: a held request (its entry is already gone, so the result can
   * only refresh reads) and any reads in flight. */
  async function settle() {
    if (fixture.hanging) fixture.release("reject");
    await tick();
    await waitFor(() => !fixture.hanging && client.isFetching() === 0, "pending work settled");
  }
  /** A verified clean start: no entry, no pending work, signed in, seeded data, current reads. */
  async function fresh() {
    await closeEntry();
    await settle();
    if (fixture.actorId !== ACTOR || !fixture.state.hydrated) fixture.signIn();
    fixture.reset();
    await client.invalidateQueries();
    await home();
    await waitFor(() => client.isFetching() === 0, "reads settled");
    assert(!dialog() && !leaveDialog() && !fixture.hanging, "clean start");
    assert(fixture.outcomes.length === 0 && !fixture.failReads, "no queued outcomes or failures");
    caseStart = fixture.calls.length;
  }
  async function open() {
    document.querySelector("[data-manual-capture-open]").click();
    await waitFor(() => dialog(), "entry dialog");
  }
  // Capture one hour and 17 seconds after the slot, entered in UTC with an explicit +00:00 offset.
  const entered = (round) => {
    const ms = Date.parse(slotAt(0, round)) + 3600000 + 17000;
    const iso = new Date(ms).toISOString();
    return {
      date: iso.slice(0, 10),
      time: iso.slice(11, 19),
      offset: "+00:00",
      capturedAt: `${iso.slice(0, 19)}+00:00`,
    };
  };
  const stepNo = () => Number(dialog()?.dataset.manualCaptureStep ?? 0);
  async function next() {
    const n = stepNo();
    button(dialog(), t("manualCapture.continue")).click();
    await waitFor(() => stepNo() === n + 1, `step ${n + 1}`);
  }
  async function back() {
    const n = stepNo();
    button(dialog(), t("manualCapture.back")).click();
    await waitFor(() => stepNo() === n - 1, `step ${n - 1}`);
  }
  /** Wait until the rendered round options of `question` equal `expected` (after `project`), so the check
   * reads the committed render, not an earlier one; on timeout the error shows what was rendered. */
  const roundStates = async (question, expected, project = (x) => x) => {
    setValue(
      labelled(t("manualCapture.version")),
      dialog().querySelector("select option[value]:not([value=''])").value,
    );
    await waitFor(() => labelled(t("manualCapture.question")), "question");
    setValue(labelled(t("manualCapture.question")), question);
    let last = null;
    try {
      await waitFor(() => {
        const opts = [
          ...labelled(t("manualCapture.round")).querySelectorAll("option[data-slot-state]"),
        ];
        if (opts.length !== 4) return null;
        last = project(opts.map((o) => [o.value, o.dataset.slotState, o.disabled]));
        return JSON.stringify(last) === JSON.stringify(expected);
      }, "round options");
    } catch {
      throw Error(`${question} rounds: ${JSON.stringify(last)} ≠ ${JSON.stringify(expected)}`);
    }
  };
  // Step 1: choose the observation and affirm the exact question.
  async function choose(round, { affirm = true, question = "NO-D01" } = {}) {
    eq(stepNo(), 1, "starts on step 1");
    setValue(
      labelled(t("manualCapture.version")),
      dialog().querySelector("select option[value]:not([value=''])").value,
    );
    await waitFor(() => labelled(t("manualCapture.question")), "question select");
    setValue(labelled(t("manualCapture.question")), question);
    await waitFor(() => labelled(t("manualCapture.round")), "round select");
    setValue(labelled(t("manualCapture.round")), String(round));
    await waitFor(() => dialog().querySelector("[data-approved-question]"), "approved question");
    const box = dialog().querySelector("[data-approved-question] input[type=checkbox]");
    if (affirm && !box.checked) box.click();
    await tick();
  }
  async function fill(round, { affirm = true, question = "NO-D01", fresh = "yes" } = {}) {
    await choose(round, { affirm, question });
    await next();
    // Step 2: the answer.
    setValue(labelled(t("manualCapture.status")), "complete");
    setValue(
      labelled(t("manualCapture.rawAnswer")),
      "Nordlys Heating services heat pumps in Oslo.",
    );
    setValue(labelled(t("manualCapture.citations")), "https://nordlys.example.com/heat-pumps");
    await tick();
    await next();
    // Step 3: required facts (always visible); optional groups stay closed and unknown.
    const at = entered(round);
    setValue(dialog().querySelector('input[type="date"]'), at.date);
    setValue(dialog().querySelector('input[type="time"]'), at.time);
    setValue(labelled(t("manualCapture.utcOffset")), at.offset);
    setValue(labelled(t("manualCapture.service")), "Synthetic chat app");
    setValue(labelled(t("manualCapture.interfaceName")), "web");
    setValue(labelled(t("manualCapture.mode")), "consumer-web");
    setValue(labelled(t("manualCapture.freshSession")), fresh);
    setValue(labelled(t("manualCapture.priorMessages")), "0");
    await tick();
    return at;
  }
  async function review() {
    button(dialog(), t("manualCapture.review")).click();
    await waitFor(() => phase() === "review", "review");
  }
  async function reviewAndSave(outcome) {
    await review();
    if (outcome) fixture.outcomes.push(outcome);
    button(dialog(), t("manualCapture.save")).click();
  }
  const settled = (name) => {
    const s = client.getQueryState([name, ACTOR, "p"]);
    return s && s.fetchStatus === "idle" ? s.status : null;
  };
  /** The cache settling is not the consumer render: React Query notifies subscribers later (batched). */
  async function refetch(name, status) {
    await client.invalidateQueries({ queryKey: [name, ACTOR, "p"] });
    await waitFor(() => settled(name) === status, `${name} ${status}`);
  }
  /** Barrier on the entry's committed render (its read-only data attributes), before acting on it. */
  const rendered = (predicate, what) => waitFor(predicate, what);
  /** Measure only once enter/exit animations have finished (they scale the dialogs). */
  const animationsDone = () =>
    waitFor(
      () => document.getAnimations().every((a) => a.playState !== "running"),
      "animations settled",
    );
  /** A complete primary-button pointer gesture on `target`, as a real mouse click produces it. */
  const pointerClick = (target) => {
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1 };
    const pointer = { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true };
    target.dispatchEvent(new PointerEvent("pointerdown", pointer));
    target.dispatchEvent(new MouseEvent("mousedown", init));
    target.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
    target.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
    target.dispatchEvent(new MouseEvent("click", { ...init, buttons: 0 }));
  };
  const escape = () =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  // Outside the entry: the full gesture on the page body (Radix defers outside handling to the click).
  const outside = () => pointerClick(document.body);
  const closeX = () =>
    [...dialog().querySelectorAll("button")].find(
      (b) => b.querySelector(".sr-only")?.textContent === t("sharedUi.close"),
    );
  /** Stay with a real pointer gesture, then prove the confirmation stays closed and focus is back inside the
   * entry (the native defect was the deferred outside click reopening it). */
  async function stay() {
    pointerClick(button(leaveDialog(), t("manualCapture.leave.stay")));
    await waitFor(() => !leaveDialog(), "confirmation closed after Stay");
    await tick();
    await tick();
    await animationsDone();
    assert(!leaveDialog(), "confirmation did not reopen after Stay");
    assert(dialog()?.contains(document.activeElement), "focus is back inside the entry");
  }
  // A step-3 value proves the whole entry is still held.
  const kept = () => labelled(t("manualCapture.service"))?.value === "Synthetic chat app";
  const emptyStart = () => stepNo() === 1 && labelled(t("manualCapture.version"))?.value === "";
  /** Every visible action target in the open dialogs: at least 44px tall (and wide for buttons). */
  const smallTargets = () =>
    [
      ...document.querySelectorAll(
        ":is([role=dialog], [role=alertdialog]) :is(button, summary, select, textarea, input)",
      ),
    ]
      .filter((el) => el.type !== "checkbox" && el.getClientRects().length)
      .map((el) => [el, el.getBoundingClientRect()])
      .filter(([el, r]) => r.height < 44 || (el.tagName === "BUTTON" && r.width < 44))
      .map(
        ([el, r]) =>
          `${el.tagName}:${el.textContent.trim().slice(0, 24)}:${Math.round(r.width)}x${Math.round(r.height)}`,
      );

  await step(
    "eligible rounds: occupied, deleted and future rounds are unavailable for a new original",
    async () => {
      await fresh();
      await open();
      await roundStates("NO-D02", [
        ["1", "occupied", true],
        ["2", "erased", true],
        ["3", "available", false],
        ["4", "notDue", true],
      ]);
      // Questions read as a number and the text, never an identifier.
      const q = [...labelled(t("manualCapture.question")).options].map((o) => o.textContent);
      eq(
        q[1],
        t("manualCapture.questionOption", { n: 1, text: prompts[0].data.prompt }),
        "first question label",
      );
      assert(!q.some((x) => /NO-D\d|c0c0c0c0/.test(x)), "no identifiers in question choices");
    },
  );

  await step(
    "incomplete occupancy, a deleted prompt or a failed read never offer a free round",
    async () => {
      await fresh();
      fixture.db.reports = fixture.db.reports.map((r) => ({ ...r, coverageComplete: false }));
      await refetch("citation-coverage", "success");
      await open();
      await roundStates("NO-D02", [
        ["1", "occupied", true],
        ["2", "erased", true],
        ["3", "occupancyUnknown", true],
        ["4", "notDue", true],
      ]);
      button(dialog(), t("manualCapture.cancel")).click();
      await waitFor(() => leaveDialog(), "leave");
      button(leaveDialog(), t("manualCapture.leave.discard")).click();
      await waitFor(() => !dialog(), "closed");
      await fresh();
      fixture.db.prompts = prompts.filter((p) => p.id !== prompts[2].id); // NO-D03's prompt deleted
      await refetch("answer-evidence", "success");
      await open();
      await roundStates(
        "NO-D03",
        ["promptMissing", "promptMissing", "promptMissing", "promptMissing"],
        (x) => x.map((r) => r[1]),
      );
      await roundStates("NO-D01", ["1", "available", false], (x) => x[0]); // other questions unaffected
      button(dialog(), t("manualCapture.cancel")).click();
      await waitFor(() => leaveDialog(), "leave");
      button(leaveDialog(), t("manualCapture.leave.discard")).click();
      await waitFor(() => !dialog(), "closed");
      await fresh();
      fixture.failReadNames.add("readAnswerEvidenceFn");
      await refetch("answer-evidence", "error");
      await waitFor(
        () => document.querySelector("[data-manual-capture-open][disabled]"),
        "a new entry cannot start while the prompt read fails",
      );
      eq(imports().length, 0, "nothing sent");
    },
  );

  await step(
    "Back and Continue keep every value; optional context is labelled, closed and unknown",
    async () => {
      await fresh();
      await open();
      await choose(1);
      button(dialog(), t("manualCapture.continue")).click();
      await waitFor(() => stepNo() === 2, "step 2");
      // Continue checks only this step.
      button(dialog(), t("manualCapture.continue")).click();
      await waitFor(() => dialog().querySelector('[data-issue="status"]'), "step 2 issue");
      assert(!dialog().querySelector('[data-issue="service"]'), "later steps not reported yet");
      await back();
      await next();
      await back();
      eq(stepNo(), 1, "back at step 1");
      assert(
        dialog().querySelector("[data-approved-question] input[type=checkbox]").checked,
        "affirmation kept",
      );
      eq(labelled(t("manualCapture.round")).value, "1", "round kept");
      await next();
      setValue(labelled(t("manualCapture.status")), "complete");
      setValue(labelled(t("manualCapture.rawAnswer")), "Kept answer.");
      await next();
      const groups = [...dialog().querySelectorAll("details[data-optional-group]")];
      eq(
        groups.map((g) => g.querySelector("summary").textContent),
        ["model", "session", "place", "notes"].map((k) => t(`manualCapture.optional.${k}`)),
        "optional groups",
      );
      assert(
        groups.every((g) => !g.open),
        "optional groups start closed",
      );
      assert(dialog().querySelector("[data-required-facts]"), "required facts visible");
      groups[0].querySelector("summary").click();
      await waitFor(() => groups[0].open, "group opens");
      setValue(labelled(t("manualCapture.modelLabel")), "Model X");
      setValue(labelled(t("manualCapture.service")), "Synthetic chat app");
      await animationsDone();
      eq(smallTargets(), [], "44px targets (step 3, one group open)");
      await back();
      eq(labelled(t("manualCapture.rawAnswer")).value, "Kept answer.", "answer kept");
      await next();
      assert(kept(), "required fact kept");
      dialog().querySelector("details[data-optional-group=model] summary").click();
      await tick();
      eq(labelled(t("manualCapture.modelLabel")).value, "Model X", "optional value kept");
      escape();
      await waitFor(() => leaveDialog(), "leave");
      await animationsDone();
      eq(smallTargets(), [], "44px targets (leave dialog)");
      button(leaveDialog(), t("manualCapture.leave.discard")).click();
      await waitFor(() => !dialog(), "closed");
    },
  );

  await step(
    "Escape, outside click, X and Cancel ask first; Stay keeps everything, Discard clears",
    async () => {
      await fresh();
      await open();
      await fill(1);
      for (const [name, act] of [
        ["Escape", escape],
        ["outside", outside],
        ["X", () => closeX().click()],
        ["Cancel", () => button(dialog(), t("manualCapture.cancel")).click()],
      ]) {
        act();
        await waitFor(
          () => leaveDialog()?.dataset.manualCaptureLeave === "unsent",
          `${name}: leave dialog`,
        );
        await stay();
        assert(kept(), `${name}: input kept`);
        eq(stepNo(), 3, `${name}: same step`);
      }
      escape();
      await waitFor(() => leaveDialog(), "leave dialog");
      button(leaveDialog(), t("manualCapture.leave.discard")).click();
      await waitFor(() => !dialog(), "entry closed");
      await open();
      assert(emptyStart(), "a reopened entry starts empty on step 1");
      eq(imports().length, 0, "nothing sent");
    },
  );

  await step(
    "while open, the background (AppShell picker, navigation) is hidden and inert",
    async () => {
      await fresh();
      await open();
      await fill(1);
      // Radix hides each background branch (not #root itself, which keeps its live regions): every
      // interactive background control must be hidden through its own or an ancestor's aria-hidden/inert.
      const controls = [
        ...document
          .getElementById("root")
          .querySelectorAll("a[href], button, input, select, textarea, [tabindex]"),
      ];
      assert(controls.length > 0, "background controls present");
      const exposed = controls.filter((el) => !el.closest('[aria-hidden="true"], [inert]'));
      eq(
        exposed.map((el) => `${el.tagName}:${el.textContent.trim().slice(0, 24)}`),
        [],
        "background controls hidden from assistive tech",
      );
      eq(getComputedStyle(document.body).pointerEvents, "none", "outside pointer events disabled");
      eq(getComputedStyle(dialog()).pointerEvents, "auto", "the entry stays interactive");
    },
  );

  await step(
    "router Back, programmatic navigation and search changes are blocked; Stay keeps the page",
    async () => {
      await fresh();
      await open();
      await fill(1);
      const before = loc().href;
      // A real Back entry with an index behind this one (seeded through the history API), so Stay can return
      // without reloading.
      assert(router.history.location.state.__TSR_index >= 1, "a history entry with index ≥ 1");
      history.back();
      await waitFor(() => leaveDialog(), "Back blocked");
      await stay();
      await waitFor(() => loc().href === before, "still here after Stay (Back)");
      void router.navigate({ to: "/app/today" });
      await waitFor(() => leaveDialog(), "navigate blocked");
      await stay();
      eq(loc().pathname, "/app/citation-review", "path after Stay");
      assert(kept(), "input kept");
      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload);
      assert(unload.defaultPrevented, "unload is guarded while dirty");
      void router.navigate({ to: "/app/citation-review", search: { finding: "x" } });
      await waitFor(() => leaveDialog(), "search change blocked");
      button(leaveDialog(), t("manualCapture.leave.discard")).click();
      await waitFor(
        () => loc().search?.finding === "x" && !dialog(),
        "Discard proceeds and drops the entry",
      );
      const clean = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(clean);
      assert(!clean.defaultPrevented, "no unload guard once discarded");
    },
  );

  await step("local refusal is 'not sent' with zero calls", async () => {
    await fresh();
    await open();
    await choose(1, { affirm: false });
    button(dialog(), t("manualCapture.continue")).click();
    await waitFor(() => dialog().querySelector('[data-issue="affirmQuestion"]'), "issue shown");
    eq(stepNo(), 1, "stays on step 1");
    eq(imports().length, 0, "no call");
  });

  await step(
    "a stored save confirms with the question, round, time and the saved record; a double click sends once",
    async () => {
      await fresh();
      await open();
      const at = await fill(1);
      await review();
      const summary = dialog().querySelector("[data-manual-capture-state=review]").textContent;
      for (const line of [
        t("manualCapture.reviewQuestion", { n: 1, round: 1, text: prompts[0].data.prompt }),
        t("manualCapture.reviewUnknown", { count: 17 }),
        t("manualCapture.reviewMethod", { method: MANUAL_CAPTURE_METHOD }),
      ])
        assert(summary.includes(line), `review shows: ${line}`);
      const save = button(dialog(), t("manualCapture.save"));
      save.click();
      save.click();
      await waitFor(() => phase() === "confirmed", "confirmed");
      eq(imports().length, 1, "exactly one call");
      const sent = imports()[0].data;
      eq([sent.projectId, sent.expectedOwnerId], ["p", ACTOR], "owner scope");
      eq(sent.answer.capturedAt, at.capturedAt, "entered time, seconds and offset kept");
      eq(sent.answer.method, MANUAL_CAPTURE_METHOD, "method literal");
      eq(sent.answer.supersedesId, null, "original");
      eq(
        sent.answer.captureContext.instructions.questionText,
        prompts[0].data.prompt,
        "approved question text",
      );
      eq(sent.answer.captureContext.time.capturedAt, at.capturedAt, "one capture instant");
      eq(sent.answer.captureContext.time.delayMinutes, 60, "derived delay");
      const id = fixture.db.answers.at(-1).id;
      eq(dialog().querySelector("[data-saved-id]").dataset.savedId, id, "stored id");
      await waitFor(() => dialog().querySelector("[data-saved-record]"), "saved record shown");
      const text = dialog().textContent;
      for (const line of [
        t("manualCapture.reviewQuestion", { n: 1, round: 1, text: prompts[0].data.prompt }),
        t("manualCapture.confirmedWhen", {
          at: `${at.date} ${at.time} (UTC${at.offset})`,
        }),
        t("manualCapture.savedAnswer", {
          excerpt: "Nordlys Heating services heat pumps in Oslo.",
        }),
        t("manualCapture.savedSources", { count: 1 }),
        t("manualCapture.savedRecord", { id }),
      ])
        assert(text.includes(line), `confirmation shows: ${line}`);
      await waitFor(
        () => dialog().querySelector("[data-resolved-outcome=complete]"),
        "resolved outcome",
      );
    },
  );

  await step("a resolved deviation reads as a plain label, not a code", async () => {
    await fresh();
    await open();
    await fill(3, { fresh: "no" });
    await reviewAndSave("store");
    const item = await waitFor(
      () => dialog().querySelector('[data-deviation="session_not_fresh"]'),
      "deviation shown",
    );
    eq(item.textContent, t("manualCapture.deviation.session_not_fresh"), "deviation label");
  });

  await step(
    "a read failure or a new occupant between Review and the first Save blocks it and keeps the entry",
    async () => {
      await fresh();
      await open();
      await fill(1);
      await review();
      fixture.failReadNames.add("readAnswerEvidenceFn");
      await refetch("answer-evidence", "error");
      await rendered(
        () => dialog().dataset.readsCurrent === "false",
        "entry rendered the failed read",
      );
      button(dialog(), t("manualCapture.save")).click();
      await waitFor(
        () => dialog().querySelector('[data-issue="readsUnavailable"]'),
        "not sent: reads unavailable",
      );
      eq(phase(), "review", "the reviewed entry is kept");
      eq(imports().length, 0, "no call while reads fail");
      fixture.failReadNames.clear();
      await refetch("answer-evidence", "success");
      await rendered(() => dialog().dataset.readsCurrent === "true", "entry rendered the recovery");
      // Another tab records this slot first.
      fixture.db.captures.push({
        ...fixture.db.captures[0],
        answerId: "0a0a0a0a-0000-4000-8000-000000000002",
        slot: { questionId: "NO-D01", round: 1 },
      });
      await refetch("citation-coverage", "success");
      await rendered(
        () => dialog().dataset.selectedSlot === "occupied",
        "entry rendered the occupant",
      );
      button(dialog(), t("manualCapture.save")).click();
      await waitFor(
        () => dialog().querySelector('[data-issue="slotUnavailable"]'),
        "not sent: slot now occupied",
      );
      eq(imports().length, 0, "still no call");
      eq(phase(), "review", "still reviewable");
      button(dialog(), t("manualCapture.edit")).click();
      await waitFor(() => stepNo() === 3, "back to editing on step 3");
      assert(kept(), "entry kept for editing");
    },
  );

  await step(
    "R2: a project that reaches capacity after Review blocks the first Save and keeps the entry",
    async () => {
      await fresh();
      fixture.addUnrelatedAnswers(98); // 1 seeded + 98 = 99 stored records
      await refetch("citation-protocol", "success");
      await open();
      await rendered(() => dialog().dataset.answerCount === "99", "entry rendered 99 records");
      await fill(1);
      await review(); // valid at 99
      fixture.addUnrelatedAnswers(1); // an unrelated record elsewhere: now 100
      await refetch("citation-protocol", "success");
      await rendered(() => dialog().dataset.answerCount === "100", "entry rendered 100 records");
      button(dialog(), t("manualCapture.save")).click();
      await waitFor(() => dialog().querySelector('[data-issue="capacity"]'), "capacity shown");
      eq(imports().length, 0, "no call");
      eq(phase(), "review", "reviewed entry kept");
    },
  );

  await step(
    "R2: an exact resend at capacity stays explicit and sends the same frozen entry",
    async () => {
      await fresh();
      fixture.addUnrelatedAnswers(98);
      await refetch("citation-protocol", "success");
      await open();
      await fill(2);
      await reviewAndSave("commitThenReject"); // stored as the 100th record, acknowledgement lost
      await waitFor(() => phase() === "unconfirmed", "unconfirmed");
      await refetch("citation-protocol", "success");
      eq(fixture.db.answers.length, 100, "project now full");
      fixture.outcomes.push("store");
      button(dialog(), t("manualCapture.resend")).click();
      await waitFor(() => phase() === "confirmed", "the identical entry is the stored one");
      const calls = imports();
      eq(calls.length, 2, "two sends");
      eq(calls[1].data, calls[0].data, "the exact frozen entry");
    },
  );

  await step(
    "R2: a failure reason stays visible after choosing Complete, with a removal action",
    async () => {
      await fresh();
      await open();
      await choose(1);
      await next();
      for (const status of ["failed", "truncated"]) {
        setValue(labelled(t("manualCapture.status")), status);
        await waitFor(() => labelled(t("manualCapture.failure")), `${status}: reason field`);
        setValue(labelled(t("manualCapture.failure")), "Timed out");
        setValue(labelled(t("manualCapture.status")), "complete");
        await waitFor(
          () => dialog().querySelector("[data-failure-not-applicable]"),
          `${status}: recovery shown`,
        );
        eq(
          labelled(t("manualCapture.failure")).value,
          "Timed out",
          `${status}: reason still visible`,
        );
        setValue(labelled(t("manualCapture.rawAnswer")), "Nordlys Heating services heat pumps.");
        button(dialog(), t("manualCapture.continue")).click();
        await waitFor(
          () => dialog().querySelector('[data-issue="failureNotAllowed"]'),
          `${status}: issue`,
        );
        eq(
          labelled(t("manualCapture.failure")).getAttribute("aria-invalid"),
          "true",
          `${status}: the visible field is marked`,
        );
        button(dialog(), t("manualCapture.removeFailure")).click();
        await waitFor(() => !labelled(t("manualCapture.failure")), `${status}: reason removed`);
        await next();
        await back();
      }
      setValue(labelled(t("manualCapture.status")), "failed");
      button(dialog(), t("manualCapture.continue")).click();
      await waitFor(
        () => dialog().querySelector('[data-issue="failureRequired"]'),
        "a failing status needs a reason again",
      );
      eq(imports().length, 0, "nothing sent");
    },
  );

  await step(
    "R2: answer and reason limits are named on step 2 and nothing is cut; an optional limit opens its group",
    async () => {
      await fresh();
      await open();
      await choose(1);
      await next();
      setValue(labelled(t("manualCapture.status")), "complete");
      setValue(labelled(t("manualCapture.rawAnswer")), "x".repeat(50001));
      await waitFor(
        () => dialog().querySelector('[data-char-count="rawAnswer"][data-over]'),
        "over count",
      );
      button(dialog(), t("manualCapture.continue")).click();
      const issue = await waitFor(
        () => dialog().querySelector('[data-issue="tooLong:rawAnswer"]'),
        "answer limit named",
      );
      eq(stepNo(), 2, "still on the answer step");
      assert(issue.textContent.includes(t("manualCapture.rawAnswer")), "names the field");
      eq(labelled(t("manualCapture.rawAnswer")).value.length, 50001, "nothing cut");
      setValue(labelled(t("manualCapture.rawAnswer")), "x".repeat(50000));
      await next();
      await back();
      setValue(labelled(t("manualCapture.status")), "failed");
      await waitFor(() => labelled(t("manualCapture.failure")), "reason field");
      setValue(labelled(t("manualCapture.failure")), "y".repeat(2001));
      button(dialog(), t("manualCapture.continue")).click();
      await waitFor(
        () => dialog().querySelector('[data-issue="tooLong:failure"]'),
        "reason limit named",
      );
      eq(labelled(t("manualCapture.failure")).value.length, 2001, "reason not cut");
      setValue(labelled(t("manualCapture.failure")), "y".repeat(2000));
      await next();
      // Step 3: fill the required facts, put an over-long country in the closed "place" group.
      const at = entered(1);
      setValue(dialog().querySelector('input[type="date"]'), at.date);
      setValue(dialog().querySelector('input[type="time"]'), at.time);
      setValue(labelled(t("manualCapture.utcOffset")), at.offset);
      setValue(labelled(t("manualCapture.service")), "Synthetic chat app");
      setValue(labelled(t("manualCapture.interfaceName")), "web");
      setValue(labelled(t("manualCapture.mode")), "consumer-web");
      setValue(labelled(t("manualCapture.freshSession")), "yes");
      setValue(labelled(t("manualCapture.priorMessages")), "0");
      setValue(labelled(t("manualCapture.collectionCountry")), "N".repeat(81));
      const place = dialog().querySelector("details[data-optional-group=place]");
      assert(!place.open, "group closed before Review");
      button(dialog(), t("manualCapture.review")).click();
      await waitFor(
        () => dialog().querySelector('[data-issue="tooLong:collectionCountry"]'),
        "country limit named",
      );
      assert(dialog().querySelector("details[data-optional-group=place]").open, "its group opened");
      eq(imports().length, 0, "nothing sent");
    },
  );

  await step(
    "R2: an unrecorded planned country reads as a gap in the recorded details",
    async () => {
      await fresh();
      await open();
      await fill(3); // the country is left unknown; the plan pins NO
      await reviewAndSave("store");
      const item = await waitFor(
        () => dialog().querySelector('[data-deviation="collection_country_differs"]'),
        "gap shown",
      );
      eq(item.textContent, t("manualCapture.deviation.collection_country_differs"), "gap label");
    },
  );

  for (const [name, outcome] of [
    ["a lost acknowledgement after commit", "commitThenReject"],
    ["a malformed id after commit", "commitThenMalformed"],
  ])
    await step(`${name} stays unconfirmed until Check finds the exact record`, async () => {
      await fresh();
      await open();
      await fill(2);
      await reviewAndSave(outcome);
      await waitFor(() => phase() === "unconfirmed", "unconfirmed");
      assert(
        !dialog().textContent.includes(t("manualCapture.notSent")),
        "never 'not sent' after dispatch",
      );
      button(dialog(), t("manualCapture.check")).click();
      await waitFor(() => phase() === "confirmed", "confirmed by match");
      eq(
        dialog().querySelector("[data-saved-id]").dataset.savedId,
        fixture.db.answers.at(-1).id,
        "matched id",
      );
    });

  await step(
    "a refusal (even a pre-write code) stays unconfirmed; Check without a match stays unconfirmed",
    async () => {
      for (const outcome of ["reject", "prewriteCode"]) {
        await fresh();
        await open();
        await fill(3);
        await reviewAndSave(outcome);
        await waitFor(() => phase() === "unconfirmed", `${outcome}: unconfirmed`);
        button(dialog(), t("manualCapture.check")).click();
        await waitFor(
          () => dialog().textContent.includes(t("manualCapture.unconfirmedNote.notFound")),
          `${outcome}: not found`,
        );
        eq(phase(), "unconfirmed", `${outcome}: still unconfirmed`);
        escape();
        await waitFor(
          () => leaveDialog()?.dataset.manualCaptureLeave === "unconfirmed",
          "warned abandon",
        );
        button(leaveDialog(), t("manualCapture.leave.abandon")).click();
        await waitFor(() => !dialog(), "abandoned");
      }
    },
  );

  await step("a different occupant at the slot is not this submission", async () => {
    await fresh();
    await open();
    await fill(3);
    await reviewAndSave("otherOccupant");
    await waitFor(() => phase() === "unconfirmed", "unconfirmed");
    button(dialog(), t("manualCapture.check")).click();
    await waitFor(
      () => dialog().textContent.includes(t("manualCapture.unconfirmedNote.notFound")),
      "not found",
    );
    eq(phase(), "unconfirmed", "different occupant ignored");
  });

  await step(
    "after a timeout, the exact resend stays explicit and allowed though eligibility changed; a refused resend keeps the uncertainty",
    async () => {
      await fresh();
      await open();
      await fill(2);
      await reviewAndSave("commitThenReject");
      await waitFor(() => phase() === "unconfirmed", "unconfirmed");
      // Eligibility for a NEW original has changed: the slot is now occupied and the prompt read fails.
      fixture.failReadNames.add("readAnswerEvidenceFn");
      await refetch("answer-evidence", "error");
      await waitFor(
        () => document.querySelector("[data-manual-capture-open][disabled]"),
        "no new original",
      );
      eq(phase(), "unconfirmed", "no automatic resend or reset");
      eq(imports().length, 1, "one send so far");
      fixture.outcomes.push("reject");
      button(dialog(), t("manualCapture.resend")).click();
      await waitFor(
        () => dialog().textContent.includes(t("manualCapture.unconfirmedNote.resend")),
        "resend note",
      );
      eq(phase(), "unconfirmed", "still unconfirmed");
      fixture.outcomes.push("store");
      button(dialog(), t("manualCapture.resend")).click();
      await waitFor(() => phase() === "confirmed", "confirmed by resend");
      const calls = imports();
      eq(calls.length, 3, "three sends");
      eq(calls[1].data, calls[0].data, "resend 1 is the exact frozen entry");
      eq(calls[2].data, calls[0].data, "resend 2 is the exact frozen entry");
      eq(fixture.db.answers.length, 2, "one stored original (plus the seeded record)");
      eq(
        dialog().querySelector("[data-saved-id]").dataset.savedId,
        fixture.db.answers[1].id,
        "same id as the first commit",
      );
    },
  );

  await step("confirmed stays confirmed when the refreshed view cannot load", async () => {
    await fresh();
    await open();
    await fill(1);
    fixture.failReads = true;
    await reviewAndSave("store");
    await waitFor(() => phase() === "confirmed", "confirmed");
    await waitFor(
      () => dialog().textContent.includes(t("manualCapture.refreshFailed")),
      "refresh failure shown",
    );
    eq(phase(), "confirmed", "still confirmed");
    fixture.failReads = false;
    button(dialog(), t("manualCapture.reload")).click();
    await waitFor(
      () =>
        dialog().textContent.includes(
          t("manualCapture.savedRecord", { id: fixture.db.answers.at(-1).id }),
        ),
      "record shown",
    );
  });

  await step(
    "leaving while sending says it cannot be cancelled; a late result only refreshes reads",
    async () => {
      await fresh();
      await open();
      await fill(1);
      await reviewAndSave("hang");
      await waitFor(() => phase() === "sending", "sending");
      escape();
      await waitFor(
        () => leaveDialog()?.dataset.manualCaptureLeave === "sending",
        "sending warning",
      );
      button(leaveDialog(), t("manualCapture.leave.abandon")).click();
      await waitFor(() => !dialog(), "closed");
      const before = reads("readResolvedCapturesFn");
      fixture.release("store");
      await waitFor(
        () => reads("readResolvedCapturesFn") > before,
        "late result refreshed the scoped reads",
      );
      await tick();
      assert(!dialog(), "no entry resurrected");
      await open();
      assert(emptyStart(), "a new entry starts empty");
    },
  );

  await step("same-actor re-sign-in retires the entry; its late result is ignored", async () => {
    await fresh();
    await open();
    await fill(1);
    await reviewAndSave("hang");
    await waitFor(() => phase() === "sending", "sending");
    fixture.reHydrateSameActor();
    await waitFor(() => !dialog() && !leaveDialog(), "entry purged without a prompt");
    const before = fixture.calls.length;
    fixture.release("store");
    await tick();
    await tick();
    eq(fixture.calls.length, before, "no reads or writes from the retired session");
  });

  await step(
    "R2: session loss while a leave dialog is open drops both dialogs without a prompt",
    async () => {
      for (const [how, lose] of [
        ["sign-out", () => fixture.signOut()],
        ["same-actor re-sign-in", () => fixture.reHydrateSameActor()],
      ]) {
        await fresh();
        await open();
        await fill(1);
        escape();
        await waitFor(() => leaveDialog(), `${how}: leave dialog open`);
        lose();
        await waitFor(() => !dialog() && !leaveDialog(), `${how}: both dialogs gone`);
        const unload = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(unload);
        assert(!unload.defaultPrevented, `${how}: no unload guard`);
        if (how === "sign-out") {
          await router.navigate({ to: "/auth" });
          await waitFor(() => loc().pathname === "/auth" && !leaveDialog(), "reached /auth");
          fixture.signIn();
        }
        await home();
        await open();
        assert(emptyStart(), `${how}: a new entry starts empty`);
        eq(imports().length, 0, `${how}: nothing sent`);
      }
    },
  );

  await step("signed out elsewhere: the redirect to sign-in is not blocked", async () => {
    await fresh();
    await open();
    await fill(1);
    fixture.signOut();
    await router.navigate({ to: "/auth" });
    await waitFor(() => loc().pathname === "/auth" && !leaveDialog(), "reached /auth");
    fixture.signIn();
    await home();
  });

  report.noNetwork = window.__miloNetworkAttempts.length === 0;
  // Final ledger: every write belongs to a case, every case ran, and nothing else was attempted.
  const READ_NAMES = ["readCitationProtocolFn", "readResolvedCapturesFn", "readAnswerEvidenceFn"];
  const allWrites = fixture.calls.filter((c) => c.name === "importManualCaptureFn").length;
  const IMPLEMENTED_STATE = [
    "store.setState",
    "store.reloadWorkspaceForUser",
    "store.saveWorkspaceNow",
    "store.setActiveProject",
  ];
  report.totals = {
    cases: report.results.length,
    expectedCases: Object.keys(EXPECTED_WRITES).length,
    expectedWrites: Object.values(EXPECTED_WRITES).reduce((a, b) => a + b, 0),
    ledgerWrites: report.ledger.reduce((a, l) => a + l.actual, 0),
    allWrites,
    otherCalls: fixture.calls.filter(
      (c) => c.name !== "importManualCaptureFn" && !READ_NAMES.includes(c.name),
    ),
    stateAudit: fixture.stateAudit,
    refusedStateCalls: fixture.stateAudit.filter((e) => !IMPLEMENTED_STATE.includes(e.type)),
  };
  const tot = report.totals;
  report.ledgerComplete =
    tot.cases === tot.expectedCases &&
    tot.ledgerWrites === tot.allWrites &&
    tot.allWrites === tot.expectedWrites &&
    tot.otherCalls.length === 0 &&
    tot.refusedStateCalls.length === 0;
  report.passed =
    report.results.every((r) => r.ok) &&
    !report.overflow.length &&
    report.noNetwork &&
    report.ledgerComplete;
  report.completed = true;
  publish();
}
