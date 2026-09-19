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
const project = { ownerId: actor, projectId: "p", name: "Proposal client" };
const target = {
  ownerId: actor,
  projectId: "p",
  conversationId: "00000000-0000-4000-8000-000000000003",
  turnId: "00000000-0000-4000-8000-000000000004",
  proposalId: "00000000-0000-4000-8000-000000000005",
};
const date = "2026-09-13T12:00:00Z";
let client,
  mounted = 0,
  view,
  readCalls,
  applyCalls,
  readsDenied,
  loseResponse,
  rejectApply,
  heldRead,
  releaseRead;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const text = () => document.getElementById("root").textContent;
const button = (key) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent === t(key));
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
function fixture() {
  readCalls = [];
  applyCalls = [];
  readsDenied = false;
  loseResponse = false;
  rejectApply = false;
  heldRead = false;
  releaseRead = undefined;
  view = {
    ...target,
    actorId: actor,
    assetId: "draft",
    explanation: "PROPOSAL_EXPLANATION",
    before: {
      title: "Original title",
      h1: "",
      metaTitle: "Before title",
      metaDescription: "Before description",
    },
    fields: {
      title: "Better title",
      h1: "Proposed heading",
      metaTitle: '<img src=x onerror="window.proposalInjected=true">',
      metaDescription: "PROPOSED_DESCRIPTION_".repeat(120),
    },
    state: "ready",
    createdAt: date,
    appliedAt: null,
  };
  const turn = {
    turnId: target.turnId,
    ordinal: 1,
    body: "Improve the metadata of my draft",
    locale,
    state: "completed",
    createdAt: date,
    updatedAt: date,
    events: [
      {
        kind: "tool",
        role: "seo",
        tool: "draft_metadata_proposal",
        code: "tool_result",
        state: "approval_required",
        text: "Internal receipt, never display this",
        operationId: target.proposalId,
        reference: { kind: "draft_proposal", id: target.proposalId },
      },
      { kind: "assistant", role: "seo", text: "Review the proposed changes before saving." },
    ],
  };
  window.h = {
    list: async (input) => ({
      actorId: actor,
      ownerId: input.ownerId,
      projectId: input.projectId,
      conversations: [
        {
          conversationId: target.conversationId,
          title: turn.body,
          turnCount: 1,
          createdAt: date,
          updatedAt: date,
        },
      ],
    }),
    read: async (input) => ({
      actorId: actor,
      ownerId: input.ownerId,
      projectId: input.projectId,
      conversationId: target.conversationId,
      title: turn.body,
      turnCount: 1,
      turns: [structuredClone(turn)],
      nextAfter: 1,
      hasMore: false,
    }),
    send: async () => {
      throw Error("Unexpected paid task");
    },
    proposalRead: async (input) => {
      readCalls.push(structuredClone(input));
      if (readsDenied) throw Error("Denied");
      const result = structuredClone(view);
      if (heldRead)
        await new Promise((resolve) => {
          releaseRead = resolve;
        });
      return result;
    },
    proposalApply: async (input) => {
      applyCalls.push(structuredClone(input));
      if (rejectApply) {
        view.state = "unavailable";
        throw Error("Version changed");
      }
      view.state = "applied";
      view.appliedAt = date;
      turn.events.push({
        ...turn.events[0],
        state: "completed",
        role: "lead",
        text: "User-save receipt",
      });
      if (loseResponse) throw Error("Response lost after commit");
      return structuredClone(view);
    },
  };
  return turn;
}
async function mount(scope = project) {
  root.render(null);
  await tick();
  client?.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root.render(
    <QueryClientProvider client={client}>
      <MiloConversationWorkspace
        key={++mounted}
        actorId={actor}
        project={scope}
        onOpenResult={() => {
          throw Error("Unexpected legacy result navigation");
        }}
      />
    </QueryClientProvider>,
  );
  await until(() => button("chat.proposal.review"), "proposal receipt rendered");
}
async function open() {
  button("chat.proposal.review").click();
  await until(() => text().includes("PROPOSAL_EXPLANATION"), "exact proposal loaded");
  await until(() => !button("benchmark.refresh").disabled, "read settled");
}
async function group(name, fn) {
  await fn();
  results.push(`PASS ${name}`);
  document.getElementById("results").textContent = results.join("\n");
}
async function run() {
  await group(
    "lazy private read, exact before/after, escaped text and responsive bounds",
    async () => {
      fixture();
      await mount();
      assert(readCalls.length === 0, "collapsed proposal must not read");
      await open();
      assert(document.querySelectorAll("dt").length === 4, "all four changed fields shown");
      assert(
        text().includes(view.fields.metaDescription),
        "full proposed description, no clipping",
      );
      assert(text().includes(view.fields.metaTitle), "literal model HTML shown as text");
      assert(
        !window.proposalInjected && !document.querySelector('img[src="x"]'),
        "model HTML never executes",
      );
      assert(!text().includes("Internal receipt"), "internal event hidden");
      assert(
        document.documentElement.scrollWidth <= window.innerWidth + 1,
        "no horizontal page overflow",
      );
      const link = [...document.querySelectorAll("a")].find(
        (node) => node.textContent === t("chat.openContext"),
      );
      assert(
        link.getAttribute("href") === `/app/collaborators?owner=${actor}&project=p&asset=draft`,
        "exact scoped fresh draft link",
      );
    },
  );
  await group("explicit save, synchronous duplicate guard, identity-only payload", async () => {
    const save = button("setup.saveChanges");
    save.click();
    save.click();
    await until(() => text().includes(t("chat.proposal.applied")), "applied status shown");
    assert(applyCalls.length === 1, "one explicit apply");
    assert(
      JSON.stringify(applyCalls[0]) === JSON.stringify(target),
      "no patch, hash, role or actor supplied by browser",
    );
    assert(!button("setup.saveChanges"), "applied proposal cannot be saved again");
    await client.refetchQueries({ queryKey: ["milo-conversation", actor, actor, "p"] });
    await tick();
    assert(
      document.querySelectorAll("dt").length === 4 && text().includes(t("chat.proposal.applied")),
      "history application receipt preserves one open review card",
    );
    assert(!button("chat.proposal.review"), "background history refresh never closes the review");
    await mount();
    await open();
    assert(text().includes(t("chat.proposal.applied")), "remount recovers retained application");
    assert(applyCalls.length === 1, "remount reads without replay");
  });
  await group(
    "lost apply response requires a fresh read and recovers the same commit",
    async () => {
      fixture();
      loseResponse = true;
      await mount();
      await open();
      button("setup.saveChanges").click();
      await until(
        () => text().includes(t("chat.proposal.unconfirmed")),
        "uncertain save explained",
      );
      assert(
        !button("setup.saveChanges") || button("setup.saveChanges").disabled,
        "uncertain save cannot repeat",
      );
      await until(() => !button("benchmark.refresh").disabled, "automatic read settled");
      button("benchmark.refresh").click();
      await until(
        () =>
          !text().includes(t("chat.proposal.unconfirmed")) &&
          text().includes(t("chat.proposal.applied")),
        "fresh read confirms original save",
      );
      assert(applyCalls.length === 1, "no apply replay during recovery");
    },
  );
  await group("version change between review and save rejects overwrite", async () => {
    fixture();
    rejectApply = true;
    await mount();
    await open();
    button("setup.saveChanges").click();
    await until(
      () => text().includes(t("chat.proposal.unconfirmed")),
      "race is uncertain until read",
    );
    await until(() => !button("benchmark.refresh").disabled, "read settled");
    button("benchmark.refresh").click();
    await until(
      () =>
        text().includes(t("chat.proposal.unavailable")) &&
        !text().includes(t("chat.proposal.unconfirmed")),
      "changed proposal withheld",
    );
    assert(
      button("setup.saveChanges").disabled && applyCalls.length === 1,
      "stale proposal cannot be saved",
    );
  });
  await group("failed refresh hides cached private fields and prevents saving", async () => {
    fixture();
    await mount();
    await open();
    readsDenied = true;
    button("benchmark.refresh").click();
    await until(() => text().includes(t("chat.unavailable")), "read failure shown");
    assert(
      !text().includes("PROPOSAL_EXPLANATION") &&
        !text().includes("Before title") &&
        !text().includes("Better title"),
      "cached proposal fields withheld",
    );
    assert(!button("setup.saveChanges"), "no cached save authority");
    readsDenied = false;
    button("benchmark.refresh").click();
    await until(
      () => button("setup.saveChanges") && !button("setup.saveChanges").disabled,
      "fresh read restores review",
    );
  });
  await group("waiting, withdrawn and wrong-actor responses never authorize apply", async () => {
    for (const state of ["waiting", "unavailable"]) {
      fixture();
      view.state = state;
      await mount();
      await open();
      assert(button("setup.saveChanges").disabled, `${state} cannot apply`);
    }
    fixture();
    view.actorId = other;
    await mount();
    button("chat.proposal.review").click();
    await until(() => text().includes(t("chat.unavailable")), "wrong actor response denied");
    assert(!text().includes("PROPOSAL_EXPLANATION"), "foreign actor payload hidden");
  });
  await group("late previous-client response never appears after a scope switch", async () => {
    fixture();
    heldRead = true;
    await mount();
    button("chat.proposal.review").click();
    await until(() => releaseRead, "old read pending");
    const release = releaseRead;
    await mount({ ownerId: other, projectId: "p", name: "Other client" });
    release();
    await tick();
    await tick();
    assert(
      !text().includes("PROPOSAL_EXPLANATION"),
      "late private result hidden in another client",
    );
  });
  await group("queued apply is dropped when the conversation unmounts", async () => {
    fixture();
    await mount();
    await open();
    let first, second;
    const jobs = [
      runTeamRequest(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      ),
      runTeamRequest(
        () =>
          new Promise((resolve) => {
            second = resolve;
          }),
      ),
    ];
    await until(() => first && second, "queue occupied");
    button("setup.saveChanges").click();
    await tick();
    root.render(null);
    await tick();
    first();
    second();
    await Promise.all(jobs);
    await tick();
    await tick();
    assert(applyCalls.length === 0, "departed conversation cannot dispatch queued mutation");
    await mount();
    await open();
  });
  document.getElementById("results").textContent =
    `${results.join("\n")}\n${results.length}/${results.length} PASS (${locale})`;
}
run().catch((error) => {
  document.getElementById("results").textContent = `${results.join("\n")}\nFAIL ${error.stack}`;
});
