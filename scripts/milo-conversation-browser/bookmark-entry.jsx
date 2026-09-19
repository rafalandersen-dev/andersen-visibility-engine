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
import { AuthProvider } from "./src/lib/auth";
import { Route as authenticated } from "./src/routes/_authenticated/route";
import { Route as home } from "./src/routes/_authenticated/app.index";
import {
  miloConversationHref,
  rememberedMiloConversation,
} from "./src/lib/milo-conversation-location";
import { locale, t } from "@/i18n";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1),
  B = id(2),
  clientId = id(5),
  oldest = id(150),
  sharedFirst = id(201),
  sharedSecond = id(202);
const session = (actor) => ({ user: { id: actor, email: `${actor}@example.test` } });
const h = (window.authFixture = {
  client: clientId,
  current: session(A),
  initial: { promise: Promise.resolve({ data: { session: session(A) } }) },
  emit: null,
  hydrations: [],
  role: async () => ({ data: null, error: null }),
  workspace: async (actor) => ({
    data: {
      meta: { active_project_id: "p", extras: {}, rev: 1 },
      entities: [
        {
          collection: "projects",
          entity_id: "p",
          ord: 0,
          data: {
            id: "p",
            name: actor === A ? "First account owned client" : "Second account owned client",
            businessName: "Fixture company",
            appLanguage: locale,
          },
        },
      ],
    },
    error: null,
  }),
  sends: [],
  reads: [],
  mode: "hold",
  finish: null,
  denied: false,
  listReads: 0,
});
const records = new Map();
const recordKey = (actor, owner, project, conversation) =>
  JSON.stringify([actor, owner, project, conversation]);
const date = "2026-09-13T12:00:00Z";
function seed(actor, owner, conversation, marker, count = 1) {
  const turns = Array.from({ length: count }, (_, i) => ({
    turnId: crypto.randomUUID(),
    ordinal: i + 1,
    body: `${marker} ${i + 1}`,
    locale,
    state: "completed",
    events: [{ kind: "assistant", role: "seo", text: `Recorded answer ${marker} ${i + 1}` }],
    createdAt: date,
    updatedAt: date,
  }));
  records.set(recordKey(actor, owner, "p", conversation), {
    conversationId: conversation,
    title: marker,
    turns,
  });
}
for (let i = 100; i <= 150; i++)
  seed(
    A,
    A,
    id(i),
    i === 150 ? "BOOKMARK_OUTSIDE_FIRST_DIRECTORY" : `OWN_DIRECTORY_${i}`,
    i === 150 ? 41 : 1,
  );
seed(A, clientId, sharedFirst, "SHARED_FIRST_PRIVATE_A");
seed(A, clientId, sharedSecond, "SHARED_SECOND_PRIVATE_A");
seed(B, clientId, id(301), "SHARED_PRIVATE_B");
function actor() {
  if (!h.current) throw Error("No fixture session");
  return h.current.user.id;
}
function authorize(input) {
  if (h.denied || input.projectId !== "p" || ![actor(), clientId].includes(input.ownerId))
    throw Error("Unavailable fixture client");
}
window.h = {
  list: async (input) => {
    h.listReads++;
    authorize(input);
    return {
      actorId: actor(),
      ownerId: input.ownerId,
      projectId: input.projectId,
      conversations: [...records.entries()]
        .filter(([key]) => {
          const [who, owner, project] = JSON.parse(key);
          return who === actor() && owner === input.ownerId && project === input.projectId;
        })
        .map(([, item]) => ({
          conversationId: item.conversationId,
          title: item.title,
          turnCount: item.turns.length,
          createdAt: date,
          updatedAt: date,
        }))
        .slice(input.offset, input.offset + 50),
    };
  },
  read: async (input) => {
    authorize(input);
    h.reads.push({ actor: actor(), ...input });
    const saved = records.get(
      recordKey(actor(), input.ownerId, input.projectId, input.conversationId),
    );
    if (!saved) throw Error("Conversation unavailable");
    return {
      actorId: actor(),
      ownerId: input.ownerId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      title: saved.title,
      turnCount: saved.turns.length,
      turns: saved.turns.slice(input.after, input.after + 20),
      nextAfter: Math.min(input.after + 20, saved.turns.length),
      hasMore: input.after + 20 < saved.turns.length,
    };
  },
  send: async (input) => {
    authorize(input);
    h.sends.push(structuredClone(input));
    if (h.mode === "uncertain") throw Error("Submission response unavailable");
    const key = recordKey(actor(), input.ownerId, input.projectId, input.conversationId);
    let saved = records.get(key);
    if (!saved) {
      saved = { conversationId: input.conversationId, title: input.body.slice(0, 200), turns: [] };
      records.set(key, saved);
    }
    const prior = saved.turns.find((turn) => turn.turnId === input.turnId);
    if (prior) return { turn: prior };
    const turn = {
      turnId: input.turnId,
      ordinal: saved.turns.length + 1,
      body: input.body,
      locale: input.locale,
      allowDraftGeneration: input.allowDraftGeneration ?? false,
      state: "pending",
      events: [],
      createdAt: date,
      updatedAt: date,
    };
    saved.turns.push(turn);
    return new Promise((resolve) => {
      h.finish = () => {
        turn.state = "completed";
        turn.events = [{ kind: "assistant", role: "seo", text: "SAVED_BOOKMARK_RESPONSE" }];
        resolve({ turn });
      };
    });
  },
  resume: async () => {
    throw Error("No provider in bookmark fixture");
  },
  cancel: async () => {
    throw Error("No provider in bookmark fixture");
  },
};
const rootRoute = createRootRoute({ component: () => <Outlet /> });
authenticated.update({ id: "_authenticated", getParentRoute: () => rootRoute });
home.update({ id: "/app/", path: "/app/", getParentRoute: () => authenticated });
const authPage = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  validateSearch: (s) => s,
  component: () => <p>AUTH ENTRY</p>,
});
const routeTree = rootRoute.addChildren([authPage, authenticated.addChildren([home])]);
let view, router, queryClient;
function mount(url) {
  view?.unmount();
  queryClient?.clear();
  h.initial = { promise: Promise.resolve({ data: { session: h.current } }) };
  router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [url] }) });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  view = createRoot(document.getElementById("root"));
  view.render(
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>,
  );
}
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
const button = (key) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent === t(key));
function edit(value) {
  const node = document.querySelector("textarea");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}
async function choose(owner) {
  const picker = document.querySelector("main select");
  picker.value = JSON.stringify([owner, "p"]);
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  await until(() => router.state.location.search.owner === owner, "project selection entered URL");
}
const results = [];
async function run() {
  // Reset only this fixture's synthetic actors between independent runs.
  for (const who of [A, B]) sessionStorage.removeItem(`milo-conversation-location:${who}`);
  const bookmarked = miloConversationHref({ ownerId: A, projectId: "p" }, oldest);
  mount(bookmarked);
  await until(
    () => text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY 41"),
    "deep link reads its latest page beyond first 50 conversations",
  );
  assert(
    ![...document.querySelectorAll("aside a")].some(
      (a) => a.textContent === "BOOKMARK_OUTSIDE_FIRST_DIRECTORY",
    ),
    "target is genuinely outside the loaded directory page",
  );
  assert(
    h.reads.some((read) => read.conversationId === oldest && read.after === 40),
    "latest history page is read using retained count",
  );
  assert(h.sends.length === 0, "bookmark does not dispatch");
  results.push({
    name: "exact deep link outside the first directory and latest history page",
    passed: true,
  });
  mount(bookmarked);
  await until(
    () => text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY 41"),
    "recreated auth/router/workspace restores exact bookmark",
  );
  assert(h.sends.length === 0, "remount only reads saved history");
  results.push({
    name: "full remount restores the same conversation without execution",
    passed: true,
  });
  await choose(clientId);
  await until(
    () => text().includes("Recorded answer SHARED_FIRST_PRIVATE_A 1"),
    "shared conversation loaded",
  );
  const secondLink = [...document.querySelectorAll("aside a")].find(
    (a) => a.textContent === "SHARED_SECOND_PRIVATE_A",
  );
  const destination = new URL(secondLink.href);
  assert(
    destination.searchParams.get("owner") === clientId &&
      destination.searchParams.get("conversation") === sharedSecond,
    "history item is a usable scoped link",
  );
  secondLink.click();
  await until(
    () =>
      router.state.location.search.conversation === sharedSecond &&
      text().includes("Recorded answer SHARED_SECOND_PRIVATE_A 1"),
    "selected shared conversation is addressable",
  );
  router.history.back();
  await until(
    () =>
      router.state.location.search.conversation === sharedFirst &&
      text().includes("Recorded answer SHARED_FIRST_PRIVATE_A 1"),
    "Back restores prior conversation",
  );
  router.history.forward();
  await until(
    () =>
      router.state.location.search.conversation === sharedSecond &&
      text().includes("Recorded answer SHARED_SECOND_PRIVATE_A 1"),
    "Forward restores selected conversation",
  );
  await choose(A);
  await until(
    () =>
      router.state.location.search.conversation === oldest &&
      text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY 41"),
    "return to owner client restores its prior conversation",
  );
  await choose(clientId);
  await until(
    () =>
      router.state.location.search.conversation === sharedSecond &&
      text().includes("Recorded answer SHARED_SECOND_PRIVATE_A 1"),
    "shared client remembers its own selection",
  );
  results.push({
    name: "client-scoped session preferences, real history links and Back/Forward",
    passed: true,
  });
  await choose(A);
  await until(
    () => text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY 41"),
    "own context restored for submission",
  );
  button("chat.new").click();
  await until(
    () => router.state.location.search.conversation === "new" && text().includes(t("chat.welcome")),
    "explicit new conversation has a stable URL state",
  );
  const composer = document.querySelector("textarea");
  edit("Unconfirmed request must keep its original identity");
  await tick();
  h.mode = "uncertain";
  button("chat.send").click();
  await until(
    () => h.sends.length === 1 && !!button("chat.recover"),
    "uncertain submission recovery is visible",
  );
  const request = h.sends[0];
  assert(
    router.state.location.search.conversation === request.conversationId,
    "first submission writes its exact bookmark",
  );
  assert(
    document.querySelector("textarea") === composer && composer.value === request.body,
    "URL promotion did not remount or clear unconfirmed request",
  );
  assert(!button("chat.recover").disabled, "original immutable request remains recoverable");
  h.mode = "hold";
  button("chat.recover").click();
  await until(() => h.sends.length === 2 && !!h.finish, "recovery uses same saved request");
  assert(
    JSON.stringify(h.sends[0]) === JSON.stringify(h.sends[1]),
    "recovery does not replace request, client or generation choice",
  );
  h.emit("TOKEN_REFRESHED", session(A));
  await tick();
  await tick();
  assert(
    document.querySelector("textarea") === composer,
    "token refresh preserves the promoted conversation session",
  );
  h.finish();
  await until(
    () => text().includes("SAVED_BOOKMARK_RESPONSE") && composer.value === "",
    "successful same-request response is retained and clears composer",
  );
  const retainedHref = router.state.location.href;
  mount(retainedHref);
  await until(
    () => text().includes("SAVED_BOOKMARK_RESPONSE"),
    "recreated workspace restores first submitted conversation",
  );
  assert(h.sends.length === 2, "remount does not repeat the recovered submission");
  results.push({
    name: "first-message bookmark preserves unconfirmed request, exact recovery and token refresh",
    passed: true,
  });
  // A slow read from a departing conversation must not replace a newer URL.
  const originalRead = window.h.read;
  let releaseRead,
    enteredRead = false;
  window.h.read = async (input) => {
    const result = await originalRead(input);
    if (input.ownerId === A && input.conversationId === oldest) {
      enteredRead = true;
      await new Promise((resolve) => {
        releaseRead = resolve;
      });
    }
    return result;
  };
  await router.navigate({ to: "/app", search: { owner: A, project: "p", conversation: oldest } });
  await until(() => enteredRead, "old conversation read is held");
  await router.navigate({
    to: "/app",
    search: { owner: clientId, project: "p", conversation: sharedSecond },
  });
  await until(
    () => text().includes("Recorded answer SHARED_SECOND_PRIVATE_A 1"),
    "newer shared navigation completes",
  );
  const sharedComposer = document.querySelector("textarea");
  window.h.read = originalRead;
  releaseRead();
  await tick();
  await tick();
  assert(
    router.state.location.search.owner === clientId &&
      router.state.location.search.conversation === sharedSecond &&
      document.querySelector("textarea") === sharedComposer,
    "late old read cannot rewrite newer project or conversation",
  );
  assert(
    !text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY"),
    "late old private answer stays hidden",
  );
  results.push({
    name: "late history read cannot overwrite newer client navigation",
    passed: true,
  });
  const missing = id(999);
  await router.navigate({ to: "/app", search: { owner: A, project: "p", conversation: missing } });
  await until(
    () => text().includes(t("chat.unavailable")) && !document.querySelector("aside ul"),
    "invalid bookmark remains unavailable",
  );
  assert(
    router.state.location.search.conversation === missing &&
      !text().includes("SAVED_BOOKMARK_RESPONSE"),
    "missing bookmark never falls back to another private conversation",
  );
  const originalList = window.h.list;
  let releaseDirectory,
    enteredDirectory = false;
  window.h.list = async (input) => {
    const result = await originalList(input);
    if (input.ownerId === A) {
      enteredDirectory = true;
      await new Promise((resolve) => {
        releaseDirectory = resolve;
      });
    }
    return result;
  };
  button("chat.new").click();
  await until(() => enteredDirectory, "recovery directory read is held");
  await choose(clientId);
  await until(
    () => text().includes("Recorded answer SHARED_SECOND_PRIVATE_A 1"),
    "client switch completes while old recovery is pending",
  );
  window.h.list = originalList;
  releaseDirectory();
  await tick();
  await tick();
  assert(
    router.state.location.search.owner === clientId &&
      router.state.location.search.conversation === sharedSecond,
    "late recovery cannot open a new conversation in a departed client",
  );
  results.push({ name: "late bookmark recovery cannot undo a client switch", passed: true });
  await router.navigate({ to: "/app", search: { owner: A, project: "p", conversation: missing } });
  await until(
    () => text().includes(t("chat.unavailable")) && !document.querySelector("aside ul"),
    "missing bookmark stays explicit after returning",
  );
  enteredDirectory = false;
  window.h.list = async (input) => {
    const result = await originalList(input);
    if (input.ownerId === A) {
      enteredDirectory = true;
      await new Promise((resolve) => {
        releaseDirectory = resolve;
      });
    }
    return result;
  };
  button("chat.new").click();
  await until(() => enteredDirectory, "same-client recovery read is held");
  await router.navigate({ to: "/app", search: { owner: A, project: "p", conversation: oldest } });
  await until(
    () => text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY 41"),
    "another conversation in the same client becomes active",
  );
  window.h.list = originalList;
  releaseDirectory();
  await tick();
  await tick();
  assert(
    router.state.location.search.conversation === oldest &&
      text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY 41"),
    "late recovery cannot replace a newer conversation in the same mounted client",
  );
  await router.navigate({ to: "/app", search: { owner: A, project: "p", conversation: missing } });
  await until(
    () => text().includes(t("chat.unavailable")) && !document.querySelector("aside ul"),
    "missing bookmark returned for explicit recovery",
  );
  results.push({
    name: "late recovery cannot replace another conversation in the same client",
    passed: true,
  });
  const beforeRecovery = h.listReads;
  button("chat.new").click();
  await until(
    () =>
      h.listReads > beforeRecovery &&
      router.state.location.search.conversation === "new" &&
      text().includes(t("chat.welcome")),
    "new conversation recovers only after fresh directory authorization",
  );
  assert(h.sends.length === 2, "bookmark recovery creates no server task");
  assert(
    rememberedMiloConversation(A, { ownerId: A, projectId: "p" }) === undefined,
    "explicit recovery abandons the previous client bookmark",
  );
  results.push({
    name: "unavailable bookmark fails closed and can recover with fresh client authorization",
    passed: true,
  });
  await router.navigate({
    to: "/app",
    search: { owner: clientId, project: "p", conversation: sharedSecond },
  });
  await until(
    () => text().includes("Recorded answer SHARED_SECOND_PRIVATE_A 1"),
    "account A private shared conversation loaded",
  );
  h.emit("SIGNED_IN", session(B));
  await until(
    () => text().includes(t("chat.unavailable")) && !document.querySelector("aside ul"),
    "same client bookmark is unavailable to a different actor",
  );
  assert(
    !text().includes("SHARED_SECOND_PRIVATE_A") && !text().includes("SHARED_PRIVATE_B"),
    "account change reveals neither old content nor an unrelated fallback",
  );
  assert(
    router.state.location.search.conversation === sharedSecond,
    "actor-private denial retains exact requested target",
  );
  button("chat.new").click();
  await until(
    () => router.state.location.search.conversation === "new" && text().includes(t("chat.welcome")),
    "new actor can explicitly choose a new private conversation",
  );
  assert(
    [...document.querySelectorAll("aside a")].some((a) => a.textContent === "SHARED_PRIVATE_B"),
    "fresh directory belongs to current actor",
  );
  results.push({ name: "actual auth/account switch keeps bookmarks actor-private", passed: true });
  const beforeInvalidLink = h.reads.length;
  await router.navigate({
    to: "/app",
    search: { owner: clientId, project: "p", conversation: "not-a-conversation-id" },
  });
  await until(
    () => text().includes(t("chat.unavailable")) && !document.querySelector("textarea"),
    "malformed URL presents a safe route error",
  );
  assert(
    h.reads.length === beforeInvalidLink && !text().includes("SHARED_PRIVATE_B"),
    "invalid search never reads or substitutes a conversation",
  );
  const returnLink = [...document.querySelectorAll("a")].find(
    (link) => link.textContent === t("chat.history"),
  );
  assert(returnLink, "malformed bookmark has an explicit route back to conversations");
  returnLink.click();
  await until(
    () => !!document.querySelector("textarea"),
    "explicit return recovers from invalid search",
  );
  results.push({
    name: "malformed links fail safely without automatic fallback or server reads",
    passed: true,
  });
  const logoutTarget = router.state.location.href;
  h.emit("SIGNED_OUT", null);
  await until(() => text().includes("AUTH ENTRY"), "sign-out leaves conversation");
  assert(
    router.state.location.search.redirect === logoutTarget,
    "sign-in redirect retains conversation and client URL",
  );
  results.push({
    name: "sign-in redirect preserves the complete conversation destination",
    passed: true,
  });
  h.emit("SIGNED_IN", session(A));
  await router.navigate({ to: "/app", search: { owner: A, project: "p", conversation: oldest } });
  await until(
    () => text().includes("Recorded answer BOOKMARK_OUTSIDE_FIRST_DIRECTORY 41"),
    "final scoped conversation ready",
  );
  assert(
    document.querySelector("main").scrollWidth <= window.innerWidth,
    "conversation links and latest page fit viewport",
  );
  const eraseCalls = [];
  window.h.erase = async (input) => {
    authorize(input);
    eraseCalls.push(structuredClone(input));
    records.delete(recordKey(actor(), input.ownerId, input.projectId, input.conversationId));
    return { ...input, actorId: actor(), erased: true };
  };
  await until(
    () => rememberedMiloConversation(A, { ownerId: A, projectId: "p" }) === oldest,
    "confirmed bookmark remembered before erasure",
  );
  button("chat.erase").click();
  await until(
    () => document.querySelector('[role="alertdialog"]'),
    "exact conversation erasure dialog",
  );
  [...document.querySelectorAll('[role="alertdialog"] button')]
    .find((node) => node.textContent === t("chat.erase"))
    .click();
  await until(
    () => router.state.location.search.conversation === "new" && text().includes(t("chat.welcome")),
    "erasure replaces the actual router destination",
  );
  assert(
    !rememberedMiloConversation(A, { ownerId: A, projectId: "p" }),
    "erasure clears only this client preference",
  );
  assert(
    eraseCalls.length === 1 && eraseCalls[0].conversationId === oldest,
    "erasure uses the exact selected conversation",
  );
  const sendsBeforeDeletedBookmark = h.sends.length;
  await router.navigate({ to: "/app", search: { owner: A, project: "p", conversation: oldest } });
  await until(() => text().includes(t("chat.unavailable")), "a deleted bookmark is unavailable");
  assert(
    !text().includes("BOOKMARK_OUTSIDE_FIRST_DIRECTORY") &&
      h.sends.length === sendsBeforeDeletedBookmark,
    "no restored private history or new dispatch",
  );
  button("chat.new").click();
  await until(
    () => router.state.location.search.conversation === "new" && text().includes(t("chat.welcome")),
    "explicit fresh authorization recovers from a deleted bookmark",
  );
  results.push({
    name: "erasure replaces the real URL, forgets the preference and keeps old bookmarks unavailable",
    passed: true,
  });
  document.getElementById("results").textContent = JSON.stringify(
    {
      locale,
      mode: "bookmark",
      completed: true,
      results,
      sends: h.sends.length,
      reads: h.reads.length,
    },
    null,
    2,
  );
}
run().catch((error) => {
  document.getElementById("results").textContent = JSON.stringify(
    {
      locale,
      mode: "bookmark",
      completed: false,
      error: error.message,
      results,
      location: router?.state.location.href,
      sends: h.sends.length,
    },
    null,
    2,
  );
});
