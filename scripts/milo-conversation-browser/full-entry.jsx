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
import { t, locale } from "@/i18n";
const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  conversationId = "00000000-0000-4000-8000-000000000003";
const ownedName = "Acme — owner workspace",
  sharedName = "Agency client — shared workspace";
const project = { id: "p", name: ownedName, appLanguage: locale };
const secondProject = { id: "q", name: "Second owned client", appLanguage: locale };
window.full = {
  actor,
  other,
  sharedName,
  denied: false,
  store: { projects: [project, secondProject], activeProjectId: "p", pendingActions: [] },
};
const results = [],
  calls = [],
  date = "2026-09-13T12:00:00Z";
const task = (owner) =>
  owner === actor
    ? "OWN CONTEXT ONLY: improve our article."
    : "SHARED CONTEXT ONLY: review the client's draft.";
const turn = (owner) => ({
  turnId: conversationId,
  ordinal: 1,
  body: task(owner),
  locale,
  state: "completed",
  events: [
    {
      kind: "handoff",
      role: "lead",
      text: "The SEO specialist is taking over in this conversation.",
    },
    {
      kind: "tool",
      role: "seo",
      tool: "draft_seo_review",
      state: "completed",
      text: "{}",
      reference: { kind: "draft", id: "a" },
    },
    {
      kind: "assistant",
      role: "seo",
      text: "I reviewed the saved draft's structure. Add a clear description and a heading for the next section. Live search rankings have not been measured.",
    },
  ],
  createdAt: date,
  updatedAt: date,
});
window.h = {
  list: async (input) => {
    calls.push(["list", input.ownerId]);
    return {
      actorId: actor,
      ownerId: input.ownerId,
      projectId: input.projectId,
      conversations: [
        {
          conversationId,
          title: task(input.ownerId),
          turnCount: 1,
          createdAt: date,
          updatedAt: date,
        },
      ],
    };
  },
  read: async (input) => {
    calls.push(["read", input.ownerId]);
    return {
      actorId: actor,
      ownerId: input.ownerId,
      projectId: input.projectId,
      conversationId,
      title: task(input.ownerId),
      turnCount: 1,
      turns: [turn(input.ownerId)],
      nextAfter: 1,
      hasMore: false,
    };
  },
  send: async () => {
    throw Error("No model calls in the full-page read fixture.");
  },
  resume: async () => {
    throw Error("No execution in the full-page read fixture.");
  },
  cancel: async () => {
    throw Error("No execution in the full-page read fixture.");
  },
};
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const authenticated = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: () => <Outlet />,
});
home.update({ id: "/app/", path: "/app/", getParentRoute: () => authenticated });
const today = createRoute({
  getParentRoute: () => authenticated,
  path: "/app/today",
  component: () => <p>Dashboard destination</p>,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([authenticated.addChildren([home, today])]),
  history: createMemoryHistory({ initialEntries: ["/app"] }),
});
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const text = () => document.getElementById("root").textContent;
const assert = (value, message) => {
  if (!value) throw Error(message);
};
async function until(check, message) {
  for (let i = 0; i < 160; i++) {
    if (check()) return;
    await tick();
  }
  throw Error(message);
}
async function run() {
  await until(() => text().includes("OWN CONTEXT ONLY"), "own project loaded");
  assert(document.querySelector('a[href="/app/today"]'), "dashboard remains in navigation");
  assert(
    [...document.querySelectorAll("h1")].some((node) => node.textContent === t("chat.title")),
    "chat is the main route",
  );
  results.push({ name: "actual home route, shell and router", passed: true });
  await router.navigate({ to: "/app", search: { owner: actor, project: "q" } });
  await until(
    () =>
      window.full.store.activeProjectId === "q" &&
      document.querySelector("textarea")?.labels[0].textContent.includes(secondProject.name),
    "owned deep link synchronizes downstream project context",
  );
  results.push({ name: "owned bookmarked project synchronizes editor context", passed: true });
  const picker = document.querySelector("main select");
  await until(
    () => [...picker.options].some((option) => option.value === JSON.stringify([other, "p"])),
    "shared project choice",
  );
  picker.value = JSON.stringify([other, "p"]);
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  await until(
    () => text().includes("SHARED CONTEXT ONLY") && !text().includes("OWN CONTEXT ONLY"),
    "tenant switched through real router",
  );
  assert(
    document.querySelector(".milo-sidebar").textContent.includes(sharedName) &&
      !document.querySelector(".milo-sidebar").textContent.includes(ownedName),
    "sidebar agrees with client",
  );
  assert(
    document.querySelector("textarea").labels[0].textContent.includes(sharedName),
    "composer agrees with client",
  );
  assert(
    !document.querySelector('form input[type="checkbox"]'),
    "collaborator has no generation permission control",
  );
  assert(
    !document.querySelector('.milo-sidebar a[href="/app/editor"]'),
    "shared navigation cannot silently open own editor",
  );
  const sharedHome = [...document.querySelectorAll(".milo-sidebar a")].find((link) =>
    link.textContent.includes("Growth"),
  );
  const homeTarget = new URL(sharedHome.href);
  assert(
    homeTarget.searchParams.get("owner") === other &&
      homeTarget.searchParams.get("project") === "p",
    "sidebar home preserves selected client",
  );
  const collaboratorsLink = document.querySelector('main a[href*="/app/collaborators"]');
  assert(
    new URL(collaboratorsLink.href).searchParams.get("owner") === other,
    "collaborator destination preserves client",
  );
  results.push({ name: "real project picker isolates repeated project IDs", passed: true });
  window.full.store.projects = [];
  await router.navigate({ to: "/app", search: {} });
  await until(() => text().includes("SHARED CONTEXT ONLY"), "shared-only account stays in chat");
  window.full.denied = true;
  await client.invalidateQueries({ queryKey: ["project-teams", actor] });
  await until(
    () => !document.querySelector("textarea"),
    "failed membership refresh removes shared conversation",
  );
  assert(!text().includes("SHARED CONTEXT ONLY"), "old shared conversation hidden");
  results.push({ name: "shared-only account and failed access refresh", passed: true });
  window.full.store.projects = [project];
  window.full.denied = false;
  await client.invalidateQueries({ queryKey: ["project-teams", actor] });
  await router.navigate({ to: "/app", search: { owner: actor, project: "p" } });
  await until(() => text().includes("OWN CONTEXT ONLY"), "final full page ready");
  const main = document.querySelector("main");
  assert(main.scrollWidth <= window.innerWidth, "full page fits viewport");
  document.getElementById("results").textContent = JSON.stringify(
    { locale, mode: "full", completed: true, results, calls },
    null,
    2,
  );
}
run().catch((error) => {
  document.getElementById("results").textContent = JSON.stringify(
    { locale, mode: "full", completed: false, error: error.message, results, calls },
    null,
    2,
  );
});
