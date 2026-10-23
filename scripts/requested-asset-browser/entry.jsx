// CX browser harness: the real useRequestedAsset hook and the real workspace store
// (reloadWorkspaceForUser, autosave, save status) in actual browser React, against
// the in-memory fixture network. "Run all" executes eight groups and writes a JSON
// report to #results; every group's controls are also exposed for manual steps.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useRequestedAsset } from "@/lib/requested-asset";
import {
  getState,
  getWorkspaceSaveStatus,
  hydrateForUser,
  resetStore,
  upsertContent,
  useStore,
  useWorkspaceSaveStatus,
  WORKSPACE_RELOAD_TIMEOUT_MS,
} from "@/lib/store";
import { translate } from "@/i18n/translate";
import { releaseHeldReads, releaseHeldSaves } from "./network.js";

const f = window.cxFixture;
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SECOND = "00000000-0000-4000-8000-0000000000b2";
const WEEKLY = "5bba0646-518a-4051-ac5b-215b76194727";
const PRESENT_B = "existing-1";
const GONE_A = "00000000-0000-4000-8000-00000000dead";
const OTHER_PROJECT = "00000000-0000-4000-8000-0000000000c3";
const t = (key) => translate("en", key);

const asset = (id, projectId = "synergy", title = `Draft ${id}`) => ({
  id,
  projectId,
  title,
  status: "Draft",
  body: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});
const existing = Array.from({ length: 53 }, (_, i) => asset(`existing-${i}`));
const workspace = (content) => ({
  projects: [
    { id: "synergy", businessName: "Synergy" },
    { id: "other", businessName: "Other project" },
  ],
  content,
  activeProjectId: "synergy",
});
const seed = (userId, content, rev = 40) => {
  f.docs[userId] = { doc: workspace(content), rev };
};

// ---- probe: what the editor renders for an explicit ?id= ----
const statusLog = [];
let setProbe = () => undefined;
let probeRetry = () => undefined;

function Probe({ requestedId, mount }) {
  const requested = useRequestedAsset(requestedId);
  const content = useStore((s) => s.content.length);
  const save = useWorkspaceSaveStatus();
  useEffect(() => {
    statusLog.push({ mount, requestedId: requestedId ?? null, status: requested.status });
  }, [mount, requestedId, requested.status]);
  probeRetry = requested.retry;
  return (
    <section data-testid="probe">
      <p>
        requested <code>{requestedId ?? "(none)"}</code> →{" "}
        <strong id="status">{requested.status}</strong>
        {" · "}content {content} · save {save.kind}
      </p>
      {requested.status === "loading" ? <p>{t("common.loading")}</p> : null}
      {requested.status === "missing" ? <p>{t("editorScreen.requestedMissing")}</p> : null}
      {requested.status === "unsaved" || requested.status === "unavailable" ? (
        <>
          {requested.status === "unsaved" ? <p>{t("editorScreen.unsaved")}</p> : null}
          <p>{t("editorScreen.requestedUnavailable")}</p>
          <button id="retry" type="button" onClick={requested.retry}>
            {t("common.retry")}
          </button>
        </>
      ) : null}
    </section>
  );
}

let mountCounter = 0;
function App() {
  const [probe, set] = useState({ mounted: false, id: undefined, mount: 0 });
  setProbe = (next) =>
    set((p) => {
      const merged = { ...p, ...next };
      if (next.mounted && !p.mounted) merged.mount = ++mountCounter;
      return merged;
    });
  return probe.mounted ? (
    <Probe requestedId={probe.id} mount={probe.mount} />
  ) : (
    <p>probe unmounted</p>
  );
}

// ---- runner helpers (test infrastructure only) ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (predicate()) return true;
    await sleep(20);
  }
  return predicate();
}
const status = () => document.getElementById("status")?.textContent ?? "(unmounted)";
const has = (id) => getState().content.some((c) => c.id === id);
const titleOf = (id) => getState().content.find((c) => c.id === id)?.title;
const edit = (id, title) =>
  upsertContent({ ...getState().content.find((c) => c.id === id), title });
async function fresh(userId = OWNER) {
  setProbe({ mounted: false, id: undefined });
  await sleep(30);
  releaseHeldReads();
  releaseHeldSaves();
  f.holdNextRead = false;
  f.holdSaves = false;
  resetStore();
  await hydrateForUser(userId);
  // Counters start after hydration: only recovery reads and saves are counted.
  f.reads.length = 0;
  f.saves.length = 0;
  statusLog.length = 0;
}
const mountProbe = async (id) => {
  setProbe({ mounted: true, id });
  await sleep(30);
};
const readsFor = (userId = OWNER) => f.reads.filter((r) => r.userId === userId).length;

const groups = {
  async "1 stale workspace opens the background-created 54th draft"() {
    seed(OWNER, existing);
    await fresh();
    seed(OWNER, [...existing, asset(WEEKLY, "synergy", "Saturday weekly draft")], 41);
    const before = readsFor();
    await mountProbe(WEEKLY);
    await waitFor(() => status() === "present");
    return {
      present: status() === "present",
      oneRead: readsFor() - before === 1,
      content54: getState().content.length === 54,
      sawLoading: statusLog.some((s) => s.status === "loading"),
      noSave: f.saves.length === 0,
    };
  },
  async "2 stalled read hits the deadline; late response never applies; retry recovers"() {
    seed(OWNER, existing);
    await fresh();
    seed(OWNER, [...existing, asset(WEEKLY)], 41);
    f.holdNextRead = true;
    await mountProbe(WEEKLY);
    await sleep(1000);
    const loadingBeforeDeadline = status() === "loading";
    await waitFor(() => status() === "unavailable", WORKSPACE_RELOAD_TIMEOUT_MS + 2000);
    const unavailableAfterDeadline = status() === "unavailable";
    releaseHeldReads(); // late answer contains the new draft
    await sleep(300);
    const lateIgnored = !has(WEEKLY) && getState().rev === 40 && status() === "unavailable";
    document.getElementById("retry")?.click();
    await waitFor(() => status() === "present");
    return {
      loadingBeforeDeadline,
      unavailableAfterDeadline,
      lateIgnored,
      explicitRetryPresent: status() === "present",
      reads: readsFor() === 2,
    };
  },
  async "3 dirty before/during read preserved; one bounded retry after a confirmed save"() {
    seed(OWNER, existing);
    await fresh();
    seed(OWNER, [...existing, asset(WEEKLY)], 41);
    f.holdSaves = true;
    edit("existing-3", "Unsaved before the read");
    await mountProbe(WEEKLY);
    await waitFor(() => status() === "unsaved");
    const refusedBeforeRead = status() === "unsaved" && readsFor() === 0;
    // Confirm the save; the hook makes exactly one automatic attempt, held here.
    f.holdNextRead = true;
    await waitFor(() => f.heldSaves.length === 1);
    releaseHeldSaves();
    await waitFor(() => readsFor() === 1);
    const autoAttempt = readsFor() === 1;
    edit("existing-5", "Typed during the read"); // save stays held
    releaseHeldReads();
    await waitFor(() => status() === "unsaved");
    const duringReadPreserved =
      status() === "unsaved" && !has(WEEKLY) && titleOf("existing-5") === "Typed during the read";
    await waitFor(() => f.heldSaves.length === 1);
    releaseHeldSaves();
    f.holdSaves = false;
    await waitFor(() => getWorkspaceSaveStatus().kind === "saved");
    await sleep(1500);
    const noSecondAutomatic = readsFor() === 1 && status() === "unsaved";
    document.getElementById("retry")?.click();
    await waitFor(() => status() === "present");
    return {
      refusedBeforeRead,
      autoAttempt,
      duringReadPreserved,
      noSecondAutomatic,
      explicitRetryPresent: status() === "present",
      editsKept:
        titleOf("existing-3") === "Unsaved before the read" &&
        titleOf("existing-5") === "Typed during the read",
    };
  },
  async "4 A pending → B present → no id → A again starts fresh (not stuck)"() {
    seed(OWNER, existing);
    await fresh();
    f.holdNextRead = true;
    await mountProbe(GONE_A);
    const aLoading = status() === "loading";
    setProbe({ id: PRESENT_B });
    await sleep(50);
    const bPresent = status() === "present";
    releaseHeldReads(); // A's superseded answer
    await sleep(200);
    const bStillPresent = status() === "present";
    setProbe({ id: undefined });
    await sleep(50);
    const noIdPresent = status() === "present";
    const before = readsFor();
    setProbe({ id: GONE_A });
    await waitFor(() => status() === "missing");
    return {
      aLoading,
      bPresent,
      bStillPresent,
      noIdPresent,
      aFreshRead: readsFor() - before === 1,
      aMissing: status() === "missing",
      bNeverMissing: !statusLog.some((s) => s.requestedId === PRESENT_B && s.status !== "present"),
    };
  },
  async "5 account change with the same requested id"() {
    seed(OWNER, existing);
    seed(SECOND, existing.slice(0, 3));
    await fresh();
    f.holdNextRead = true;
    await mountProbe(WEEKLY);
    seed(OWNER, [...existing, asset(WEEKLY)], 41); // owner's server now has it
    await hydrateForUser(SECOND);
    await waitFor(() => status() === "missing");
    const secondMissing = status() === "missing" && readsFor(SECOND) === 2;
    releaseHeldReads(); // owner's late answer
    await sleep(300);
    return {
      secondMissing,
      stillSecond: getState().userId === SECOND,
      noBleed: !has(WEEKLY) && getState().content.length === 3,
      statusUnchanged: status() === "missing",
    };
  },
  async "6 unmount during a read, then remount"() {
    seed(OWNER, existing);
    await fresh();
    seed(OWNER, [...existing, asset(WEEKLY)], 41);
    f.holdNextRead = true;
    await mountProbe(WEEKLY);
    const mount = mountCounter;
    setProbe({ mounted: false });
    await sleep(30);
    const logAtUnmount = statusLog.length;
    releaseHeldReads();
    await sleep(300);
    const noUpdateAfterUnmount = statusLog.slice(logAtUnmount).every((s) => s.mount !== mount);
    const before = readsFor();
    await mountProbe(WEEKLY);
    await waitFor(() => status() === "present");
    return {
      noUpdateAfterUnmount,
      clean_store_applied: has(WEEKLY),
      remountPresentWithoutRead: status() === "present" && readsFor() === before,
    };
  },
  async "7 a draft in another project stays generically missing"() {
    seed(OWNER, [...existing, asset(OTHER_PROJECT, "other", "Other project's draft")]);
    await fresh();
    await mountProbe(OTHER_PROJECT);
    await waitFor(() => status() === "missing");
    return {
      missing: status() === "missing",
      activeUnchanged: getState().activeProjectId === "synergy",
      genericCopy: document.body.textContent.includes(t("editorScreen.requestedMissing")),
      noTitleShown: !document
        .getElementById("probe-root")
        .textContent.includes("Other project's draft"),
      noSave: f.saves.length === 0,
    };
  },
  async "8 an already-present draft never reads"() {
    seed(OWNER, existing);
    await fresh();
    const before = readsFor();
    await mountProbe("existing-7");
    await sleep(200);
    return { present: status() === "present", noRead: readsFor() === before };
  },
};

async function runAll() {
  const out = document.getElementById("results");
  out.textContent = "Running (group 2 waits for the real deadline)…";
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));
  const report = { completed: false, timeoutMs: WORKSPACE_RELOAD_TIMEOUT_MS, groups: {} };
  for (const [name, run] of Object.entries(groups)) {
    try {
      const checks = await run();
      report.groups[name] = { pass: Object.values(checks).every(Boolean), checks };
    } catch (e) {
      report.groups[name] = { pass: false, error: String(e) };
    }
    out.textContent = JSON.stringify(report, null, 2);
  }
  setProbe({ mounted: false, id: undefined });
  report.completed = true;
  report.allPass = Object.values(report.groups).every((g) => g.pass);
  report.pageErrors = errors;
  report.reads = f.reads.length;
  out.textContent = JSON.stringify(report, null, 2);
  window.cxReport = report;
}

// Manual controls (the same steps the runner uses).
window.cx = {
  runAll,
  groups,
  fresh,
  seed,
  mountProbe,
  setProbe: (p) => setProbe(p),
  retry: () => probeRetry(),
  holdNextRead: () => (f.holdNextRead = true),
  releaseHeldReads,
  holdSaves: (on = true) => (f.holdSaves = on),
  releaseHeldSaves,
  edit,
  statusLog,
};

createRoot(document.getElementById("probe-root")).render(<App />);
document.getElementById("run").addEventListener("click", () => void runAll());
