// CG-01A first-use fixture. Renders the ACTUAL home route, AppShell, project picker and
// conversation workspace through a real TanStack memory router, with the central UI
// catalogs and the real stylesheet. Auth, workspace store, membership directory and
// conversation server functions are synthetic in-page boundary mocks (full-mock.js);
// network-guard.js, inlined in index.html before this bundle, refuses every programmatic
// request. Nothing is sent anywhere.
//
//   ?locale=en|pl|sv|da   ?variant=empty|draft|viewer|editor   ?check=1 (scripted report)
//
// Without check=1 the page stays pristine and interactive for manual review. A Send
// there reaches only the synthetic mock, which answers with the typed busy rollback.
import React from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route as home } from "./src/routes/_authenticated/app.index";
import { firstUseTitle } from "./src/lib/milo-first-use";
import { t, locale } from "@/i18n";

const VARIANTS = ["empty", "draft", "viewer", "editor"];
const params = new URLSearchParams(location.search);
const variant = VARIANTS.includes(params.get("variant")) ? params.get("variant") : "empty";
const check = params.get("check") === "1";
const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const ownedName = "Nordlys Heating — Oslo",
  secondName = "Second owned client",
  sharedName = "Agency client — shared workspace";
// Longer than the 60-character limit, so the bounded form is visible.
const draftTitle =
  "Winter boiler service guide: what homeowners should check before the first frost";
// Bait: owned data that must never appear outside its own exact project scope.
const otherProjectDraft = "Q-PROJECT DRAFT ONLY";
const asset = (projectId, title, status = "Draft", updatedAt = "2026-10-20T09:00:00Z") => ({
  id: `${projectId}-${title.length}-${status}`,
  projectId,
  title,
  status,
  updatedAt,
});
const owner = variant === "empty" || variant === "draft";
sessionStorage.removeItem(`milo-conversation-location:${actor}`);
window.full = {
  actor,
  other,
  sharedName,
  sharedRole: variant === "viewer" ? "viewer" : "editor",
  denied: false,
  store: {
    userId: actor,
    hydrated: true,
    projects: [
      { id: "p", name: ownedName, appLanguage: locale },
      { id: "q", name: secondName, appLanguage: locale },
    ],
    activeProjectId: "p",
    pendingActions: [],
    content: [
      // The shared variants keep the owned draft in memory to prove it stays private.
      ...(variant === "empty" ? [] : [asset("p", draftTitle)]),
      asset("p", "Published spring guide", "Exported", "2026-10-29T09:00:00Z"),
      asset("q", otherProjectDraft, "Draft", "2026-10-29T10:00:00Z"),
    ],
  },
};
const report = {
  mode: "firstuse",
  locale,
  variant,
  completed: false,
  results: [],
  sends: [],
  reads: 0,
  lists: 0,
  metrics: {},
  networkAttempts: window.__miloNetworkAttempts,
};
window.h = {
  list: async (input) => {
    report.lists++;
    return {
      actorId: actor,
      ownerId: input.ownerId,
      projectId: input.projectId,
      conversations: [],
    };
  },
  read: async () => {
    report.reads++;
    throw Error("A new conversation is never read before a confirmed send.");
  },
  send: async (input) => {
    report.sends.push(JSON.parse(JSON.stringify(input)));
    return { notSaved: "busy" }; // typed busy rollback: nothing saved, text kept
  },
  resume: async () => {
    throw Error("No execution in the first-use fixture.");
  },
  cancel: async () => {
    throw Error("No execution in the first-use fixture.");
  },
};
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const authenticated = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: () => <Outlet />,
});
home.update({ id: "/app/", path: "/app/", getParentRoute: () => authenticated });
const destination = (label) => () => <p>{label} (fixture destination)</p>;
const extra = ["today", "collaborators", "conversations", "setup"].map((name) =>
  createRoute({
    getParentRoute: () => authenticated,
    path: `/app/${name}`,
    component: destination(name),
  }),
);
const router = createRouter({
  routeTree: rootRoute.addChildren([authenticated.addChildren([home, ...extra])]),
  history: createMemoryHistory({
    initialEntries: [owner ? "/app" : `/app?owner=${other}&project=p`],
  }),
});
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const body = () => document.body.textContent;
const assert = (value, message) => {
  if (!value) throw Error(message);
};
async function until(check, message) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await tick();
  }
  throw Error(`Timed out: ${message}`);
}
const composer = () => document.querySelector("form textarea");
const boxes = () => [...document.querySelectorAll('form input[type="checkbox"]')];
const chips = () => [...document.querySelectorAll("[data-first-use-suggestion]")];
const visible = (node) => !!node && node.getClientRects().length > 0;
function setText(value) {
  const textarea = composer();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
async function choose(ownerId, projectId, name) {
  const picker = document.querySelector("main select");
  picker.value = JSON.stringify([ownerId, projectId]);
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  await until(
    () => composer()?.labels[0]?.textContent.includes(name) && chips().length > 0,
    `switched to ${name}`,
  );
}
const expectedChips = (isOwner, withDraft) =>
  isOwner
    ? withDraft
      ? ["draftReview", "businessGaps"]
      : ["businessGaps", "goal"]
    : ["sharedOverview", "goal"];
const expectedBoxes = (role) => ({ owner: 2, editor: 1, viewer: 0 })[role];
const shownTitle = firstUseTitle(draftTitle);

function measure() {
  const send = document.querySelector('form button[type="submit"]').getBoundingClientRect();
  const form = document.querySelector("form").getBoundingClientRect();
  return {
    viewport: [window.innerWidth, window.innerHeight],
    sendBottom: Math.round(send.bottom),
    composerTop: Math.round(form.top),
    composerBottom: Math.round(form.bottom),
    composerAndSendVisibleWithoutScroll: form.top >= 0 && form.bottom <= window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    headingFont: getComputedStyle(document.querySelector("h1")).fontFamily,
    bodyFont: getComputedStyle(document.body).fontFamily,
    // Loaded faces only; FontFaceSet.check() is also true when no face matches at all.
    loadedFonts: [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => `${face.family.replace(/"/g, "")} ${face.weight}`),
  };
}

async function presentation(role, withDraft) {
  const ids = chips().map((chip) => chip.dataset.firstUseSuggestion);
  assert(
    JSON.stringify(ids) === JSON.stringify(expectedChips(role === "owner", withDraft)),
    `suggestions for ${role}: ${ids}`,
  );
  if (withDraft) {
    assert(Array.from(shownTitle).length === 60 && shownTitle.endsWith("…"), "bounded title");
    assert(chips()[0].textContent.includes(shownTitle), "draft named in its own scope");
    assert(!body().includes(draftTitle), "full long title never shown");
  }
  assert(boxes().length === expectedBoxes(role), `${role} consent controls: ${boxes().length}`);
  assert(
    boxes().every((box) => !box.checked),
    "every permission starts unchecked",
  );
  for (const option of document.querySelectorAll("[data-consent]")) {
    const kind = option.dataset.consent;
    const input = option.querySelector("input");
    const summary = document.getElementById(input.getAttribute("aria-describedby"));
    assert(input.labels[0].textContent === t(`conversationStart.consent.${kind}Label`), "label");
    assert(
      visible(summary) && summary.textContent === t(`conversationStart.consent.${kind}Summary`),
      `${kind} consequence visible and describes the checkbox`,
    );
    const details = option.querySelector("details");
    assert(!details.open, "full wording collapsed by default");
    assert(
      details.textContent.includes(
        t(kind === "generation" ? "chat.allowGeneration" : "chat.allowProviderChecks"),
      ),
      "full reviewed wording kept behind details",
    );
  }
  assert(
    visible(
      [...document.querySelectorAll("form p")].find((p) => p.textContent === t("chat.usage")),
    ),
    "usage and publication note visible",
  );
  assert(
    document.querySelector("[data-milo-private-indicator]").textContent ===
      t(role === "owner" ? "chat.private" : "chat.sharedPrivate"),
    "private conversation indicator",
  );
  const manage = document.querySelector("main details.milo-start-manage");
  assert(manage && !manage.open, "administration is secondary and collapsed");
  assert(manage.querySelector('a[href*="/app/collaborators"]'), "collaborators destination kept");
  assert(manage.querySelector('a[href="/app/conversations"]'), "conversation management kept");
}

async function suggestionsOnlyPopulate() {
  const before = report.sends.length;
  for (const chip of chips()) {
    chip.click();
    await until(() => composer().value === chip.textContent, "suggestion fills the message");
    assert(document.activeElement === composer(), "focus moves to the composer");
    assert(
      boxes().every((box) => !box.checked),
      "a suggestion never consents",
    );
    await tick();
    assert(report.sends.length === before, "a suggestion never sends");
  }
}

function noLeak(role) {
  assert(!body().includes(otherProjectDraft), "another project's draft never appears");
  if (role !== "owner") {
    assert(
      !body().includes(shownTitle) && !body().includes(draftTitle),
      "no owned draft in shared scope",
    );
    assert(
      !composer().labels[0].textContent.includes(ownedName),
      "composer names the shared client",
    );
  }
}

async function scopeSwitchResets(role) {
  for (const box of boxes()) box.click();
  setText("Unsent text for this scope only");
  await until(() => boxes().every((box) => box.checked), "boxes checked");
  const [away, back] =
    role === "owner"
      ? [
          [other, "p", sharedName, "editor"],
          [actor, "p", ownedName, "owner"],
        ]
      : [
          [actor, "p", ownedName, "owner"],
          [other, "p", sharedName, role],
        ];
  await choose(away[0], away[1], away[2]);
  assert(boxes().length === expectedBoxes(away[3]), "role-specific controls after switch");
  assert(
    boxes().every((box) => !box.checked),
    "permissions reset on scope switch",
  );
  assert(composer().value === "", "unsent text does not follow into another scope");
  if (away[3] !== "owner")
    assert(
      !body().includes(shownTitle),
      "identical project ID in another owner shows no owned draft",
    );
  else assert(chips()[0].textContent.includes(shownTitle), "own draft appears in its own scope");
  await choose(back[0], back[1], back[2]);
  assert(
    boxes().every((box) => !box.checked),
    "permissions reset again on return",
  );
  assert(composer().value === "", "composer empty on return");
}

async function exactSendFlags(role) {
  chips()[0].click();
  await until(() => composer().value === chips()[0].textContent, "suggestion text");
  document.querySelector('form button[type="submit"]').click();
  await until(() => report.sends.length === 1, "first synthetic send");
  await until(() => body().includes(t("chat.notSavedBusy")), "busy rollback shown, text kept");
  const first = report.sends[0];
  assert(first.allowProviderChecks === false, "site checks false unless explicitly checked");
  if (role === "owner") assert(first.allowDraftGeneration === false, "generation false by default");
  else assert(!("allowDraftGeneration" in first), "collaborators never send a generation flag");
  if (role === "viewer") return;
  for (const box of boxes()) box.click();
  setText("Explicitly permitted request");
  await until(() => boxes().every((box) => box.checked), "explicit consent");
  document.querySelector('form button[type="submit"]').click();
  await until(() => report.sends.length === 2, "second synthetic send");
  const second = report.sends[1];
  assert(second.turnId !== first.turnId, "a new message is a new request");
  assert(second.allowProviderChecks === true, "explicit site-check consent sent");
  if (role === "owner") assert(second.allowDraftGeneration === true, "explicit generation consent");
  else assert(!("allowDraftGeneration" in second), "still no generation flag");
}

async function run() {
  await until(
    () => document.querySelector("[data-milo-first-use]") && composer(),
    "first-use start",
  );
  await document.fonts.ready;
  report.metrics = measure();
  const role = owner ? "owner" : variant;
  const steps = [
    [
      "presentation, bounded consent summaries and secondary administration",
      () => presentation(role, variant === "draft"),
    ],
    ["suggestions only populate the composer", suggestionsOnlyPopulate],
    ["no private or cross-scope draft leakage", () => noLeak(role)],
    ["scope switch resets permissions and unsent text", () => scopeSwitchResets(role)],
    ["exact send flags: default false, explicit consent only", () => exactSendFlags(role)],
  ];
  for (const [name, step] of steps) {
    await step();
    report.results.push({ name, passed: true });
  }
  assert(report.reads === 0, "no history read for an unsent new conversation");
  assert(window.__miloNetworkAttempts.length === 0, "no network request attempted");
  assert(!report.metrics.horizontalOverflow, "no horizontal overflow");
  report.completed = true;
}

const show = () =>
  (document.getElementById("results").textContent = JSON.stringify(report, null, 2));
window.__miloFirstUseReport = () => (show(), report);
if (check)
  run()
    .catch((error) => {
      report.error = error.message;
    })
    .finally(show);
else
  until(() => document.querySelector("[data-milo-first-use]"), "first-use start")
    .then(() => document.fonts.ready)
    .then(() => {
      report.metrics = measure();
      report.note =
        "Interactive review page. Add ?check=1 for the scripted report; call window.__miloFirstUseReport() for current sends and network attempts.";
    })
    .catch((error) => {
      report.error = error.message;
    })
    .finally(show);
