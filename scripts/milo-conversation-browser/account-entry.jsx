import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MiloAccountConversations } from "./src/components/MiloAccountConversations";
import { runTeamRequest } from "./src/lib/team-request-queue";
import {
  rememberMiloConversation,
  rememberedMiloConversation,
} from "./src/lib/milo-conversation-location";
import { t, locale } from "@/i18n";
const root = createRoot(document.getElementById("root")),
  results = [];
const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  ownerA = "00000000-0000-4000-8000-000000000005",
  ownerB = "00000000-0000-4000-8000-000000000006";
const key = ["milo-account-conversations", actor];
const id = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let client,
  serial = 0,
  lists,
  erasures,
  opened,
  entries,
  failList,
  wrongActor,
  loseErase,
  holdNextList,
  releaseList;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const text = () => document.getElementById("root").textContent;
const rows = () => [...document.querySelectorAll("#root li")];
const dialog = () => document.querySelector('[role="alertdialog"]');
const button = (name, within = document) =>
  [...within.querySelectorAll("button")].find((node) => node.textContent === t(name));
const assert = (value, message) => {
  if (!value) throw Error(message);
};
async function until(check, message) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await tick();
  }
  throw Error(message);
}
const targetOf = (entry) =>
  JSON.stringify({
    ownerId: entry.ownerId,
    projectId: entry.projectId,
    conversationId: entry.conversationId,
  });
function fixture(total = 3) {
  lists = [];
  erasures = [];
  opened = [];
  failList = false;
  wrongActor = false;
  loseErase = false;
  holdNextList = false;
  releaseList = undefined;
  // Even entries remain accessible; odd entries lost project access (identifiers only).
  entries = Array.from({ length: total }, (_, i) => ({
    ownerId: i % 3 ? ownerA : ownerB,
    projectId: "p",
    conversationId: id(i + 1),
    createdAt: new Date(Date.UTC(2026, 8, 13, 12) - i * 60000).toISOString(),
    access: i % 2 ? "unavailable" : "available",
    title: i % 2 ? null : `PRIVATE_TITLE_${i + 1}`,
  }));
  window.h = {
    accountList: async (input) => {
      lists.push(structuredClone(input));
      const snapshot = structuredClone(entries);
      if (holdNextList) {
        holdNextList = false;
        await new Promise((resolve) => {
          releaseList = resolve;
        });
      }
      if (failList) throw Error("Access check failed");
      let start = input.before
        ? snapshot.findIndex((entry) => entry.createdAt < input.before.createdAt)
        : 0;
      if (start < 0) start = snapshot.length;
      return {
        actorId: wrongActor ? other : actor,
        conversations: snapshot.slice(start, start + 25),
        hasMore: start + 25 < snapshot.length,
      };
    },
    erase: async (input) => {
      erasures.push(structuredClone(input));
      entries = entries.filter((entry) => entry.conversationId !== input.conversationId);
      if (loseErase) throw Error("Response lost after commit");
      return { ...input, actorId: actor, erased: true };
    },
  };
}
function render() {
  root.render(
    <QueryClientProvider client={client}>
      <MiloAccountConversations
        key={serial}
        actorId={actor}
        conversationHref={(target) =>
          `/app?owner=${target.ownerId}&project=${target.projectId}&conversation=${target.conversationId}`
        }
        onOpen={(target) => opened.push(JSON.stringify(target))}
      />
    </QueryClientProvider>,
  );
}
async function mount(ready = () => text().includes("PRIVATE_TITLE_1")) {
  root.render(null);
  await tick();
  client?.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  serial++;
  render();
  await until(ready, "account directory rendered");
}
async function confirm(row) {
  const trigger = button("chat.erase", row);
  trigger.focus();
  trigger.click();
  await until(dialog, "confirmation dialog");
  button("chat.erase", dialog()).click();
}
async function group(name, work) {
  await work();
  results.push(`PASS ${name}`);
  document.getElementById("results").textContent = results.join("\n");
}
async function run() {
  window.sessionStorage.removeItem(`milo-conversation-location:${actor}`);
  await group(
    "own conversations: titles only while accessible, identifiers only after access ended",
    async () => {
      fixture(3);
      await mount();
      assert(rows().length === 3, "three own conversations");
      assert(JSON.stringify(lists[0]) === "{}", "actor derives from the session, no scope input");
      const link = rows()[0].querySelector("a");
      assert(link.textContent === "PRIVATE_TITLE_1", "accessible title as a link");
      assert(link.getAttribute("href").includes(id(1)), "exact conversation destination");
      assert(
        rows()[1].textContent.includes(t("chat.account.unavailable")) &&
          !rows()[1].querySelector("a"),
        "access-ended entry has no title or open link",
      );
      assert(
        rows()[1].textContent.includes(t("chat.account.started").split("{date}")[0]),
        "creation time shown",
      );
      link.click();
      assert(opened.length === 1 && opened[0] === targetOf(entries[0]), "opens exact own target");
      assert(!button("chat.account.more"), "no further page");
      assert(document.documentElement.scrollWidth <= window.innerWidth + 1, "responsive width");
    },
  );
  await group(
    "pagination uses the exact last-entry cursor and appends without duplicates",
    async () => {
      fixture(30);
      await mount();
      assert(rows().length === 25, "first page bounded");
      button("chat.account.more").click();
      await until(() => rows().length === 30, "second page appended");
      assert(
        JSON.stringify(lists[1]) ===
          JSON.stringify({
            before: { createdAt: entries[24].createdAt, conversationId: id(25) },
          }),
        "exact cursor",
      );
      const links = [...document.querySelectorAll("#root li a")].map((node) => node.textContent);
      assert(new Set(links).size === links.length && links.length === 15, "no duplicate titles");
      assert(!button("chat.account.more"), "end of directory");
    },
  );
  await group(
    "failed refresh hides every cached title until an explicit successful check",
    async () => {
      fixture(3);
      await mount();
      failList = true;
      await client.refetchQueries({ queryKey: key });
      await until(() => text().includes(t("chat.account.error")), "failure shown");
      assert(!text().includes("PRIVATE_TITLE") && rows().length === 0, "cached titles hidden");
      assert(!button("chat.erase"), "no actions on unconfirmed data");
      failList = false;
      button("chat.account.retry").click();
      await until(() => text().includes("PRIVATE_TITLE_1"), "explicit recovery");
    },
  );
  await group("wrong-actor directory response is rejected without rendering", async () => {
    fixture(3);
    wrongActor = true;
    await mount(() => text().includes(t("chat.account.error")));
    assert(!text().includes("PRIVATE_TITLE"), "foreign response withheld");
  });
  await group(
    "deletion requires explicit confirmation and explains retained records and access",
    async () => {
      fixture(3);
      await mount();
      const trigger = button("chat.erase", rows()[1]);
      trigger.focus();
      trigger.click();
      await until(dialog, "dialog opened");
      await until(
        () => document.activeElement?.textContent === t("common.cancel"),
        "Cancel has initial focus",
      );
      assert(
        dialog().textContent.includes(t("chat.eraseHelp")) &&
          dialog().textContent.includes(t("chat.account.eraseAccess")),
        "permanent scope, retained records and unchanged access explained",
      );
      button("common.cancel", dialog()).click();
      await until(() => !dialog(), "dialog closed");
      await until(() => document.activeElement === trigger, "focus returns to Delete");
      assert(erasures.length === 0 && rows().length === 3, "cancel has no side effect");
    },
  );
  await group(
    "confirmed erasure of an access-ended entry sends identifiers once and purges only its scope",
    async () => {
      fixture(3);
      await mount();
      const target = entries[1],
        scope = { ownerId: target.ownerId, projectId: "p" };
      rememberMiloConversation(actor, scope, target.conversationId);
      rememberMiloConversation(actor, { ownerId: ownerB, projectId: "p" }, id(1));
      const history = [
        "milo-conversation",
        actor,
        target.ownerId,
        "p",
        "history",
        target.conversationId,
        0,
      ];
      const proposal = [
        "milo-draft-proposal",
        actor,
        target.ownerId,
        "p",
        target.conversationId,
        "t",
        "x",
      ];
      const unrelated = ["milo-conversation", actor, target.ownerId, "p", "history", id(3), 0];
      const directory = ["milo-conversation", actor, target.ownerId, "p", "directory"];
      client.setQueryData(history, { private: "OLD_MESSAGE" });
      client.setQueryData(proposal, { private: "OLD_PROPOSAL" });
      client.setQueryData(unrelated, { safe: true });
      client.setQueryData(directory, { private: "OLD_TITLE" });
      button("chat.erase", rows()[1]).click();
      await until(dialog, "dialog");
      const action = button("chat.erase", dialog());
      action.click();
      action.click();
      await until(() => text().includes(t("chat.erased")), "erasure confirmed");
      assert(
        erasures.length === 1 && JSON.stringify(erasures[0]) === targetOf(target),
        "one ID-only erasure",
      );
      await until(() => rows().length === 2, "entry removed");
      assert(
        !client.getQueryData(history) &&
          !client.getQueryData(proposal) &&
          !client.getQueryData(directory),
        "scoped private caches purged",
      );
      assert(client.getQueryData(unrelated), "other conversation cache retained");
      assert(rememberedMiloConversation(actor, scope) === undefined, "erased bookmark forgotten");
      assert(
        rememberedMiloConversation(actor, { ownerId: ownerB, projectId: "p" }) === id(1),
        "other client preference retained",
      );
    },
  );
  await group(
    "lost erasure response stays unconfirmed with the title hidden and recovers the same identity",
    async () => {
      fixture(3);
      await mount();
      loseErase = true;
      await confirm(rows()[0]);
      await until(() => text().includes(t("chat.eraseUnconfirmed")), "uncertain outcome");
      assert(!text().includes("PRIVATE_TITLE_1"), "title hidden while unconfirmed");
      await tick();
      assert(erasures.length === 1 && !text().includes(t("chat.erased")), "no automatic retry");
      loseErase = false;
      button("chat.eraseRetry").click();
      await until(() => text().includes(t("chat.erased")), "explicit recovery");
      assert(
        erasures[0] && JSON.stringify(erasures[0]) === JSON.stringify(erasures[1]),
        "same target",
      );
    },
  );
  await group(
    "a directory reply that started before erasure cannot restore the erased entry",
    async () => {
      fixture(3);
      await mount();
      holdNextList = true;
      void client.refetchQueries({ queryKey: key });
      await until(() => releaseList, "stale directory read held");
      await confirm(rows()[1]);
      await until(() => text().includes(t("chat.erased")), "erased while read outstanding");
      releaseList();
      for (let i = 0; i < 4; i++) await tick();
      assert(rows().length === 2, "late snapshot did not restore the entry");
      assert(
        !rows().some((row) => row.textContent.includes(t("chat.account.unavailable"))),
        "erased access-ended entry absent",
      );
    },
  );
  await group("queued erasure is dropped on departure before dispatch", async () => {
    fixture(3);
    await mount();
    const releases = [];
    const waits = [1, 2].map(() =>
      runTeamRequest(() => new Promise((resolve) => releases.push(resolve))),
    );
    await until(() => releases.length === 2, "queue slots held");
    await confirm(rows()[1]);
    await tick();
    root.render(null);
    await tick();
    releases.forEach((resolve) => resolve());
    await Promise.all(waits);
    await tick();
    await tick();
    assert(erasures.length === 0, "unmounted queued erasure never sent");
  });
  await group("empty directory", async () => {
    fixture(0);
    await mount(() => text().includes(t("chat.account.empty")));
    assert(rows().length === 0 && !button("chat.account.more"), "no entries or pagination");
  });
  fixture(30);
  await mount();
  document.getElementById("results").textContent = JSON.stringify({ locale, results }, null, 2);
  window.accountBrowserResults = { locale, results };
}
run().catch((error) => {
  document.getElementById("results").textContent = `FAIL ${error.stack}\n${results.join("\n")}`;
  window.accountBrowserResults = { error: String(error), results };
});
