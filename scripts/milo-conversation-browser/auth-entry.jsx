import React, { useLayoutEffect } from "react";
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
import { AuthProvider, useAuth } from "./src/lib/auth";
import { getState } from "./src/lib/store";
import { Route as authenticated } from "./src/routes/_authenticated/route";
import { Route as home } from "./src/routes/_authenticated/app.index";
import { locale, t } from "@/i18n";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003",
  D = "00000000-0000-4000-8000-000000000004",
  clientId = "00000000-0000-4000-8000-000000000005";
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const snapshot = (id) => ({ user: { id, email: `${id}@example.test` } });
const bundle = (id, name) => ({
  data: {
    meta: { active_project_id: name ? "p" : "", extras: {}, rev: 1 },
    entities: name
      ? [
          {
            collection: "projects",
            entity_id: "p",
            ord: 0,
            data: { id: "p", name, businessName: name, appLanguage: locale },
          },
        ]
      : [],
  },
  error: null,
});
// Each fixture run owns only these synthetic actor preferences.
for (const who of [A, B, C, D]) sessionStorage.removeItem(`milo-conversation-location:${who}`);
window.authFixture = {
  initial: deferred(),
  client: clientId,
  current: null,
  emit: null,
  hydrations: [],
  probes: [],
  role: async () => ({ data: null, error: null }),
  workspace: async (id) => bundle(id, id === A ? "OLD ACCOUNT PRIVATE" : null),
};
const h = window.authFixture,
  results = [];
window.h = {
  list: async (input) => ({
    actorId: h.current.user.id,
    ownerId: input.ownerId,
    projectId: input.projectId,
    conversations: [],
  }),
  read: async () => {
    throw Error("No saved conversation in the auth fixture");
  },
  send: async () => {
    throw Error("No paid execution in the auth fixture");
  },
  resume: async () => {
    throw Error("No paid execution in the auth fixture");
  },
  cancel: async () => {
    throw Error("No execution in the auth fixture");
  },
};
function Probe() {
  const auth = useAuth();
  useLayoutEffect(() => {
    h.probes.push({
      actor: auth.user?.id,
      owner: auth.isOwner,
      workspace: getState().userId,
      body: document.getElementById("root").textContent,
    });
  });
  return null;
}
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Probe />
      <Outlet />
    </>
  ),
});
authenticated.update({ id: "_authenticated", getParentRoute: () => rootRoute });
home.update({ id: "/app/", path: "/app/", getParentRoute: () => authenticated });
const authPage = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  validateSearch: (s) => s,
  component: () => <p>AUTH ENTRY</p>,
});
const onboarding = createRoute({
  getParentRoute: () => authenticated,
  path: "/app/onboarding",
  component: () => <p>ONBOARDING ENTRY</p>,
});
const today = createRoute({
  getParentRoute: () => authenticated,
  path: "/app/today",
  component: () => <p>PROTECTED TODAY</p>,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    authPage,
    authenticated.addChildren([home, onboarding, today]),
  ]),
  history: createMemoryHistory({ initialEntries: [`/app?owner=${clientId}&project=p`] }),
});
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </AuthProvider>,
);
const text = () => document.getElementById("root").textContent;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const assert = (value, message) => {
  if (!value) throw Error(message);
};
async function until(check, message) {
  for (let i = 0; i < 240; i++) {
    if (check()) return;
    await tick();
  }
  throw Error(message);
}
function edit(node, value) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}
async function run() {
  await until(() => !!h.emit, "real AuthProvider subscribed");
  h.initial.resolve({ data: { session: null } });
  await until(() => text().includes("AUTH ENTRY"), "signed-out user sent to authentication");
  assert(
    router.state.location.search.redirect === `/app?owner=${clientId}&project=p`,
    `exact client URL survives sign-in redirect: ${JSON.stringify(router.state.location.search).slice(0, 400)}`,
  );
  results.push({
    name: "actual auth gate preserves destination for signed-out users",
    passed: true,
  });
  h.emit("SIGNED_IN", snapshot(A));
  await router.navigate({ to: "/app", search: { owner: A, project: "p" } });
  await until(
    () => !!document.querySelector("textarea") && text().includes("OLD ACCOUNT PRIVATE"),
    "own conversation loaded through actual hydration",
  );
  const composer = document.querySelector("textarea");
  edit(composer, "Unsent draft survives token refresh");
  await tick();
  const hydrationCount = h.hydrations.length;
  h.emit("TOKEN_REFRESHED", snapshot(A));
  await tick();
  await tick();
  assert(h.hydrations.length === hydrationCount, "token refresh does not hydrate again");
  assert(
    document.querySelector("textarea") === composer &&
      composer.value === "Unsent draft survives token refresh",
    "token refresh keeps the live composer and its unsent text",
  );
  results.push({
    name: "same-account token refresh preserves conversation and unsent task",
    passed: true,
  });
  await router.navigate({ to: "/app", search: { owner: clientId, project: "p" } });
  await until(
    () => !!document.querySelector("textarea") && document.querySelector("textarea") !== composer,
    "new project conversation mounted",
  );
  assert(
    h.hydrations.length === hydrationCount,
    "project URL navigation does not rehydrate workspace",
  );
  const delayedB = deferred();
  h.workspace = (id) => (id === B ? delayedB.promise : Promise.resolve(bundle(id, null)));
  const firstProbe = h.probes.length;
  h.emit("SIGNED_IN", snapshot(B));
  await until(() => h.hydrations.includes(B), "new account hydration started");
  assert(
    !document.querySelector("textarea") && !text().includes("OLD ACCOUNT PRIVATE"),
    "old account workspace hidden while new account loads",
  );
  assert(
    h.probes
      .slice(firstProbe)
      .filter((p) => p.actor === B)
      .every((p) => !p.body.includes("OLD ACCOUNT PRIVATE")),
    "no committed new-account render exposes old private project",
  );
  delayedB.resolve(bundle(B, null));
  await until(() => !!document.querySelector("textarea"), "shared-only account reaches main chat");
  assert(
    router.state.location.pathname === "/app" && text().includes("Shared client context"),
    "shared-only account avoids own-project onboarding",
  );
  results.push({
    name: "actual session/store switch hides old account and admits shared-only chat",
    passed: true,
  });
  await router.navigate({ to: "/app/today" });
  await until(
    () => text().includes("ONBOARDING ENTRY"),
    "unconfigured owner-only view still redirects to onboarding",
  );
  results.push({
    name: "onboarding guard stays active outside shared conversation routes",
    passed: true,
  });
  h.emit("SIGNED_OUT", null);
  await until(() => text().includes("AUTH ENTRY"), "sign-out leaves all authenticated content");
  assert(
    !getState().hydrated && !getState().userId && !document.querySelector("textarea"),
    "sign-out clears actual workspace store",
  );
  results.push({ name: "actual sign-out clears workspace and conversation", passed: true });
  h.workspace = async () => ({ data: null, error: new Error("fixture workspace unavailable") });
  h.emit("SIGNED_IN", snapshot(C));
  await router.navigate({ to: "/app", search: {} });
  await until(
    () => text().includes(t("shell.loadError.title")),
    "failed hydration presents retry screen",
  );
  assert(
    !document.querySelector("textarea") && !text().includes("ONBOARDING ENTRY"),
    "load failure is not an empty workspace",
  );
  const delayedC = deferred(),
    delayedD = deferred();
  h.workspace = (id) => (id === C ? delayedC.promise : delayedD.promise);
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent === t("shell.loadError.retry"))
    .click();
  await until(() => h.hydrations.filter((id) => id === C).length === 2, "retry in progress");
  h.emit("SIGNED_IN", snapshot(D));
  await until(() => h.hydrations.includes(D), "next account loading");
  delayedC.resolve(bundle(C, "STALE RETRY PRIVATE"));
  await tick();
  await tick();
  assert(
    !document.querySelector("textarea") && !text().includes("STALE RETRY PRIVATE"),
    "old retry cannot release another account's loading gate",
  );
  delayedD.resolve(bundle(D, "CURRENT ACCOUNT"));
  await until(
    () => !!document.querySelector("textarea") && text().includes("CURRENT ACCOUNT"),
    "latest account loaded",
  );
  assert(
    getState().userId === D && !text().includes("STALE RETRY PRIVATE"),
    "only current hydration retained",
  );
  results.push({
    name: "failed hydration retry and late completion remain account-scoped",
    passed: true,
  });
  document.getElementById("results").textContent = JSON.stringify(
    { locale, mode: "auth", completed: true, results, hydrations: h.hydrations },
    null,
    2,
  );
}
run().catch((error) => {
  document.getElementById("results").textContent = JSON.stringify(
    {
      locale,
      mode: "auth",
      completed: false,
      error: error.message,
      results,
      hydrations: h.hydrations,
    },
    null,
    2,
  );
});
