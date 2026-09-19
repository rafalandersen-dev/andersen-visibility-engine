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
import { Route as generations } from "./src/routes/_authenticated/app.generations";
import { locale, t } from "@/i18n";
const actor = "00000000-0000-4000-8000-000000000001";
const receipt = "00000000-0000-4000-8000-000000000002";
const staleReceipt = "00000000-0000-4000-8000-000000000003";
const otherReceipt = "00000000-0000-4000-8000-000000000004";
window.full = {
  actor,
  store: {
    projects: [
      { id: "p", name: "Previous project" },
      { id: "q", name: "Receipt project" },
    ],
    activeProjectId: "p",
    pendingActions: [],
  },
};
const results = [],
  calls = [];
const payload = (id, projectId, title) => ({
  id,
  canRestore: false,
  result: { kind: "content", projectId, title, output: { markdown: title } },
});
let releaseStale;
window.generation = {
  list: async (input) => {
    calls.push(["list", input.projectId]);
    return { items: [], nextCursor: null };
  },
  read: async ({ receiptId }) => {
    calls.push(["read", receiptId]);
    if (receiptId === staleReceipt)
      return new Promise((resolve) => {
        releaseStale = resolve;
      });
    if (receiptId === otherReceipt)
      return payload(receiptId, "p", "WRONG PROJECT MUST STAY HIDDEN");
    return payload(receiptId, "q", "EXACT RETAINED ARTICLE");
  },
};
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const authenticated = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: () => <Outlet />,
});
generations.update({
  id: "/app/generations",
  path: "/app/generations",
  getParentRoute: () => authenticated,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([authenticated.addChildren([generations])]),
  history: createMemoryHistory({
    initialEntries: [`/app/generations?project=q&receipt=${receipt}`],
  }),
});
createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);
const assert = (value, message) => {
  if (!value) throw Error(message);
};
const text = () => document.getElementById("root").textContent;
async function until(check, message) {
  for (let i = 0; i < 160; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error(message);
}
async function run() {
  await until(
    () => document.querySelector("textarea")?.value === "EXACT RETAINED ARTICLE",
    "deep link opens exact retained result",
  );
  assert(
    window.full.store.activeProjectId === "q",
    "receipt project synchronized for downstream editor",
  );
  assert(
    document.querySelector(".milo-sidebar").textContent.includes("Receipt project") &&
      !document.querySelector(".milo-sidebar").textContent.includes("Previous project"),
    "sidebar matches receipt scope",
  );
  assert(calls.filter((c) => c[0] === "read").length === 1, "deep link only reads once");
  results.push({ name: "actual archive route opens exact receipt in its project", passed: true });
  await router.navigate({
    to: "/app/generations",
    search: { project: "q", receipt: otherReceipt },
  });
  await until(
    () => text().includes(t("generationResults.readError")),
    "wrong-project result refused",
  );
  assert(
    !document.querySelector("textarea") && !text().includes("WRONG PROJECT MUST STAY HIDDEN"),
    "wrong-project payload never shown",
  );
  results.push({ name: "same owner different project receipt is withheld", passed: true });
  await router.navigate({
    to: "/app/generations",
    search: { project: "q", receipt: staleReceipt },
  });
  await until(() => !!releaseStale, "delayed read started");
  await router.navigate({ to: "/app/generations", search: { project: "q", receipt } });
  await until(
    () => document.querySelector("textarea")?.value === "EXACT RETAINED ARTICLE",
    "newer result ready",
  );
  releaseStale(payload(staleReceipt, "q", "STALE RESULT MUST NOT REPLACE"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    document.querySelector("textarea")?.value === "EXACT RETAINED ARTICLE",
    "late result cannot replace newer selection",
  );
  results.push({ name: "late receipt read cannot overwrite the current selection", passed: true });
  document.getElementById("results").textContent = JSON.stringify(
    { locale, mode: "generation", completed: true, results, calls },
    null,
    2,
  );
}
run().catch((error) => {
  document.getElementById("results").textContent = JSON.stringify(
    { locale, completed: false, error: error.message, results, calls },
    null,
    2,
  );
});
