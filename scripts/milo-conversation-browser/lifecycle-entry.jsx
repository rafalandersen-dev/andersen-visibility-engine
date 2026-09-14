import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MiloConversationWorkspace } from "./src/components/MiloConversationWorkspace";
import { runTeamRequest } from "./src/lib/team-request-queue";
import { t, locale } from "@/i18n";
const root = createRoot(document.getElementById("root")),
  results = [];
const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const project = { ownerId: actor, projectId: "p", name: "Lifecycle client" };
const target = {
  ownerId: actor,
  projectId: "p",
  conversationId: "00000000-0000-4000-8000-000000000003",
};
const second = "00000000-0000-4000-8000-000000000004",
  stamp = "2026-09-13T12:00:00Z";
let client,
  serial = 0,
  exports,
  erasures,
  downloads,
  erased,
  denied,
  loseErase,
  holdExport,
  holdErase,
  releaseExport,
  releaseErase,
  versionChanged,
  wrongActor,
  locations,
  turns;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const text = () => document.getElementById("root").textContent;
const button = (key, within = document) =>
  [...within.querySelectorAll("button")].find((node) => node.textContent === t(key));
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
const urls = new Map(),
  realCreate = URL.createObjectURL.bind(URL),
  realRevoke = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  const url = realCreate(blob);
  urls.set(url, blob);
  return url;
};
URL.revokeObjectURL = (url) => {
  urls.delete(url);
  realRevoke(url);
};
document.addEventListener(
  "click",
  (event) => {
    const anchor = event.target.closest?.("a[download]");
    if (!anchor) return;
    event.preventDefault();
    const blob = urls.get(anchor.href);
    if (blob)
      blob
        .text()
        .then((content) => downloads.push({ name: anchor.download, data: JSON.parse(content) }));
  },
  true,
);
function fixture() {
  exports = [];
  erasures = [];
  downloads = [];
  erased = false;
  denied = false;
  loseErase = false;
  holdExport = false;
  holdErase = false;
  releaseExport = undefined;
  releaseErase = undefined;
  versionChanged = false;
  wrongActor = false;
  locations = [];
  turns = Array.from({ length: 23 }, (_, i) => ({
    turnId: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    ordinal: i + 1,
    body: `PRIVATE_MESSAGE_${i + 1}`,
    locale,
    state: "completed",
    events: [{ kind: "assistant", role: "lead", text: `PRIVATE_REPLY_${i + 1}` }],
    createdAt: stamp,
    updatedAt: stamp,
  }));
  window.h = {
    list: async (input) => {
      if (denied) throw Error("Access revoked");
      return {
        actorId: actor,
        ownerId: input.ownerId,
        projectId: input.projectId,
        conversations: erased
          ? []
          : [
              {
                conversationId: target.conversationId,
                title: "PRIVATE_TITLE",
                turnCount: 23,
                createdAt: stamp,
                updatedAt: stamp,
              },
            ],
      };
    },
    read: async (input) => {
      if (denied || (erased && input.conversationId === target.conversationId))
        throw Error("Unavailable");
      const page = turns.slice(input.after, input.after + 20);
      return {
        ...input,
        actorId: actor,
        title: "PRIVATE_TITLE",
        turnCount: 23,
        turns: page,
        nextAfter: input.after + page.length,
        hasMore: input.after + page.length < 23,
        after: undefined,
      };
    },
    send: async () => {
      throw Error("Unexpected send");
    },
    exportPage: async (input) => {
      exports.push(structuredClone(input));
      const response = {
        actorId: wrongActor ? other : actor,
        ...target,
        title: "PRIVATE_TITLE",
        version: (versionChanged && input.after ? "b" : "a").repeat(64),
        observedAt: stamp,
        turnCount: 23,
        nextAfter: Math.min(23, input.after + 20),
        hasMore: input.after + 20 < 23,
        entries: turns
          .slice(input.after, input.after + 20)
          .map((turn) => ({ turn, proposal: null, omittedProposals: 0 })),
      };
      if (holdExport)
        await new Promise((resolve) => {
          releaseExport = resolve;
        });
      if (denied) throw Error("Denied");
      return response;
    },
    erase: async (input) => {
      erasures.push(structuredClone(input));
      if (holdErase)
        await new Promise((resolve) => {
          releaseErase = resolve;
        });
      erased = true;
      if (loseErase) throw Error("Response lost after commit");
      return { ...input, actorId: actor, erased: true };
    },
  };
  // Public history schema has no request cursor field.
  const read = window.h.read;
  window.h.read = async (input) => {
    const response = await read(input);
    delete response.after;
    return response;
  };
}
function render(scope = project, location = target.conversationId) {
  root.render(
    <QueryClientProvider client={client}>
      <MiloConversationWorkspace
        key={serial}
        actorId={actor}
        project={scope}
        location={location}
        onLocationChange={(id, replace) => locations.push({ id, replace })}
        onOpenResult={() => {}}
      />
    </QueryClientProvider>,
  );
}
async function mount() {
  root.render(null);
  await tick();
  client?.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  serial++;
  render();
  await until(() => text().includes("PRIVATE_REPLY_23"), "latest private history rendered");
}
async function confirm() {
  button("chat.erase").click();
  await until(() => document.querySelector('[role="alertdialog"]'), "confirmation dialog");
  button("chat.erase", document.querySelector('[role="alertdialog"]')).click();
}
async function group(name, work) {
  await work();
  results.push(`PASS ${name}`);
  document.getElementById("results").textContent = results.join("\n");
}
async function run() {
  await group("complete export, exact order, final fence, duplicate-click guard", async () => {
    fixture();
    await mount();
    const exportButton = button("chat.export");
    exportButton.click();
    exportButton.click();
    await until(() => downloads.length === 1, "one download");
    assert(exports.map((input) => input.after).join() === "0,20,23", "all pages plus final fence");
    assert(
      downloads[0].data.entries.length === 23 &&
        downloads[0].data.entries[0].turn.body === "PRIVATE_MESSAGE_1",
      "complete original history",
    );
    assert(
      downloads[0].name === `milo-conversation-${target.conversationId}.json`,
      "safe exact filename",
    );
    assert(!exports.some((input) => "actorId" in input), "actor derives from authentication");
    assert(document.documentElement.scrollWidth <= window.innerWidth + 1, "responsive width");
  });
  await group("changed export produces no partial file and needs an explicit retry", async () => {
    fixture();
    await mount();
    versionChanged = true;
    button("chat.export").click();
    await until(() => text().includes(t("chat.exportFailed")), "export error");
    assert(downloads.length === 0, "no partial download");
    await tick();
    assert(exports.length === 2, "no automatic retry");
    versionChanged = false;
    button("chat.export").click();
    await until(() => downloads.length === 1, "explicit export recovery");
  });
  await group("wrong-actor export is rejected", async () => {
    fixture();
    await mount();
    wrongActor = true;
    button("chat.export").click();
    await until(() => text().includes(t("chat.exportFailed")), "wrong actor rejected");
    assert(downloads.length === 0, "private file withheld");
  });
  await group("navigation discards a late private export", async () => {
    fixture();
    await mount();
    holdExport = true;
    button("chat.export").click();
    await until(() => releaseExport, "export dispatched");
    render(project, second);
    await tick();
    releaseExport();
    await tick();
    await tick();
    assert(downloads.length === 0 && exports.length === 1, "no late file or next page");
  });
  await group("deletion requires explicit confirmation and cancel has no side effect", async () => {
    fixture();
    await mount();
    button("chat.erase").click();
    await until(() => document.querySelector('[role="alertdialog"]'), "dialog opened");
    assert(
      document.body.textContent.includes(t("chat.eraseHelp")),
      "permanent scope and already-started work explained",
    );
    button("common.cancel", document.querySelector('[role="alertdialog"]')).click();
    await tick();
    assert(
      erasures.length === 0 && text().includes("PRIVATE_REPLY_23"),
      "cancel preserves history",
    );
  });
  await group(
    "confirmed deletion hides content, purges exact caches and replaces the bookmark",
    async () => {
      fixture();
      await mount();
      const key = [
        "milo-draft-proposal",
        actor,
        actor,
        "p",
        target.conversationId,
        "turn",
        "proposal",
      ];
      const unrelated = ["milo-draft-proposal", actor, actor, "q", second, "turn", "proposal"];
      client.setQueryData(key, { private: "old fields" });
      client.setQueryData(unrelated, { safe: "other client" });
      button("chat.erase").click();
      await until(() => document.querySelector('[role="alertdialog"]'), "dialog");
      const action = button("chat.erase", document.querySelector('[role="alertdialog"]'));
      action.click();
      action.click();
      await until(() => text().includes(t("chat.erased")), "confirmed deletion shown");
      assert(
        erasures.length === 1 && JSON.stringify(erasures[0]) === JSON.stringify(target),
        "one exact ID-only deletion",
      );
      assert(
        !text().includes("PRIVATE_TITLE") && !text().includes("PRIVATE_REPLY_23"),
        "deleted content absent",
      );
      assert(
        !client.getQueryData(key) && client.getQueryData(unrelated),
        "only matching private proposal removed",
      );
      assert(
        locations.at(-1).id === "new" && locations.at(-1).replace,
        "deleted bookmark replaced",
      );
    },
  );
  await group(
    "lost deletion response stays unconfirmed and recovers the same identity",
    async () => {
      fixture();
      await mount();
      loseErase = true;
      await confirm();
      await until(() => text().includes(t("chat.eraseUnconfirmed")), "uncertain result");
      assert(
        !document.querySelector("textarea") && !text().includes("PRIVATE_REPLY_23"),
        "private content and composer withheld",
      );
      assert(button("chat.export").disabled, "no export of uncertain state");
      await tick();
      assert(
        erasures.length === 1 && !text().includes(t("chat.erased")),
        "no automatic erasure retry or false completion",
      );
      loseErase = false;
      button("chat.eraseRetry").click();
      await until(() => text().includes(t("chat.erased")), "explicit erasure recovery");
      assert(JSON.stringify(erasures[0]) === JSON.stringify(erasures[1]), "same immutable target");
    },
  );
  await group(
    "lost client access hides cached content but allows erasing the selected own history",
    async () => {
      fixture();
      await mount();
      denied = true;
      await client.refetchQueries({ queryKey: ["milo-conversation", actor, actor, "p"] });
      await tick();
      assert(
        !text().includes("PRIVATE_TITLE") && !text().includes("PRIVATE_REPLY_23"),
        "cached private data hidden",
      );
      assert(button("chat.export").disabled, "no unauthorized export");
      await confirm();
      await until(() => text().includes(t("chat.erased")), "own history erased after lost access");
      assert(erasures.length === 1, "one own erasure");
    },
  );
  await group("late deletion cannot replace a newer same-client conversation", async () => {
    fixture();
    await mount();
    holdErase = true;
    await confirm();
    await until(() => releaseErase, "erase dispatched");
    render(project, second);
    await until(() => text().includes("PRIVATE_REPLY_23"), "second conversation ready");
    locations = [];
    releaseErase();
    await tick();
    await tick();
    assert(
      !locations.some((item) => item.id === "new"),
      "late result cannot navigate new selection",
    );
    assert(!text().includes(t("chat.erased")), "no success attached to wrong conversation");
  });
  await group(
    "a late draft-save response cannot recreate erased private proposal data",
    async () => {
      fixture();
      const proposalId = "20000000-0000-4000-8000-000000000001";
      const turn = turns.at(-1);
      turn.events.unshift({
        kind: "tool",
        role: "seo",
        tool: "draft_metadata_proposal",
        code: "tool_result",
        state: "approval_required",
        text: "",
        operationId: proposalId,
        reference: { kind: "draft_proposal", id: proposalId },
      });
      const view = {
        ...target,
        actorId: actor,
        turnId: turn.turnId,
        proposalId,
        assetId: "a",
        before: { metaTitle: "PRIVATE_BEFORE" },
        fields: { metaTitle: "PRIVATE_AFTER" },
        explanation: "PRIVATE_PROPOSAL",
        state: "ready",
        createdAt: stamp,
        appliedAt: null,
      };
      let finishSave;
      window.h.proposalRead = async () => structuredClone(view);
      window.h.proposalApply = async () => {
        await new Promise((resolve) => {
          finishSave = resolve;
        });
        return { ...view, state: "applied", appliedAt: stamp };
      };
      await mount();
      button("chat.proposal.review").click();
      await until(() => text().includes("PRIVATE_AFTER"), "proposal shown");
      await until(
        () => button("setup.saveChanges") && !button("setup.saveChanges").disabled,
        "save enabled",
      );
      button("setup.saveChanges").click();
      await until(() => finishSave, "save already dispatched");
      await confirm();
      await until(
        () => text().includes(t("chat.erased")),
        "conversation erased while response outstanding",
      );
      finishSave();
      await tick();
      await tick();
      const cache = client.getQueryData([
        "milo-draft-proposal",
        actor,
        actor,
        "p",
        target.conversationId,
        turn.turnId,
        proposalId,
      ]);
      assert(
        !cache && !text().includes("PRIVATE_AFTER"),
        "late receipt cannot restore private proposal",
      );
    },
  );
  await group("queued deletion is dropped on departure before dispatch", async () => {
    fixture();
    await mount();
    const releases = [];
    const waits = [1, 2].map(() =>
      runTeamRequest(() => new Promise((resolve) => releases.push(resolve))),
    );
    await until(() => releases.length === 2, "queue slots held");
    await confirm();
    await tick();
    render(project, second);
    await tick();
    releases.forEach((resolve) => resolve());
    await Promise.all(waits);
    await tick();
    await tick();
    assert(erasures.length === 0, "unmounted queued mutation never sent");
  });
  fixture();
  await mount();
  document.getElementById("results").textContent = JSON.stringify({ locale, results }, null, 2);
  window.lifecycleBrowserResults = { locale, results };
}
run().catch((error) => {
  document.getElementById("results").textContent = `FAIL ${error.stack}\n${results.join("\n")}`;
  window.lifecycleBrowserResults = { error: String(error), results };
});
