// CG-02A task-continuity fixture. Mounts the ACTUAL citation-review, Plan and Editor
// routes (real CitationForwardPanel, AppShell, OpportunityDrawer and Editor) under a real
// TanStack router on hash history: the address bar, a page reload and the browser's
// Back/Forward are genuine. Store, auth and server functions are synthetic (store.js,
// auth.js, fixture.js); the network guard in index.html refuses every request.
//
//   index.html?locale=en|pl|sv|da&variant=ready|sole|backbare|unhydrated|stale|empty[&check=1]
//
// The fixture moves these parameters into sessionStorage and removes them from the page
// URL before the router starts: TanStack's hash history parses `hash + location.search`,
// so a page query would otherwise leak into every route location after Back/Forward.
// Without check=1 the page stays interactive for manual review. With check=1 a scripted
// journey clicks the real controls, reloads the page once (ready/backbare/stale/
// unhydrated) and writes a JSON report to #results and window.__taskFixtureReport.
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
import { Route as plan } from "@/routes/_authenticated/app.plan";
import { Route as editor } from "@/routes/_authenticated/app.editor";
import { seedContent, seedOpportunities, seedProjects } from "@/lib/mock-data";
import { translate } from "@/i18n";
import { fixture, record } from "./fixture.js";

const PARAMS_KEY = "taskContinuityFixtureParams";
// A fresh open carries its parameters in the page query; a reload does not.
const freshOpen = !!location.search;
const VARIANTS = ["ready", "sole", "backbare", "unhydrated", "stale", "empty"];
const params = (() => {
  const fromUrl = new URLSearchParams(location.search);
  let stored = null;
  try {
    stored = JSON.parse(sessionStorage.getItem(PARAMS_KEY) || "null");
  } catch {
    stored = null;
  }
  const chosen = location.search ? Object.fromEntries(fromUrl) : (stored ?? {});
  try {
    sessionStorage.setItem(PARAMS_KEY, JSON.stringify(chosen));
  } catch {
    // Without storage a reload falls back to the defaults.
  }
  if (location.search) history.replaceState(history.state, "", location.pathname + location.hash);
  return chosen;
})();
const locale = ["en", "pl", "sv", "da"].includes(params.locale) ? params.locale : "en";
const variant = VARIANTS.includes(params.variant) ? params.variant : "ready";
const check = params.check === "1";
// Synthetic deletions survive a reload of this tab, as a saved deletion would, so the re-seeded
// memory does not resurrect a deleted draft. A fresh open starts from the full seed again.
const DELETED_KEY = `taskContinuityFixtureDeleted:${variant}`;
const deletedIds = (() => {
  try {
    if (freshOpen) sessionStorage.removeItem(DELETED_KEY);
    return new Set(JSON.parse(sessionStorage.getItem(DELETED_KEY) || "[]"));
  } catch {
    return new Set();
  }
})();
const t = (key, vars) => translate(locale, key, vars);
try {
  localStorage.removeItem("milo.uiLocale");
} catch {
  // Storage may be unavailable; the project language then decides.
}

// ---- synthetic workspace ----------------------------------------------------------
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const OTHER_ACTOR = "00000000-0000-4000-8000-0000000000a2";
const ROW = "00000000-0000-4000-8000-0000000000f1";
const P = "p-nordlys";
const Q = "q-second-client";
const T = {
  a: { id: "task-a", title: "Winter boiler checklist (pinned task)" },
  b: { id: "task-b", title: "Heat pump FAQ (neighbouring task)" },
  archived: { id: "task-archived", title: "Old radiator guide (archived task)" },
  deleted: { id: "task-deleted", title: "Removed duct task (deleted)" },
  q: { id: "task-q", title: "Second client task (other project)" },
};
const A = {
  a1: { id: "asset-a1", title: "Winter boiler checklist — draft", task: T.a },
  b1: { id: "asset-b1", title: "Heat pump FAQ — draft", task: T.b },
  orphan: {
    id: "asset-orphan",
    title: "Draft whose task no longer exists",
    task: { id: "task-missing", title: "Missing task" },
  },
  deletedSource: { id: "asset-deleted-source", title: "Draft of a deleted task", task: T.deleted },
  foreignSource: { id: "asset-foreign-source", title: "Draft citing another project", task: T.q },
  archivedSource: {
    id: "asset-archived-source",
    title: "Draft of an archived task",
    task: T.archived,
  },
  // Appear later, as if created by background work while the editor stays mounted.
  c1: { id: "asset-c1", title: "New draft created after the deletion", task: T.a },
  d1: { id: "asset-d1", title: "Second new draft after the deletion", task: T.b },
};
const pin = [
  { sourceType: "citation_finding", sourceRecordId: ROW, capturedAt: "2026-10-20T09:00:00Z" },
];
const project = (id, name) => {
  const base = { ...seedProjects[0], id, name, businessName: name, appLanguage: locale };
  delete base.websiteUrl;
  return base;
};
const task = (projectId, { id, title }, over = {}) => ({
  ...seedOpportunities[0],
  id,
  projectId,
  title,
  status: "prioritized",
  createdAt: "2026-10-20T09:00:00Z",
  updatedAt: "2026-10-20T09:00:00Z",
  ...over,
});
const asset = (projectId, { id, title, task: source }, over = {}) => ({
  ...seedContent[0],
  id,
  projectId,
  title,
  opportunityId: source.id,
  sourceOpportunityId: source.id,
  sourceOpportunityTitle: source.title,
  status: "Draft",
  scheduledPublishAt: undefined,
  scheduledPublishStatus: undefined,
  livePublishStatus: undefined,
  liveUrl: undefined,
  updatedAt: "2026-10-28T09:00:00Z",
  ...over,
});
function seedContentFor() {
  if (variant === "empty") return [];
  if (variant === "sole") return [asset(P, A.a1)];
  if (variant === "backbare") return [asset(P, A.a1), asset(P, A.b1)];
  return [
    asset(P, A.a1),
    asset(P, A.b1),
    asset(P, A.orphan),
    asset(P, A.deletedSource),
    asset(P, A.foreignSource),
    asset(P, A.archivedSource),
  ];
}
fixture.actorId = ACTOR;
fixture.state = {
  projects: [project(P, "Nordlys Heating — Oslo"), project(Q, "Second client")],
  services: [],
  opportunities: [
    task(P, T.a, { sourceRefs: pin }),
    task(P, T.b),
    task(P, T.archived, {
      status: "archived",
      archivedAt: "2026-10-25T09:00:00Z",
      sourceRefs: pin,
    }),
    task(P, T.deleted, { deletedAt: "2026-10-26T09:00:00Z", sourceRefs: pin }),
    task(Q, T.q),
  ],
  discoverySuggestions: [],
  calendar: [],
  content: seedContentFor().filter((c) => !deletedIds.has(c.id)),
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
  activeProjectId: P,
  hydrated: variant !== "unhydrated",
  hydrationFailed: false,
  userId: variant === "unhydrated" ? null : variant === "stale" ? OTHER_ACTOR : ACTOR,
  rev: 1,
};
fixture.onDelete = (id) => {
  deletedIds.add(id);
  try {
    sessionStorage.setItem(DELETED_KEY, JSON.stringify([...deletedIds]));
  } catch {
    // Without storage a reload re-seeds the deleted draft; the check then fails visibly.
  }
};
// Background creation stand-in (e.g. a draft generated elsewhere and loaded by a reload).
fixture.addAsset = (a) => {
  record("fixture.addAsset", { id: a.id });
  fixture.state = { ...fixture.state, content: [...fixture.state.content, asset(P, a)] };
  fixture.emit();
};
fixture.reads = {
  findings: {
    findings: [
      {
        id: ROW,
        findingId: "00000000-0000-4000-8000-0000000000d1",
        version: 1,
        family: "citation_source",
        decision: "accepted",
        panelId: "00000000-0000-4000-8000-0000000000c1",
        panelVersion: 1,
        client: { name: "Nordlys Heating", market: "NO" },
        actorId: ACTOR,
        reviewerId: ACTOR,
        supersedesId: null,
        predecessorDeleted: false,
        createdAt: "2026-10-20T08:00:00Z",
        sourceAvailable: true,
        accuracyStatus: "none",
        reviewStatus: "owner_only",
        scopeEnforcedAt: null,
      },
    ],
  },
};

// ---- real routes under a real router ----------------------------------------------
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const authenticated = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: () => <Outlet />,
});
for (const [route, routePath] of [
  [citationReview, "/app/citation-review"],
  [plan, "/app/plan"],
  [editor, "/app/editor"],
])
  route.update({ id: routePath, path: routePath, getParentRoute: () => authenticated });
const destination = (label) => () => (
  <p data-fixture-destination={label} className="p-6 text-sm">
    {label} (fixture destination outside CG-02A)
  </p>
);
const extra = ["/app", "/app/setup", "/app/analytics", "/app/today", "/app/settings"].map((p) =>
  createRoute({ getParentRoute: () => authenticated, path: p, component: destination(p) }),
);
if (!location.hash || location.hash === "#" || location.hash === "#/")
  history.replaceState(
    null,
    "",
    "#" +
      (variant === "sole" || variant === "backbare" || variant === "empty"
        ? "/app/editor"
        : "/app/citation-review"),
  );
const router = createRouter({
  routeTree: rootRoute.addChildren([
    authenticated.addChildren([citationReview, plan, editor, ...extra]),
  ]),
  history: createHashHistory(),
});
window.__taskFixtureRouter = router;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
if (check) void runCheck();

// ---- scripted check ---------------------------------------------------------------
async function runCheck() {
  const KEY = `taskContinuityCheck:${locale}:${variant}`;
  const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
  const pageLabel = saved ? "afterReload" : "beforeReload";
  const report = saved ?? {
    fixture: "task-continuity",
    locale,
    variant,
    viewport: { width: innerWidth, height: innerHeight },
    completed: false,
    results: [],
    overflow: [],
  };
  // The only writes this fixture may see: one explicit Delete confirmation per expected asset, in this
  // order, each writing exactly the deletion of that asset and then the workspace save. Anything else,
  // including any write while navigating before or after a confirmation, fails the audit.
  const EXPECTED_DELETIONS = {
    sole: ["asset-a1", "asset-c1"],
    backbare: ["asset-a1"],
  };
  const out = document.getElementById("results");
  const writes = (page) =>
    fixture.events
      .filter((e) => e.type.startsWith("store.") && e.type !== "store.reloadWorkspaceForUser")
      .map(({ seq, type, payload, step, phase }) => ({ page, seq, type, payload, step, phase }));
  const publish = () => {
    report.networkAttempts = window.__miloNetworkAttempts;
    report.invoked = fixture.invoked;
    report.storeWrites = [...(report.beforeReload?.storeWrites ?? []), ...writes(pageLabel)];
    window.__taskFixtureReport = report;
    out.textContent = JSON.stringify(report, null, 2);
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
  const loc = () => router.state.location;
  const editorTitle = () => document.querySelector(".milo-editor-layout h2")?.textContent?.trim();
  const sidebarCurrent = () =>
    document.querySelector('.milo-editor-layout aside button[aria-current="true"]')?.textContent;
  async function waitFor(fn, what, ms = 5000) {
    const until = Date.now() + ms;
    for (;;) {
      let value;
      try {
        value = fn();
      } catch {
        value = undefined;
      }
      if (value) return value;
      if (Date.now() > until)
        throw Error(
          `Timed out waiting for ${what} (at ${loc().href}, editor "${editorTitle() ?? ""}", current "${sidebarCurrent() ?? ""}")`,
        );
      await tick();
    }
  }
  const step = async (name, fn) => {
    fixture.step = name;
    try {
      const detail = await fn();
      report.results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    } catch (error) {
      report.results.push({ name, ok: false, error: String(error?.message ?? error) });
    }
    noteOverflow(name);
    fixture.step = undefined;
    publish();
  };
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const at = (pathname, key, value) =>
    loc().pathname === pathname && (key ? loc().search?.[key] === value : !loc().search?.id);
  const inspectors = () => [...document.querySelectorAll("aside.milo-inspector")];
  const inspectorFor = (title) => inspectors().find((a) => a.getAttribute("aria-label") === title);
  const notice = () => document.querySelector("[data-plan-selection-notice]");
  const taskReturn = () => document.querySelector("[data-task-return]");
  const buttonByText = (scope, text) =>
    [...scope.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  function noteOverflow(name) {
    const width = document.documentElement.scrollWidth;
    if (width > innerWidth + 1)
      report.overflow.push({ step: name, scrollWidth: width, innerWidth });
  }
  const go = (to, search) => router.navigate({ to, search });
  const openEditor = (id) => go("/app/editor", { id });
  async function editorShows(a, bare = false) {
    await waitFor(
      () => (bare ? at("/app/editor") : at("/app/editor", "id", a.id)) && editorTitle() === a.title,
      `editor ${a.id}${bare ? " at the bare URL" : ""}`,
    );
    assert(sidebarCurrent()?.includes(a.title), "sidebar marks " + a.id + " as current");
  }
  async function editorEmptyAtBareUrl() {
    await waitFor(() => at("/app/editor") && !editorTitle(), "empty editor at the bare URL");
  }
  async function planSelects(tk) {
    await waitFor(
      () => at("/app/plan", "selected", tk.id) && inspectorFor(tk.title),
      `Plan ${tk.id}`,
    );
    assert(inspectors().length === 1, "exactly one inspector");
    assert(!notice(), "no notice when the task is shown");
  }
  async function planExplains(kind, id) {
    await waitFor(() => at("/app/plan", "selected", id) && notice(), `Plan notice for ${id}`);
    assert(notice().dataset.planSelectionNotice === kind, `notice ${kind} for ${id}`);
    assert(inspectors().length === 0, "no other task was selected");
  }
  const pinItem = (title) =>
    [...document.querySelectorAll("li")].find((li) =>
      [...li.querySelectorAll("span")].some((s) => s.textContent === title),
    );
  const sidebarButton = (a) =>
    [...document.querySelectorAll(".milo-editor-layout aside button")].find((b) =>
      b.textContent.includes(a.title),
    );
  // The real Delete control and the real confirmation dialog. Writes are allowed only inside the phase
  // that starts with the confirming click and ends once that confirmation's save has been recorded.
  async function deleteOpenAsset(expectedId) {
    buttonByText(document.querySelector(".milo-editor-layout"), t("editor.action.delete")).click();
    const dialog = await waitFor(
      () => document.querySelector('[role="alertdialog"]'),
      "delete confirmation",
    );
    const phase = `confirm:${expectedId}`;
    fixture.phase = phase;
    try {
      buttonByText(dialog, t("editor.action.delete")).click();
      await waitFor(
        () =>
          !document.querySelector('[role="alertdialog"]') &&
          fixture.events.some((e) => e.phase === phase && e.type === "store.saveWorkspaceNow"),
        `confirmed deletion of ${expectedId} and its save`,
      );
    } finally {
      fixture.phase = undefined;
    }
  }

  if (!saved) {
    if (variant === "ready") {
      await step("finding pin opens Plan with that exact task", async () => {
        await go("/app/citation-review");
        const item = await waitFor(() => pinItem(T.a.title), "pinned task list");
        const deleted = await waitFor(() => pinItem(T.deleted.title), "deleted pin");
        assert(
          buttonByText(deleted, t("citationForward.studio.plan"))?.disabled,
          "a deleted pin's Plan control is disabled",
        );
        buttonByText(item, t("citationForward.studio.plan")).click();
        await planSelects(T.a);
        return { url: loc().href };
      });
      await step("Plan inspector opens the exact linked draft", async () => {
        buttonByText(inspectorFor(T.a.title), t("today.review")).click();
        await editorShows(A.a1);
      });
      await step("Back to task returns to the same Plan task", async () => {
        const link = await waitFor(
          () => document.querySelector('a[data-task-return="link"]'),
          "Back to task link",
        );
        assert(link.textContent === t("taskContinuity.backToTask"), "link label");
        assert(link.tabIndex >= 0 && link.getAttribute("href"), "keyboard-focusable link");
        const box = link.getBoundingClientRect();
        if (innerWidth < 640) assert(box.height >= 44, `phone target ${box.height}px`);
        link.click();
        await planSelects(T.a);
        return { href: link.getAttribute("href"), height: Math.round(box.height) };
      });
      await step("Back/Forward keep task and draft identity", async () => {
        history.back();
        await editorShows(A.a1);
        history.back();
        await planSelects(T.a);
        history.forward();
        await editorShows(A.a1);
      });
      await step("explicit draft A→B updates the URL and history", async () => {
        sidebarButton(A.b1).click();
        await editorShows(A.b1);
        history.back();
        await editorShows(A.a1);
        history.forward();
        await editorShows(A.b1);
      });
      await step("Back to task from B names B's task, not A's", async () => {
        const link = await waitFor(
          () => document.querySelector('a[data-task-return="link"]'),
          "Back to task link on B",
        );
        link.click();
        await planSelects(T.b);
        history.back();
        await editorShows(A.b1);
      });
      await step("unsaved changes hold the new Back to task link until saved", async () => {
        const input = await waitFor(
          () => [...document.querySelectorAll("input")].find((i) => i.value === A.b1.title),
          "title field",
        );
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(input, A.b1.title + " (edited)");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await waitFor(() => taskReturn()?.dataset.taskReturn === "unsaved", "unsaved state");
        assert(!document.querySelector('a[data-task-return="link"]'), "no active link while dirty");
        assert(
          taskReturn().textContent.includes(t("taskContinuity.saveFirst")),
          "explains to save first",
        );
        set.call(input, A.b1.title);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await waitFor(() => taskReturn()?.dataset.taskReturn === "link", "link after reverting");
      });
      await step("missing, deleted and other-project sources get no link", async () => {
        for (const a of [A.orphan, A.deletedSource, A.foreignSource]) {
          await openEditor(a.id);
          await editorShows(a);
          await tick();
          assert(!taskReturn(), "no task link for " + a.id);
        }
      });
      await step("archived source opens Plan's explicit archived notice", async () => {
        await openEditor(A.archivedSource.id);
        await editorShows(A.archivedSource);
        const link = await waitFor(
          () => document.querySelector('a[data-task-return="link"]'),
          "archived source link",
        );
        link.click();
        await planExplains("archived", T.archived.id);
        buttonByText(notice(), t("taskContinuity.showArchived")).click();
        await waitFor(() => inspectorFor(T.archived.title), "archived task in Archived view");
        assert(!notice(), "notice cleared once the archived task is shown");
        assert(inspectors().length === 1, "only the archived task is selected");
      });
      await step(
        "deleted, other-project and unknown tasks are explained, never replaced",
        async () => {
          for (const id of [T.deleted.id, T.q.id, "task-missing"]) {
            await go("/app/plan", { selected: id });
            await planExplains("unavailable", id);
          }
        },
      );
      await step("archived finding pin opens the archived notice", async () => {
        await go("/app/citation-review");
        const item = await waitFor(() => pinItem(T.archived.title), "archived pin");
        buttonByText(item, t("citationForward.studio.plan")).click();
        await planExplains("archived", T.archived.id);
      });
    } else if (variant === "sole") {
      await step("sole deletion from a bare URL, then a new asset is shown", async () => {
        await waitFor(() => at("/app/editor"), "bare editor URL");
        await editorShows(A.a1, true);
        await deleteOpenAsset(A.a1.id);
        await editorEmptyAtBareUrl();
        fixture.addAsset(A.c1);
        await editorShows(A.c1, true);
      });
      await step("sole deletion from an explicit URL, then a new asset is shown", async () => {
        await openEditor(A.c1.id);
        await editorShows(A.c1);
        await deleteOpenAsset(A.c1.id);
        await editorEmptyAtBareUrl();
        fixture.addAsset(A.d1);
        await editorShows(A.d1, true);
      });
      await step("a deleted explicit id in history still fails closed", async () => {
        // Back reaches no entry naming the deleted ids (each was replaced), so walk to the bare entry.
        await openEditor(A.c1.id);
        await waitFor(
          () =>
            document
              .querySelector('.milo-editor-layout [role="status"]')
              ?.textContent.includes(t("editorScreen.requestedMissing")),
          "requested deleted asset reported missing",
        );
        assert(!editorTitle(), "no other draft substituted for the deleted id");
      });
    } else if (variant === "backbare") {
      await step("Back to a bare URL after the former fallback was deleted", async () => {
        await waitFor(() => at("/app/editor"), "bare editor URL");
        await editorShows(A.a1, true);
        sidebarButton(A.b1).click();
        await editorShows(A.b1);
        sidebarButton(A.a1).click();
        await editorShows(A.a1);
        await deleteOpenAsset(A.a1.id);
        await editorShows(A.b1);
        history.back();
        await editorShows(A.b1);
        history.back();
        await editorShows(A.b1, true);
        assert(!sidebarButton(A.a1), "the deleted fallback is gone from the list");
      });
    } else if (variant === "empty") {
      await step("empty: a requested draft fails closed, Plan still selects the task", async () => {
        await openEditor(A.a1.id);
        await waitFor(
          () =>
            document
              .querySelector('.milo-editor-layout [role="status"]')
              ?.textContent.includes(t("editorScreen.requestedMissing")),
          "requested asset reported missing",
        );
        assert(!editorTitle(), "no other draft substituted");
        await go("/app/plan", { selected: T.a.id });
        await planSelects(T.a);
      });
    } else {
      await step(
        `${variant}: no task link and no Plan notice before identity is proven`,
        async () => {
          await openEditor(A.a1.id);
          await editorShows(A.a1);
          await tick();
          assert(!taskReturn(), "no task link for an unverified workspace");
          await go("/app/plan", { selected: T.deleted.id });
          await waitFor(() => at("/app/plan", "selected", T.deleted.id), "Plan");
          await tick();
          assert(!notice(), "no notice for an unverified workspace");
          assert(inspectors().length === 0, "nothing selected");
        },
      );
    }
    if (variant !== "empty" && variant !== "sole") {
      // What Back must show after the reload: the exact location the scripted steps ended on (captured
      // now, before pushing the reload draft) and the exact visible state that location names.
      const EXPECT_BACK = {
        ready: { kind: "planNotice", selected: T.archived.id, notice: "archived" },
        // The deleted former fallback stays deleted across the reload; the bare URL shows the survivor.
        backbare: { kind: "editorBare", asset: A.b1.id, absent: A.a1.id },
        unhydrated: { kind: "planQuiet", selected: T.deleted.id },
        stale: { kind: "planQuiet", selected: T.deleted.id },
      };
      report.expectBack = { href: loc().href, ...EXPECT_BACK[variant] };
      // Leave on a known draft and reload the real page (fixture memory is re-seeded).
      await openEditor(A.b1.id);
      await waitFor(() => at("/app/editor", "id", A.b1.id), "editor before reload");
      report.reloadFrom = location.hash;
      report.beforeReload = {
        networkAttempts: window.__miloNetworkAttempts,
        invoked: fixture.invoked,
        storeWrites: writes("beforeReload"),
      };
      sessionStorage.setItem(KEY, JSON.stringify(report));
      location.reload();
      return;
    }
  } else {
    sessionStorage.removeItem(KEY);
    await step("reload keeps the draft named by the URL", async () => {
      assert(location.hash === report.reloadFrom, "same URL after reload");
      await editorShows(A.b1);
    });
    await step("Back after reload returns to the exact earlier location and state", async () => {
      const expected = report.expectBack;
      assert(expected?.kind, "an expectation was recorded before the reload");
      history.back();
      await waitFor(() => loc().href === expected.href, `exact location ${expected.href}`);
      const byId = (list, id) => Object.values(list).find((x) => x.id === id);
      switch (expected.kind) {
        case "planNotice":
          await planExplains(expected.notice, expected.selected);
          break;
        case "planQuiet":
          await waitFor(() => at("/app/plan", "selected", expected.selected), "Plan");
          await tick();
          await tick();
          assert(!notice(), "no notice for an unverified workspace");
          assert(inspectors().length === 0, "nothing selected");
          break;
        case "editorBare": {
          await editorShows(byId(A, expected.asset), true);
          assert(!sidebarButton(byId(A, expected.absent)), `${expected.absent} stays deleted`);
          break;
        }
        default:
          throw Error(`Unhandled Back expectation ${expected.kind}`);
      }
      return { href: loc().href, kind: expected.kind };
    });
  }
  report.completed = true;
  const all = [...(report.beforeReload?.storeWrites ?? []), ...writes(pageLabel)];
  const calls = [...(report.beforeReload?.invoked ?? []), ...fixture.invoked];
  const expectedDeletions = EXPECTED_DELETIONS[variant] ?? [];
  const phases = [...new Set(all.filter((w) => w.phase).map((w) => w.phase))];
  const confirmations = phases.map((phase) => ({
    phase,
    writes: all.filter((w) => w.phase === phase).map((w) => ({ type: w.type, id: w.payload?.id })),
  }));
  report.deletionAudit = {
    synthetic: "In-memory fixture writes only; not production database or policy evidence.",
    expected: expectedDeletions,
    confirmations,
    outsideConfirmation: all.filter((w) => !w.phase),
    ok:
      all.every((w) => w.phase) &&
      confirmations.length === expectedDeletions.length &&
      confirmations.every(
        (c, i) =>
          c.phase === `confirm:${expectedDeletions[i]}` &&
          c.writes.length === 2 &&
          c.writes[0].type === "store.deleteContentAsset" &&
          c.writes[0].id === expectedDeletions[i] &&
          c.writes[1].type === "store.saveWorkspaceNow",
      ),
  };
  report.noNetwork =
    window.__miloNetworkAttempts.length === 0 &&
    (report.beforeReload?.networkAttempts ?? []).length === 0;
  // Server calls are reads only; store writes are exactly the audited confirmations.
  report.noUnexpectedWrites = calls.every((call) => call.read) && report.deletionAudit.ok;
  report.passed =
    report.results.every((r) => r.ok) &&
    report.overflow.length === 0 &&
    report.noNetwork &&
    report.noUnexpectedWrites;
  publish();
}
