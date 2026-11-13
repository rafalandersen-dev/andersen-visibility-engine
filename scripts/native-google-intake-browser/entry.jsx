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
    assert(preview().textContent.includes(t("nativeIntake.nativeLabel")), "native label shown");
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

  report.noNetwork = window.__miloNetworkAttempts.length === 0;
  report.passed = report.results.every((r) => r.ok) && report.noNetwork;
  report.completed = true;
  publish();
}
