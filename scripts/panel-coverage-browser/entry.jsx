// CG-03B panel-coverage fixture. Mounts the ACTUAL CitationPanelProtocolPanel (existing authoring list, lock
// review and the new read-only coverage view, real panelCoverageEntries/panelHeads/lockIssues helpers, central
// i18n catalogs, React Query) over explicit synthetic datasets. The two server-function modules and the store's
// interface-language read are synthetic (protocol-functions.js, answer-functions.js, store.js); the network
// guard in index.html refuses every request. Every number below is written out here, not computed by the code
// under test.
//
//   index.html?locale=en|pl|sv|da&variant=ready|loading|empty|error[&check=1]
//
// Without check=1 the page stays interactive. With check=1 a scripted check uses the real controls (including
// one synthetic lock to prove the coverage refresh) and writes a JSON report to #results and
// window.__panelCoverageReport.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CitationPanelProtocolPanel } from "@/components/CitationPanelProtocolPanel";
import { buildPanelDraft, emptyPanelDraftForm } from "@/lib/citation-panel-ui";
import { translate } from "@/i18n";
import { fixture } from "./fixture.js";

const params = new URLSearchParams(location.search);
const locale = ["en", "pl", "sv", "da"].includes(params.get("locale"))
  ? params.get("locale")
  : "en";
const variant = ["ready", "loading", "empty", "error"].includes(params.get("variant"))
  ? params.get("variant")
  : "ready";
const check = params.get("check") === "1";
fixture.locale = locale;
fixture.variant = variant;
document.documentElement.lang = locale;
try {
  localStorage.removeItem("milo.uiLocale");
} catch {
  // Storage may be unavailable; the synthetic project language then decides.
}
const t = (key, vars) => translate(locale, key, vars);

// ---- explicit synthetic data -------------------------------------------------------------------------------
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const D = "d0d0d0d0-0000-4000-8000-0000000000d1"; // discovery panel (project p)
const B = "b0b0b0b0-0000-4000-8000-0000000000b1"; // brand panel (project p)
const RUN = "e0e0e0e0-0000-4000-8000-0000000000e1";
const Q = "f0f0f0f0-0000-4000-8000-0000000000f1"; // discovery panel (project q)
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
// A schedule two weeks ahead keeps the draft lockable (its first planned slot is still in the future).
const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
function panel(panelId, version, status, client = "FIXTURE Nordlys Heating") {
  const built = buildPanelDraft(
    {
      ...emptyPanelDraftForm({ clientName: client, market: "NO — Oslo", language: "en" }),
      surface: {
        service: "Synthetic chat app",
        interface: "web",
        mode: "consumer-web",
        searchMode: "",
        modelLabel: "",
        webSearchEvidenced: "unknown",
      },
      questionKeys: prompts.map((p) => `${p.id}:1`),
      firstSlot: { date: future, time: "10:00" },
    },
    panelId,
    version - 1,
    prompts.map((p) => ({ id: p.id, revision: 1, text: p.data.prompt, language: "en" })),
  );
  if (!built.ok) throw Error("fixture panel: " + built.issues.join(", "));
  return {
    ...built.draft,
    status,
    approval:
      status === "locked"
        ? { approvedBy: OWNER, approvedAt: `2026-09-0${Math.min(version, 9)}T08:00:00.000Z` }
        : null,
  };
}
const brand = (() => {
  const base = panel(B, 1, "locked");
  return { ...base, kind: "brand", questions: [base.questions[0]], rounds: 0, schedule: null };
})();
const zeros = { complete: 0, failed: 0, truncated: 0, missed: 0, protocol_deviant: 0 };
const report = (panelId, panelVersion, over) => ({
  panelId,
  panelVersion,
  kind: "discovery",
  planned: 40,
  observed: 0,
  erased: 0,
  erasedExtra: 0,
  liveExtra: 0,
  recorded: 0,
  neverObserved: 40,
  coverageComplete: true,
  excluded: 0,
  outcomes: zeros,
  brandRuns: [],
  ...over,
});
// Expected display, written out: D v1 complete history; D v2 unknown completeness; B v1 brand run.
const EXPECT = {
  [`${D}:1`]: { observed: 3, erased: 1, never: "36", liveExtra: 2, erasedExtra: 1, excluded: 2 },
  [`${D}:2`]: {
    observed: 5,
    erased: 2,
    never: "unknown",
    liveExtra: 0,
    erasedExtra: 0,
    excluded: 1,
  },
  [`${D}:4`]: { observed: 0, erased: 0, never: "40", liveExtra: 0, erasedExtra: 0, excluded: 0 },
};
fixture.datasets.p =
  variant === "empty"
    ? { prompts, panels: [], brandRuns: [], reports: [], erasureOverflow: 0 }
    : {
        prompts,
        panels: [panel(D, 1, "locked"), panel(D, 2, "locked"), panel(D, 3, "draft"), brand],
        brandRuns: [
          {
            id: RUN,
            panelId: B,
            panelVersion: 1,
            approvedBy: OWNER,
            approvedAt: "2026-09-02T08:00:00.000Z",
            observationBudget: 5,
            rounds: 1,
          },
        ],
        reports: [
          report(D, 1, {
            observed: 3,
            erased: 1,
            erasedExtra: 1,
            liveExtra: 2,
            recorded: 4,
            neverObserved: 36,
            excluded: 2,
            // Outcomes (4) deliberately differ from distinct observed slots (3).
            outcomes: { ...zeros, complete: 1, failed: 1, protocol_deviant: 2 },
          }),
          report(D, 2, {
            observed: 5,
            erased: 2,
            recorded: 7,
            neverObserved: null,
            coverageComplete: false,
            excluded: 1,
            outcomes: { ...zeros, complete: 4, truncated: 1, protocol_deviant: 1 },
          }),
          report(B, 1, {
            kind: "brand",
            planned: 0,
            observed: 0,
            erased: 1,
            recorded: 1,
            neverObserved: 0,
            // Authoritative consumption (2) exceeds what is visible now (0 saved + 1 deleted).
            brandRuns: [{ runId: RUN, approvedBudget: 5, consumed: 2, observed: 0, erased: 1 }],
          }),
        ],
        erasureOverflow: 4,
      };
fixture.datasets.q = {
  prompts,
  panels: [panel(Q, 1, "locked", "FIXTURE Second client")],
  brandRuns: [],
  reports: [
    report(Q, 1, {
      observed: 7,
      recorded: 7,
      neverObserved: 33,
      outcomes: { ...zeros, complete: 7 },
    }),
  ],
  erasureOverflow: 0,
};
// The single allowed synthetic write: locking D v3 stores a locked v4 (as the server's lock does) and its
// explicit, freshly read report.
fixture.lock = (data) => {
  const set = fixture.datasets[data.projectId];
  const head = set.panels.find(
    (p) => p.panelId === data.panelId && p.version === data.expectedVersion,
  );
  if (!head || head.status !== "draft") throw Error("Synthetic lock refused: not the draft head");
  const locked = {
    ...head,
    version: head.version + 1,
    status: "locked",
    approval: { approvedBy: OWNER, approvedAt: new Date().toISOString() },
  };
  set.panels.push(locked);
  set.reports.push(report(data.panelId, locked.version, {}));
  return structuredClone(locked);
};

// ---- page --------------------------------------------------------------------------------------------------
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.__panelCoverageClient = client;
function App() {
  const [projectId, setProjectId] = useState("p");
  return (
    <main className="milo-app mx-auto max-w-5xl p-4">
      <p className="mb-3 flex flex-wrap items-center gap-2 rounded border border-dashed p-2 text-xs">
        <span>
          Fixture controls (outside the product) · project <b data-fixture-project>{projectId}</b>
        </span>
        <button
          type="button"
          data-fixture="switch-project"
          className="rounded border px-2 py-1"
          onClick={() => setProjectId((p) => (p === "p" ? "q" : "p"))}
        >
          Switch project
        </button>
      </p>
      {/* Keyed by owner + project, exactly as the citation-review route keys this subtree. */}
      <CitationPanelProtocolPanel
        key={`${OWNER}:${projectId}`}
        projectId={projectId}
        ownerId={OWNER}
        seed={{ clientName: "FIXTURE Nordlys Heating", market: "NO — Oslo", language: "en" }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
);
if (check) void runCheck();

// ---- scripted check ----------------------------------------------------------------------------------------
async function runCheck() {
  const report = {
    fixture: "panel-coverage",
    locale,
    variant,
    viewport: { width: innerWidth, height: innerHeight },
    results: [],
    overflow: [],
  };
  const out = document.getElementById("results");
  const publish = () => {
    report.networkAttempts = window.__miloNetworkAttempts;
    report.calls = fixture.calls;
    window.__panelCoverageReport = report;
    out.textContent = JSON.stringify(report, null, 2);
  };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  async function waitFor(fn, what, ms = 5000) {
    const until = Date.now() + ms;
    for (;;) {
      let v;
      try {
        v = fn();
      } catch {
        v = undefined;
      }
      if (v) return v;
      if (Date.now() > until) throw Error("Timed out waiting for " + what);
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
  async function step(name, fn) {
    try {
      const detail = await fn();
      report.results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    } catch (e) {
      report.results.push({ name, ok: false, error: String(e?.message ?? e) });
    }
    const w = document.documentElement.scrollWidth;
    if (w > innerWidth + 1) report.overflow.push({ step: name, scrollWidth: w, innerWidth });
    publish();
  }
  const area = () => document.querySelector("[data-panel-coverage]");
  const versions = () =>
    [...document.querySelectorAll("[data-coverage-version]")].map((e) => e.dataset.coverageVersion);
  const entry = (key) => document.querySelector(`[data-coverage-version="${key}"]`);
  const shown = (key) => {
    const e = entry(key);
    const n = (sel, attr) => e.querySelector(sel)?.getAttribute(attr);
    return {
      observed: Number(n("[data-coverage-observed]", "data-coverage-observed")),
      erased: Number(n("[data-coverage-erased]", "data-coverage-erased")),
      never: n("[data-coverage-never]", "data-coverage-never"),
      liveExtra: Number(n("[data-coverage-live-extra]", "data-coverage-live-extra")),
      erasedExtra: Number(n("[data-coverage-erased-extra]", "data-coverage-erased-extra")),
      excluded: Number(n("[data-coverage-excluded]", "data-coverage-excluded")),
    };
  };
  const writes = () => fixture.calls.filter((c) => c.write);
  const reads = (name) => fixture.calls.filter((c) => c.name === name).length;
  const buttonIn = (scope, text) =>
    [...scope.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

  if (variant === "loading") {
    await step("loading shows a status and no numbers; authoring still loads", async () => {
      await waitFor(() => area()?.dataset.panelCoverage === "loading", "coverage loading");
      await waitFor(
        () => document.body.textContent.includes(t("citationAuthoring.panels.title")),
        "authoring",
      );
      assert(!versions().length, "no coverage numbers while loading");
    });
  } else if (variant === "error") {
    await step("a failed coverage read shows an alert and no numbers", async () => {
      await waitFor(() => area()?.dataset.panelCoverage === "error", "coverage error");
      assert(area().querySelector('[role="alert"]'), "alert");
      assert(!versions().length, "no numbers");
    });
  } else if (variant === "empty") {
    await step("no approved version shows the empty state, not zeros", async () => {
      await waitFor(() => area()?.dataset.panelCoverage === "ready", "coverage ready");
      assert(area().textContent.includes(t("panelCoverage.empty")), "empty copy");
      assert(!versions().length, "no version rows");
    });
  } else {
    await step(
      "every locked version is shown, including two behind a newer draft head",
      async () => {
        await waitFor(() => versions().length === 3, "three locked versions");
        eq(versions(), [`${D}:2`, `${D}:1`, `${B}:1`], "coverage versions");
        // The authoring list itself shows only the draft head of D (and B's locked head).
        assert(
          document.body.textContent.includes(t("citationAuthoring.panels.version", { version: 3 })),
          "draft head v3 in the authoring list",
        );
      },
    );
    await step("discovery numbers are distinct facts, unknown stays unknown", async () => {
      eq(shown(`${D}:1`), EXPECT[`${D}:1`], "D v1");
      eq(shown(`${D}:2`), EXPECT[`${D}:2`], "D v2");
      assert(entry(`${D}:2`).querySelector("[data-coverage-incomplete]"), "v2 incomplete note");
      assert(!entry(`${D}:1`).querySelector("[data-coverage-incomplete]"), "v1 complete");
      assert(!/%/.test(area().textContent), "no percentages");
    });
    await step("brand run keeps authoritative use, no grid ratio or money", async () => {
      const b = entry(`${B}:1`);
      assert(b.querySelector('[data-coverage-kind="brand"]'), "brand view");
      eq(b.querySelector("[data-coverage-run]").dataset.consumed, "2", "consumed");
      assert(
        b.textContent.includes(
          t("panelCoverage.brandRun", {
            date: "2026-09-02",
            budget: 5,
            consumed: 2,
            observed: 0,
            erased: 1,
          }),
        ),
        "brand run line",
      );
      assert(!b.querySelector("[data-coverage-planned]"), "no planned grid for brand");
      assert(!/0\/0|USD|\$|€/.test(b.textContent), "no 0/0 or money");
    });
    await step("unattributed deleted history is a separate global note", async () => {
      eq(
        area().querySelector("[data-coverage-overflow]")?.dataset.coverageOverflow,
        "4",
        "overflow",
      );
    });
    await step("record details open and close from their native disclosure", async () => {
      const d = entry(`${D}:1`).querySelector("details");
      assert(!d.open, "closed by default");
      d.querySelector("summary").click();
      await waitFor(() => d.open, "details open");
      assert(
        d.textContent.includes(t("panelCoverage.outcome.protocol_deviant", { count: 2 })),
        "outcome visible",
      );
      d.querySelector("summary").click();
      await waitFor(() => !d.open, "details closed");
    });
    await step("locking the draft refreshes coverage; one exact synthetic write", async () => {
      const before = reads("readResolvedCapturesFn");
      const head = [...document.querySelectorAll("li")].find(
        (li) =>
          li.textContent.includes(t("citationAuthoring.panels.version", { version: 3 })) &&
          buttonIn(li, t("citationAuthoring.panels.reviewLock")),
      );
      buttonIn(head, t("citationAuthoring.panels.reviewLock")).click();
      const region = await waitFor(
        () => document.querySelector('section[role="region"]'),
        "lock review",
      );
      buttonIn(region, t("citationAuthoring.panels.lock")).click();
      await waitFor(() => versions()[0] === `${D}:4`, "new locked version in coverage");
      eq(versions(), [`${D}:4`, `${D}:2`, `${D}:1`, `${B}:1`], "versions after lock");
      eq(shown(`${D}:4`), EXPECT[`${D}:4`], "D v4");
      assert(reads("readResolvedCapturesFn") > before, "coverage was read again after the lock");
      eq(
        writes(),
        [
          {
            name: "lockCitationPanelFn",
            write: true,
            data: { projectId: "p", expectedOwnerId: OWNER, panelId: D, expectedVersion: 3 },
          },
        ],
        "exact write audit",
      );
    });
    await step(
      "a failed refresh with cached numbers shows the error, never the stale numbers",
      async () => {
        fixture.failCoverage = true;
        await client.invalidateQueries({ queryKey: ["citation-coverage"] });
        await waitFor(
          () => area()?.dataset.panelCoverage === "error",
          "error after failed refresh",
        );
        assert(!versions().length, "no stale numbers");
        fixture.failCoverage = false;
        await client.invalidateQueries({ queryKey: ["citation-coverage"] });
        await waitFor(() => versions().length === 4, "numbers after a good read");
      },
    );
    await step("switching project never shows the other project's coverage", async () => {
      document.querySelector('[data-fixture="switch-project"]').click();
      await waitFor(
        () => document.querySelector("[data-fixture-project]")?.textContent === "q",
        "project q",
      );
      const flash = versions().filter((k) => k.startsWith(D) || k.startsWith(B));
      eq(flash, [], "no project p rows after the switch");
      await waitFor(() => versions().length === 1, "project q coverage");
      eq(versions(), [`${Q}:1`], "project q versions");
      eq(
        Number(entry(`${Q}:1`).querySelector("[data-coverage-observed]").dataset.coverageObserved),
        7,
        "q observed",
      );
      document.querySelector('[data-fixture="switch-project"]').click();
      await waitFor(() => versions().length === 4, "project p again");
    });
  }
  report.noNetwork = window.__miloNetworkAttempts.length === 0;
  report.writes = writes();
  report.passed = report.results.every((r) => r.ok) && !report.overflow.length && report.noNetwork;
  report.completed = true;
  publish();
}
