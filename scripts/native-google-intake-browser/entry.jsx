// Native Google intake fixture. Mounts the ACTUAL NativeGoogleIntakePanel with synthetic store, auth
// and server functions (store.js, auth.js, fixture.js); the network guard in index.html refuses every
// request. Interactive by default; `?check=1` runs a scripted matrix (a scaffold for Codex's native
// browser acceptance — it does NOT prove the browser until Codex runs it, including 390px + keyboard).
//
//   index.html?locale=en|pl|sv|da[&check=1]
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NativeGoogleIntakePanel } from "@/components/NativeGoogleIntakePanel";
import { useStore } from "@/lib/store";
import { translate } from "@/i18n";
import { fixture } from "./fixture.js";

const params = new URLSearchParams(location.search);
const locale = ["en", "pl", "sv", "da"].includes(params.get("locale"))
  ? params.get("locale")
  : "en";
const check = params.get("check") === "1";
const t = (key, vars) => translate(locale, key, vars);
try {
  // Remove any device override so the active project's appLanguage (set below) decides the UI
  // language — the actual useT the panel renders, so the fixture shows the REQUESTED locale.
  localStorage.removeItem("milo.uiLocale");
} catch {
  /* storage may be unavailable */
}
fixture.locale = locale;
fixture.state.projects.forEach((p) => (p.appLanguage = locale));
const DATA_CSV = "Date,Impressions\n2026-09-01,12\n2026-09-02,0\n";
const FILTERS_CSV =
  "Filter,Value\nSearch type,Web (text-based)\nDate,Last 3 months\nCountry,Sweden\n";
// SYNTHETIC Bing "AI Performance" (BETA) samples for interactive testing: pick the Bing source, then
// upload one of these as the Data CSV (Bing has no Filters.csv). The real parser interprets them.
const BING_OVERVIEW_CSV =
  "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/14/2026 12:00:00 AM,0,0\n";
const BING_PAGES_CSV = "Page,Citations\nhttps://example.test/a,2\nhttps://example.test/b,1\n";
window.__nativeIntakeBingSamples = { BING_OVERVIEW_CSV, BING_PAGES_CSV };

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.__nativeIntakeClient = client;
function Root() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  return <NativeGoogleIntakePanel projectId={activeProjectId} />;
}
function FixtureControls() {
  const btn = (onClick, text) => (
    <button type="button" className="rounded border px-2 py-1" onClick={onClick}>
      {text}
    </button>
  );
  return (
    <p
      className="m-2 flex flex-wrap gap-2 rounded border border-dashed p-2 text-xs"
      data-fixture-controls
    >
      Fixture controls (outside the product):
      {btn(() => fixture.signOut(), "Sign out")}
      {btn(() => fixture.signIn(), "Sign in")}
      {btn(() => fixture.reHydrateSameActor(), "Same-actor re-sign-in")}
      {btn(() => fixture.pauseWorkspace(), "Pause workspace")}
      {btn(() => fixture.resumeWorkspace(), "Resume workspace")}
      {btn(
        () => fixture.switchProject(fixture.state.activeProjectId === "p" ? "q" : "p"),
        "Switch project",
      )}
      {btn(() => (fixture.failReads = !fixture.failReads), "Toggle read failure")}
      {btn(() => (fixture.hanging = "stage"), "Hang next stage")}
      {btn(() => (fixture.hanging = "persist"), "Hang next persist")}
      {btn(() => fixture.release("ok"), "Release (ok)")}
      {btn(() => fixture.release("fail"), "Release (fail)")}
    </p>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <FixtureControls />
    <Root />
  </QueryClientProvider>,
);
if (check) void runCheck();

async function runCheck() {
  const report = { fixture: "native-google-intake", locale, results: [] };
  const out = document.getElementById("results");
  const publish = () => {
    report.networkAttempts = window.__miloNetworkAttempts;
    report.calls = fixture.calls;
    window.__nativeIntakeReport = report;
    out.textContent = JSON.stringify(report, null, 2);
  };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const assert = (v, m) => {
    if (!v) throw Error(m);
  };
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
      if (Date.now() > until) throw Error(`Timed out: ${what}`);
      await tick();
    }
  }
  async function step(name, fn) {
    const start = fixture.calls.length;
    try {
      await fn(start);
      report.results.push({ name, ok: true });
    } catch (e) {
      report.results.push({ name, ok: false, error: String(e?.message ?? e) });
    }
    publish();
  }
  const section = () => document.querySelector("[aria-labelledby=native-intake-title]");
  const h2 = () => section()?.querySelector("h2");
  const labelled = (text) => {
    const l = [...(section()?.querySelectorAll("label") ?? [])].find(
      (x) => x.childNodes[0]?.textContent?.trim() === text,
    );
    return l?.querySelector("input,select,textarea");
  };
  const scoped = (root, text) =>
    [...(root?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === text);
  const button = (text) => scoped(section(), text);
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
  const setFile = (el, file) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const csv = (name, body) => new File([body], name, { type: "text/csv" });
  const preview = () => section()?.querySelector("[data-intake-preview]");
  const article = () => section()?.querySelector("[data-intake-artifact]");
  const opened = () => section()?.querySelector("[data-intake-opened]");
  const ready = () => section()?.querySelector('[data-intake-badge="ready"]');
  const writes = (start, name) => fixture.calls.slice(start).filter((c) => c.name === name).length;
  async function fillForm({
    data = csv("Chart.csv", DATA_CSV),
    filters = csv("Filters.csv", FILTERS_CSV),
  } = {}) {
    // Establish the Google source first (a prior step may have left Bing selected, where there is no
    // Filters.csv input); switching restores the Filters.csv field, so await the re-render before
    // touching the Google-only fields — parallel to bingFillForm.
    setValue(labelled(t("nativeIntake.sourceLabel")), "gsc_generative_ai_search");
    await tick();
    setValue(labelled(t("nativeIntake.propertyLabel")), "https://example.test/");
    setValue(labelled(t("nativeIntake.startLabel")), "2026-09-01");
    setValue(labelled(t("nativeIntake.endLabel")), "2026-11-13");
    setValue(labelled(t("nativeIntake.capturedAtLabel")), "2026-11-13T09:00");
    setValue(labelled(t("nativeIntake.completenessLabel")), "partial");
    setFile(labelled(t("nativeIntake.dataCsvLabel")), data);
    setFile(labelled(t("nativeIntake.filtersCsvLabel")), filters);
  }
  async function previewAndSave() {
    await fillForm();
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(() => preview(), "preview shown");
    button(t("nativeIntake.saveBtn")).click();
    await waitFor(() => ready(), "Report ready badge");
  }
  // Bing journeys reuse the same panel/helpers — no second panel or framework. Switching the source
  // resets the CSV kind and drops the Filters.csv input, so set source first, then the Bing fields.
  // BING_OVERVIEW_CSV / BING_PAGES_CSV are the module-level synthetic samples defined above.
  async function bingFillForm({
    file = "bing_overview",
    body = BING_OVERVIEW_CSV,
    completeness = "partial",
    dataFile = null,
  } = {}) {
    setValue(labelled(t("nativeIntake.sourceLabel")), "bing_ai_performance");
    await tick();
    setValue(labelled(t("nativeIntake.fileLabel")), file);
    setValue(labelled(t("nativeIntake.propertyLabel")), "https://example.test/");
    setValue(labelled(t("nativeIntake.startLabel")), "2026-08-13");
    setValue(labelled(t("nativeIntake.endLabel")), "2026-11-13");
    setValue(labelled(t("nativeIntake.capturedAtLabel")), "2026-11-13T09:00");
    setValue(labelled(t("nativeIntake.completenessLabel")), completeness);
    setFile(
      labelled(t("nativeIntake.dataCsvLabel")),
      dataFile ?? csv(file === "bing_pages" ? "Pages.csv" : "Overview.csv", body),
    );
  }
  const metric = (k) => t("nativeIntake.metric." + k);
  const articleBySource = (src) =>
    [...(section()?.querySelectorAll("[data-intake-artifact]") ?? [])].find((a) =>
      a.textContent.includes(t("nativeIntake.source." + src)),
    );

  await step("the actual h2 renders in the requested locale", async () => {
    await waitFor(() => h2(), "panel");
    assert(h2().textContent.trim() === t("nativeIntake.title"), `h2 is ${t("nativeIntake.title")}`);
  });

  await step("upload + preview shows a source-partial report, then Save stores it", async () => {
    fixture.reset();
    await client.invalidateQueries();
    await waitFor(() => button(t("nativeIntake.previewBtn")), "panel ready");
    await fillForm();
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(() => preview(), "preview shown");
    assert(
      preview().textContent.includes(t("nativeIntake.nativeLabel.gsc")),
      "Google native label shown",
    );
    assert(
      preview().textContent.includes(
        t("nativeIntake.sourceIncompleteWarn", {
          completeness: t("nativeIntake.completeness.partial"),
        }),
      ),
      "source-partial warning shown",
    );
    button(t("nativeIntake.saveBtn")).click();
    await waitFor(() => ready(), "Report ready badge");
  });

  await step("changing an input after preview invalidates it (Save disappears)", async () => {
    fixture.reset();
    await client.invalidateQueries();
    await fillForm();
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(() => preview(), "preview shown");
    setValue(labelled(t("nativeIntake.propertyLabel")), "https://changed.test/");
    await tick();
    assert(!preview(), "preview cleared after a material change");
  });

  await step("both oversize files are refused before any read or request", async () => {
    for (const oversized of ["data", "filters"]) {
      fixture.reset();
      await client.invalidateQueries();
      const before = fixture.calls.length;
      const data = csv(
        "Chart.csv",
        oversized === "data" ? "D".repeat(2 * 1024 * 1024 + 1) : DATA_CSV,
      );
      const filters = csv(
        "Filters.csv",
        oversized === "filters" ? "F".repeat(2 * 1024 * 1024 + 1) : FILTERS_CSV,
      );
      let reads = 0;
      for (const selected of [data, filters]) {
        const read = selected.arrayBuffer.bind(selected);
        selected.arrayBuffer = () => {
          reads += 1;
          return read();
        };
      }
      await fillForm({ data, filters });
      button(t("nativeIntake.previewBtn")).click();
      await waitFor(
        () => section().textContent.includes(t("nativeIntake.err.tooLarge")),
        "too-large error",
      );
      assert(!preview(), "no preview for an oversize file");
      assert(reads === 0, `${oversized}: neither file was read`);
      assert(fixture.calls.length === before, `${oversized}: no server call after preparation`);
    }
  });

  await step("a failed Refresh masks the opened detail and the list", async () => {
    fixture.reset();
    await client.invalidateQueries();
    await previewAndSave();
    button(t("nativeIntake.view")).click();
    await waitFor(() => opened(), "detail opened");
    fixture.failReads = true;
    button(t("nativeIntake.refresh")).click();
    await waitFor(
      () => section().textContent.includes(t("nativeIntake.loadError")),
      "load error shown",
    );
    assert(!opened(), "opened detail cleared on a failed refresh");
    assert(!article(), "stale list hidden on a failed read");
    fixture.failReads = false;
  });

  await step(
    "a deferred stage then a project switch issues no dependent persist",
    async (start) => {
      fixture.reset();
      await client.invalidateQueries();
      await fillForm();
      button(t("nativeIntake.previewBtn")).click();
      await waitFor(() => preview(), "preview shown");
      fixture.hanging = "stage";
      button(t("nativeIntake.saveBtn")).click();
      await waitFor(
        () => fixture.calls.some((c) => c.name === "stageNativeArtifactFn"),
        "stage sent",
      );
      fixture.switchProject("q");
      await tick();
      fixture.release("ok");
      await tick();
      await tick();
      assert(writes(start, "persistNativeReportFn") === 0, "no persist after the scope changed");
      fixture.switchProject("p");
    },
  );

  await step("a same-actor re-sign-in during a deferred stage issues no persist", async (start) => {
    fixture.reset();
    await client.invalidateQueries();
    await fillForm();
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(() => preview(), "preview shown");
    fixture.hanging = "stage";
    button(t("nativeIntake.saveBtn")).click();
    await waitFor(
      () => fixture.calls.some((c) => c.name === "stageNativeArtifactFn"),
      "stage sent",
    );
    fixture.reHydrateSameActor();
    await tick();
    fixture.release("ok");
    await tick();
    await tick();
    assert(writes(start, "persistNativeReportFn") === 0, "no persist from the retired session");
  });

  await step("a transient persist failure keeps inputs; an exact retry makes one row", async () => {
    fixture.reset();
    await client.invalidateQueries();
    await fillForm();
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(() => preview(), "preview shown");
    fixture.hanging = "persist";
    button(t("nativeIntake.saveBtn")).click();
    await waitFor(() => fixture.hanging && typeof fixture.hanging === "function", "persist hung");
    fixture.release("fail");
    await waitFor(
      () => section().textContent.includes(t("nativeIntake.err.save")),
      "save error shown",
    );
    assert(preview(), "inputs/preview preserved on a transient failure");
    button(t("nativeIntake.saveBtn")).click();
    await waitFor(() => ready(), "report ready after the exact retry");
    assert(fixture.db.artifacts.length === 1, "exactly one stored row after retry");
  });

  await step("delete asks first; Cancel keeps it, Delete removes it", async () => {
    fixture.reset();
    await client.invalidateQueries();
    await previewAndSave();
    button(t("nativeIntake.deleteBtn")).click();
    const confirm = await waitFor(
      () => article()?.querySelector('[role="alert"]'),
      "confirm shown",
    );
    scoped(confirm, t("nativeIntake.cancel")).click();
    await waitFor(() => !article()?.querySelector('[role="alert"]'), "cancel closes confirm");
    assert(article(), "artifact kept after Cancel");
    button(t("nativeIntake.deleteBtn")).click();
    const confirm2 = await waitFor(() => article()?.querySelector('[role="alert"]'), "confirm 2");
    scoped(confirm2, t("nativeIntake.deleteBtn")).click();
    await waitFor(() => !article(), "artifact removed after confirm");
  });

  await step("Bing Overview previews citations + cited pages, saves, reopens as Bing", async () => {
    fixture.reset();
    await client.invalidateQueries();
    await waitFor(() => button(t("nativeIntake.previewBtn")), "panel ready");
    await bingFillForm({ file: "bing_overview" });
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(() => preview(), "bing overview preview");
    assert(preview().textContent.includes(t("nativeIntake.nativeLabel.bing")), "Bing label shown");
    assert(preview().textContent.includes(metric("citations")), "citations metric shown");
    assert(preview().textContent.includes(metric("cited_pages")), "cited-pages metric shown");
    assert(!preview().textContent.includes(metric("impressions")), "no Google impressions metric");
    button(t("nativeIntake.saveBtn")).click();
    await waitFor(() => ready(), "bing overview ready");
    button(t("nativeIntake.view")).click();
    await waitFor(() => opened(), "bing detail opened");
    assert(
      opened().textContent.includes(t("nativeIntake.nativeLabel.bing")),
      "opened keeps Bing label",
    );
  });

  await step("Bing Pages previews the citations metric only", async () => {
    fixture.reset();
    await client.invalidateQueries();
    await bingFillForm({ file: "bing_pages", body: BING_PAGES_CSV });
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(() => preview(), "bing pages preview");
    assert(preview().textContent.includes(metric("citations")), "citations metric shown");
    assert(
      !preview().textContent.includes(metric("cited_pages")),
      "no cited-pages metric for pages",
    );
    button(t("nativeIntake.saveBtn")).click();
    await waitFor(() => ready(), "bing pages ready");
  });

  await step(
    "switching source clears the preview and restores the Google Filters requirement",
    async () => {
      fixture.reset();
      await client.invalidateQueries();
      await bingFillForm({ file: "bing_overview" });
      button(t("nativeIntake.previewBtn")).click();
      await waitFor(() => preview(), "bing preview");
      // Back to Google: the preview is invalidated and the Filters.csv input returns.
      setValue(labelled(t("nativeIntake.sourceLabel")), "gsc_generative_ai_search");
      await tick();
      assert(!preview(), "preview cleared on a source switch");
      assert(labelled(t("nativeIntake.filtersCsvLabel")), "Filters.csv input restored for Google");
      setValue(labelled(t("nativeIntake.propertyLabel")), "https://example.test/");
      setValue(labelled(t("nativeIntake.startLabel")), "2026-09-01");
      setValue(labelled(t("nativeIntake.endLabel")), "2026-11-13");
      setValue(labelled(t("nativeIntake.capturedAtLabel")), "2026-11-13T09:00");
      setValue(labelled(t("nativeIntake.completenessLabel")), "partial");
      setFile(labelled(t("nativeIntake.dataCsvLabel")), csv("Chart.csv", DATA_CSV));
      // No Filters.csv chosen → Google refuses to preview.
      button(t("nativeIntake.previewBtn")).click();
      await waitFor(
        () => section().textContent.includes(t("nativeIntake.err.fileRequired")),
        "Filters required error",
      );
      assert(!preview(), "no Google preview without its Filters.csv");
    },
  );

  await step("a CSV that is not the selected source and kind is rejected", async () => {
    fixture.reset();
    await client.invalidateQueries();
    // The Google impressions CSV cannot be read as a Bing Overview (wrong columns).
    await bingFillForm({ file: "bing_overview", body: DATA_CSV });
    button(t("nativeIntake.previewBtn")).click();
    await waitFor(
      () => section().textContent.includes(t("nativeIntake.err.parseFailed")),
      "parse-failed error",
    );
    assert(!preview(), "no preview for a mismatched CSV");
  });

  await step(
    "Bing has no Filters input and an oversize Bing file fails before any read",
    async () => {
      fixture.reset();
      await client.invalidateQueries();
      const before = fixture.calls.length;
      const big = csv("Overview.csv", "D".repeat(2 * 1024 * 1024 + 1));
      let reads = 0;
      const read = big.arrayBuffer.bind(big);
      big.arrayBuffer = () => {
        reads += 1;
        return read();
      };
      await bingFillForm({ file: "bing_overview", dataFile: big });
      assert(!labelled(t("nativeIntake.filtersCsvLabel")), "Bing shows no Filters.csv input");
      button(t("nativeIntake.previewBtn")).click();
      await waitFor(
        () => section().textContent.includes(t("nativeIntake.err.tooLarge")),
        "too-large error",
      );
      assert(!preview(), "no preview for an oversize Bing file");
      assert(reads === 0, "the oversize Bing file was never read");
      assert(fixture.calls.length === before, "no server call after the size gate");
    },
  );

  await step(
    "same property/window Google + Bing cards stay distinct by source; delete is scoped",
    async (start) => {
      fixture.reset();
      await client.invalidateQueries();
      await waitFor(() => button(t("nativeIntake.previewBtn")), "panel ready");
      // Google chart over the SAME property/window/dimension (date) as the Bing overview below —
      // without the per-card source label the two cards would be indistinguishable.
      await fillForm();
      setValue(labelled(t("nativeIntake.startLabel")), "2026-08-13");
      button(t("nativeIntake.previewBtn")).click();
      await waitFor(() => preview(), "google preview");
      button(t("nativeIntake.saveBtn")).click();
      await waitFor(() => ready(), "google ready");
      // Bing overview over the same property/window, but let its persist FAIL so it stays an
      // unparsed card (no View button, Delete still available — the risky case under review).
      await bingFillForm({ file: "bing_overview" });
      button(t("nativeIntake.previewBtn")).click();
      await waitFor(() => preview(), "bing preview");
      fixture.hanging = "persist";
      button(t("nativeIntake.saveBtn")).click();
      await waitFor(() => fixture.hanging && typeof fixture.hanging === "function", "persist hung");
      fixture.release("fail");
      const google = () => articleBySource("gsc_generative_ai_search");
      const bing = () => articleBySource("bing_ai_performance");
      await waitFor(() => google() && bing(), "both cards listed");
      // Each card shows its OWN source (not the currently selected form source), so the two
      // otherwise-identical cards are distinguishable.
      assert(google() !== bing(), "two distinct cards by source");
      assert(!scoped(bing(), t("nativeIntake.view")), "unparsed Bing card has no View");
      assert(scoped(bing(), t("nativeIntake.deleteBtn")), "unparsed Bing card still has Delete");
      // Cancel issues no delete; the confirmation names the source being deleted.
      scoped(bing(), t("nativeIntake.deleteBtn")).click();
      const confirm = await waitFor(() => bing()?.querySelector('[role="alert"]'), "confirm shown");
      assert(
        confirm.textContent.includes(t("nativeIntake.source.bing_ai_performance")),
        "confirm identifies the Bing source",
      );
      scoped(confirm, t("nativeIntake.cancel")).click();
      await waitFor(() => !bing()?.querySelector('[role="alert"]'), "cancel closed");
      assert(writes(start, "removeNativeArtifactFn") === 0, "Cancel issues no delete");
      assert(google() && bing(), "both kept after Cancel");
      // Confirming on the Bing card deletes exactly its id and preserves the Google card.
      scoped(bing(), t("nativeIntake.deleteBtn")).click();
      const confirm2 = await waitFor(() => bing()?.querySelector('[role="alert"]'), "confirm 2");
      scoped(confirm2, t("nativeIntake.deleteBtn")).click();
      await waitFor(() => !bing(), "bing card removed");
      assert(google(), "google card preserved");
      assert(writes(start, "removeNativeArtifactFn") === 1, "exactly one delete issued");
    },
  );

  report.noNetwork = window.__miloNetworkAttempts.length === 0;
  report.passed = report.results.every((r) => r.ok) && report.noNetwork;
  report.completed = true;
  publish();
}
