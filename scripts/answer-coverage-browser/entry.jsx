// CG-03A answer-domain-coverage fixture. Mounts the ACTUAL AnswerEvidencePanel (real evidenceCohorts,
// declaredDomains, canonicalUuid, Radix button, central i18n catalogs and React Query) over a deterministic
// synthetic dataset. Auth, the store's interface-language read and the four answer-evidence server functions
// are synthetic (auth.js, store.js, functions.js); the network guard in index.html refuses every request.
//
//   index.html?locale=en|pl|sv|da&variant=ready|empty|error[&check=1]
//
// Without check=1 the page stays interactive for manual review. With check=1 a scripted check clicks the
// real controls, asserts hard-coded expected counts and answer ids, and writes a JSON report to #results and
// window.__coverageFixtureReport.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnswerEvidencePanel } from "@/components/AnswerEvidencePanel";
import { analyzeAnswer } from "@/lib/answer-evidence";
import { translate } from "@/i18n";
import { fixture } from "./fixture.js";

const params = new URLSearchParams(location.search);
const locale = ["en", "pl", "sv", "da"].includes(params.get("locale"))
  ? params.get("locale")
  : "en";
const variant = ["ready", "empty", "error"].includes(params.get("variant"))
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

// ---- deterministic synthetic dataset ---------------------------------------------------------------
const OTHER_ACTOR = "00000000-0000-4000-8000-0000000000a2";
const prompt = {
  id: "abcdef00-0000-4000-8000-0000000000c1",
  revision: 1,
  createdAt: "2026-07-01T00:00:00Z",
  data: {
    prompt: "Kto sprząta mieszkania po remoncie w Gdańsku? (synthetic fixture prompt)",
    intent: "discovery",
    source: "manual",
    market: "PL — Gdańsk",
    language: "pl",
    brand: "Jasny Dom",
    websiteUrl: "https://www.jasny-dom.example.com",
    competitorUrls: [
      "https://rival-one.example.org",
      "https://WWW.rival-one.example.org/oferta",
      "https://rival-two.example.net",
      "https://jasny-dom.example.com",
      "https://shop.jasny-dom.example.com",
    ],
    active: true,
  },
};
const OWN = "jasny-dom.example.com",
  R1 = "rival-one.example.org",
  R2 = "rival-two.example.net",
  SHOP = "shop.jasny-dom.example.com";
const SURFACE_A = "Synthetic chat web",
  SURFACE_D = "Synthetic search web";
const base = {
  promptId: prompt.id,
  promptRevision: 1,
  surface: SURFACE_A,
  mode: "consumer-web",
  method: "manual copy v1",
  modelVersion: "synthetic-model-1",
  capturedAt: "2026-08-10T12:00:00Z",
  status: "complete",
  rawAnswer: "Jasny Dom is one option.",
  citations: [],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
};
const ID = {
  a1: "a1a1a1a1-0000-4000-8000-0000000000a1",
  a2: "a2a2a2a2-0000-4000-8000-0000000000a2",
  a3: "a3a3a3a3-0000-4000-8000-0000000000a3",
  a4: "a4a4a4a4-0000-4000-8000-0000000000a4",
  a5: "a5a5a5a5-0000-4000-8000-0000000000a5",
  a6: "a6a6a6a6-0000-4000-8000-0000000000a6",
  a7: "a7a7a7a7-0000-4000-8000-0000000000a7",
  a8: "a8a8a8a8-0000-4000-8000-0000000000a8",
  a9: "a9a9a9a9-0000-4000-8000-0000000000a9",
  e1: "e1e1e1e1-0000-4000-8000-0000000000e1",
  b1: "b1b1b1b1-0000-4000-8000-0000000000b1",
  c1: "c1c1c1c1-0000-4000-8000-0000000000c1",
  c2: "c2c2c2c2-0000-4000-8000-0000000000c2",
  d1: "d1d1d1d1-0000-4000-8000-0000000000d1",
  q1: "f1f1f1f1-0000-4000-8000-0000000000f1",
};
const row = (id, change, p = prompt) => {
  const input = { ...base, ...change };
  return {
    id,
    createdAt: input.capturedAt,
    hash: id.replaceAll("-", "").padEnd(64, "0"),
    input,
    prompt: p,
    analysis: analyzeAnswer(input, p),
  };
};
const cite = (host, path = "") => `https://${host}/${path}`;
fixture.datasets.p =
  variant === "empty"
    ? { prompts: [prompt], answers: [] }
    : {
        prompts: [prompt],
        answers: [
          // Group A: synthetic chat web · consumer-web · manual copy v1 · synthetic-model-1.
          row(ID.a1, { citations: [cite(OWN, "a"), cite("www." + OWN, "b"), cite(R1, "c")] }),
          row(ID.a2, { citations: [cite(SHOP, "offer")] }),
          row(ID.a3, { citations: [] }),
          row(ID.a4, {
            rawAnswer: "See https://jasny-dom.example.com in the text only.",
            citations: [cite(R2, "x"), cite("notjasny-dom.example.com")],
          }),
          row(ID.a5, { citations: [cite(OWN)], citationsComplete: false }),
          row(ID.a6, { status: "failed", rawAnswer: "", failure: "Synthetic: unavailable" }),
          row(ID.a7, {
            status: "truncated",
            failure: "Synthetic: cut off",
            citations: [cite(OWN)],
          }),
          // a8 is corrected by a9 through an UPPERCASE reference; a9 is captured after 1 September.
          row(ID.a8, { citations: [cite(R2)] }),
          row(ID.a9, {
            citations: [cite(R1, "later")],
            capturedAt: "2026-09-20T09:00:00Z",
            supersedesId: ID.a8.toUpperCase(),
          }),
          // Before 1 August: inside the default window, outside a window starting 2026-08-01.
          row(ID.e1, { citations: [cite(OWN, "july")], capturedAt: "2026-07-15T09:00:00Z" }),
          // Group B: same prompt through an API with a different model.
          row(ID.b1, { mode: "api", modelVersion: "synthetic-api-2", citations: [cite(OWN)] }),
          // Unknown model versions: two separate single-answer groups.
          row(ID.c1, {
            surface: "Synthetic unknown-model surface",
            modelVersion: null,
            citations: [cite(R1)],
          }),
          row(ID.c2, {
            surface: "Synthetic unknown-model surface",
            modelVersion: null,
            citations: [],
          }),
          // Group D: no eligible answer at all.
          row(ID.d1, { surface: SURFACE_D, citations: [cite(OWN)], citationsComplete: false }),
        ],
      };
fixture.datasets.q = {
  prompts: [{ ...prompt, id: "abcdef00-0000-4000-8000-0000000000c2" }],
  answers: [
    row(
      ID.q1,
      { promptId: "abcdef00-0000-4000-8000-0000000000c2", citations: [cite(R2)] },
      { ...prompt, id: "abcdef00-0000-4000-8000-0000000000c2" },
    ),
  ],
};

// ---- page ----------------------------------------------------------------------------------------------
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function App() {
  const [projectId, setProjectId] = useState("p");
  const [actorId, setActorId] = useState(fixture.actorId);
  fixture.actorId = actorId;
  return (
    <main className="milo-app mx-auto max-w-5xl p-4">
      <p className="mb-3 flex flex-wrap items-center gap-2 rounded border border-dashed p-2 text-xs">
        <span>
          Fixture controls (outside the product) · project <b data-fixture-project>{projectId}</b> ·
          actor <b data-fixture-actor>{actorId.slice(-2)}</b>
        </span>
        <button
          type="button"
          data-fixture="switch-project"
          className="rounded border px-2 py-1"
          onClick={() => setProjectId((p) => (p === "p" ? "q" : "p"))}
        >
          Switch project
        </button>
        <button
          type="button"
          data-fixture="switch-actor"
          className="rounded border px-2 py-1"
          onClick={() =>
            setActorId((a) =>
              a === OTHER_ACTOR ? "00000000-0000-4000-8000-0000000000a1" : OTHER_ACTOR,
            )
          }
        >
          Switch actor
        </button>
      </p>
      <AnswerEvidencePanel projectId={projectId} />
    </main>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
);
if (check) void runCheck();

// ---- scripted check -----------------------------------------------------------------------------------
async function runCheck() {
  const report = {
    fixture: "answer-coverage",
    locale,
    variant,
    viewport: { width: innerWidth, height: innerHeight },
    results: [],
    overflow: [],
  };
  const out = document.getElementById("results");
  const publish = () => {
    report.networkAttempts = window.__miloNetworkAttempts;
    report.invoked = fixture.invoked;
    window.__coverageFixtureReport = report;
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
  const panel = () => document.querySelector('section[aria-labelledby="answer-evidence-title"]');
  const articles = () => [...panel().querySelectorAll("article")];
  // A group is identified by its visible dimension line (surface · mode · method · model).
  const group = (surface, model) =>
    articles().filter((a) => a.textContent.includes(surface) && a.textContent.includes(model));
  const coverage = (a) => {
    const box = a.querySelector("[data-domain-coverage]");
    return {
      n: Number(box.dataset.domainCoverage),
      domains: Object.fromEntries(
        [...box.querySelectorAll("[data-domain]")].map((li) => [
          li.dataset.domain,
          Number(li.dataset.present),
        ]),
      ),
      total: Number(box.querySelector("[data-quality-total]").dataset.qualityTotal),
    };
  };
  const recordIds = () =>
    Object.values(ID).filter((id) =>
      [...panel().querySelectorAll("details")].some(
        (d) => !d.closest("article") && d.textContent.includes(id),
      ),
    );
  const focusStatus = () => panel().querySelector("[data-evidence-focus]");
  const buttonIn = (scope, text) =>
    [...scope.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const setDate = (index, value) => {
    const input = panel().querySelectorAll('input[type="date"]')[index];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const A = () => group(SURFACE_A, "synthetic-model-1")[0];
  const ALL = Object.values(ID).filter((id) => id !== ID.q1);

  if (variant === "error") {
    await step("a failed read shows an error and no coverage", async () => {
      await waitFor(() => panel()?.querySelector('[role="alert"]'), "read error");
      assert(!panel().querySelector("[data-domain-coverage]"), "no coverage after a failed read");
    });
  } else if (variant === "empty") {
    await step("no saved answers shows the empty states, not zeros", async () => {
      await waitFor(
        () => panel()?.textContent.includes(t("answerCoverage.noneInWindow")),
        "no answers in window",
      );
      assert(!panel().querySelector("[data-domain-coverage]"), "no coverage numbers");
    });
  } else {
    await step(
      "group A: x of the same n per declared domain, quality split and overlap notes",
      async () => {
        await waitFor(() => A(), "group A");
        eq(
          coverage(A()),
          { n: 6, domains: { [OWN]: 3, [R1]: 2, [R2]: 1, [SHOP]: 1 }, total: 9 },
          "group A",
        );
        const text = A().textContent;
        assert(
          text.includes(t("answerCoverage.alsoCompetitor")),
          "own/competitor identity is flagged",
        );
        assert(
          text.includes(t("answerCoverage.overlaps", { hosts: SHOP })),
          "own row names its overlap",
        );
        assert(
          text.includes(t("answerCoverage.overlaps", { hosts: OWN })),
          "subdomain row names its overlap",
        );
        for (const [kind, count] of [
          ["eligible", 6],
          ["incompleteCitations", 1],
          ["failed", 1],
          ["truncated", 1],
        ])
          assert(
            text.includes(t(`answerCoverage.quality.${kind}`, { count })),
            `${kind} = ${count}`,
          );
      },
    );
    await step("other groups: API apart, unknown models never pooled, n=0 is unknown", async () => {
      eq(
        coverage(group(SURFACE_A, "synthetic-api-2")[0]),
        { n: 1, domains: { [OWN]: 1, [R1]: 0, [R2]: 0, [SHOP]: 0 }, total: 1 },
        "group B",
      );
      const unknown = group("Synthetic unknown-model surface", t("answer.unknown"));
      eq(
        unknown.map((a) => coverage(a).n),
        [1, 1],
        "two separate unknown-model groups",
      );
      const d = group(SURFACE_D, "synthetic-model-1")[0];
      eq(coverage(d).n, 0, "group D n");
      assert(d.textContent.includes(t("answerCoverage.noEligible")), "n=0 says unknown, not 0%");
      assert(!d.querySelector("[data-domain]"), "no domain numbers for n=0");
    });
    await step("a domain count opens exactly its answers; Show all records returns", async () => {
      const btn = buttonIn(A(), t("answerCoverage.showPresent", { host: R1 }));
      btn.click();
      await waitFor(() => focusStatus()?.dataset.evidenceFocus === "present", "domain selection");
      eq(recordIds(), [ID.a1, ID.a9], "records citing rival-one");
      assert(btn.getAttribute("aria-pressed") === "true", "selected control is pressed");
      const heading = panel().querySelector('h3[tabindex="-1"]');
      await waitFor(() => document.activeElement === heading, "focus on the records heading");
      // As a keyboard user would: focus Show all records, then activate it. The button disappears, so focus
      // must land on the records heading again, never on the page body.
      const clear = buttonIn(focusStatus(), t("answerCoverage.showAll"));
      clear.focus();
      assert(document.activeElement === clear, "Show all records focused before clearing");
      clear.click();
      await waitFor(() => !focusStatus(), "selection cleared");
      await waitFor(
        () => document.activeElement === heading,
        "focus returns to the records heading",
      );
      assert(document.activeElement !== document.body, "focus is not lost to the page body");
      eq(recordIds(), ALL, "all records again");
    });
    await step("excluded-quality evidence stays inspectable", async () => {
      buttonIn(A(), t("answerCoverage.quality.failed", { count: 1 })).click();
      await waitFor(() => focusStatus()?.dataset.evidenceFocus === "failed", "failed selection");
      eq(recordIds(), [ID.a6], "failed records");
    });
    await step(
      "the superseded original keeps a truthful badge despite an UPPERCASE reference",
      async () => {
        const summary = [...panel().querySelectorAll("details")].find((d) =>
          d.textContent.includes(ID.a8),
        );
        assert(!summary, "a8 is not among the failed selection");
        buttonIn(focusStatus(), t("answerCoverage.showAll")).click();
        await waitFor(() => !focusStatus(), "cleared");
        const a8 = [...panel().querySelectorAll("details")].find(
          (d) => !d.closest("article") && d.textContent.includes(ID.a8),
        );
        assert(
          a8.querySelector("summary").textContent.includes(t("answer.superseded")),
          "a8 superseded badge",
        );
        const a9 = [...panel().querySelectorAll("details")].find(
          (d) => !d.closest("article") && d.textContent.includes(ID.a9),
        );
        assert(
          !a9.querySelector("summary").textContent.includes(t("answer.superseded")),
          "a9 current",
        );
      },
    );
    await step(
      "changing the start date and the end date each clear the selection and recount",
      async () => {
        buttonIn(A(), t("answerCoverage.showPresent", { host: OWN })).click();
        await waitFor(() => focusStatus(), "own selection");
        setDate(0, "2026-08-01");
        await waitFor(() => !focusStatus() && coverage(A()).n === 5, "window from 2026-08-01");
        eq(coverage(A()).domains, { [OWN]: 2, [R1]: 2, [R2]: 1, [SHOP]: 1 }, "e1 left the window");
        // Select again (a real quality drill-down) so the END date change is tested on its own.
        buttonIn(A(), t("answerCoverage.quality.truncated", { count: 1 })).click();
        await waitFor(
          () => focusStatus()?.dataset.evidenceFocus === "truncated",
          "truncated selection",
        );
        eq(recordIds(), [ID.a7], "truncated records before the end-date change");
        setDate(1, "2026-09-01");
        // a9 (the correction) is now outside the window, yet a8 stays retired.
        await waitFor(() => !focusStatus() && coverage(A()).n === 4, "window to 2026-09-01");
        eq(
          coverage(A()).domains,
          { [OWN]: 2, [R1]: 1, [R2]: 1, [SHOP]: 1 },
          "successor outside the window",
        );
        setDate(0, "2020-01-01");
        setDate(1, "2027-01-01");
        await waitFor(() => coverage(A()).n === 6, "default-like window restored");
      },
    );
    await step("switching project or actor resets the drill-down", async () => {
      buttonIn(A(), t("answerCoverage.showPresent", { host: R2 })).click();
      await waitFor(() => focusStatus(), "selection before switch");
      document.querySelector('[data-fixture="switch-project"]').click();
      await waitFor(
        () => recordIds().includes(ID.q1) || panel().textContent.includes(ID.q1),
        "project q",
      );
      assert(!focusStatus(), "no selection carried into project q");
      document.querySelector('[data-fixture="switch-project"]').click();
      await waitFor(() => A(), "project p again");
      assert(!focusStatus(), "no selection restored in project p");
      buttonIn(A(), t("answerCoverage.showPresent", { host: R2 })).click();
      await waitFor(() => focusStatus(), "selection before actor switch");
      const actor = () => document.querySelector("[data-fixture-actor]")?.textContent;
      eq(actor(), "a1", "starting actor");
      document.querySelector('[data-fixture="switch-actor"]').click();
      // Wait for the NEW actor's panel (the identity label changed and its data loaded), not the old one.
      await waitFor(() => actor() === "a2" && A(), "panel for actor a2");
      assert(!focusStatus(), "no selection carried to another actor");
      document.querySelector('[data-fixture="switch-actor"]').click();
      await waitFor(() => actor() === "a1" && A(), "panel for actor a1 again");
      assert(!focusStatus(), "no selection restored for the original actor");
    });
  }
  report.noNetwork = window.__miloNetworkAttempts.length === 0;
  report.noWrites = fixture.invoked.every((c) => c.read);
  report.passed =
    report.results.every((r) => r.ok) &&
    !report.overflow.length &&
    report.noNetwork &&
    report.noWrites;
  report.completed = true;
  publish();
}
