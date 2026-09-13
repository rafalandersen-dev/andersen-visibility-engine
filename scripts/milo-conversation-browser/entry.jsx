import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MiloConversationWorkspace } from "./src/components/MiloConversationWorkspace";
import { t, locale } from "@/i18n";
const root = createRoot(document.getElementById("root")),
  results = [];
const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  conversationId = "00000000-0000-4000-8000-000000000003";
const project = { ownerId: actor, projectId: "p", name: "Acme — saved project" };
const date = "2026-09-13T12:00:00Z";
let client,
  mountId = 0,
  saved = [],
  conv = conversationId,
  sendCalls = [],
  finish,
  denied = false,
  selectedProject = project;
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
const assert = (value, message) => {
  if (!value) throw Error(message);
};
async function until(check, message) {
  for (let i = 0; i < 120; i++) {
    if (check()) return;
    await tick();
  }
  throw Error(message);
}
const button = (key) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent === t(key));
const text = () => document.getElementById("root").textContent;
const completed = (body = "Review my saved draft", number = 1) => ({
  turnId: crypto.randomUUID(),
  ordinal: number,
  body,
  locale,
  state: "completed",
  events: [
    {
      kind: "handoff",
      role: "lead",
      text: "The SEO specialist is taking over with this project's saved draft.",
    },
    {
      kind: "tool",
      role: "seo",
      tool: "draft_seo_review",
      state: "completed",
      text: '{"fixture-private-internal":"not a product message"}',
      reference: { kind: "draft", id: "a" },
      operationId: crypto.randomUUID(),
    },
    {
      kind: "assistant",
      role: "seo",
      text: "The saved draft has two section headings. Add a clear description for readers. This is a structural review of the saved draft.",
    },
  ],
  createdAt: date,
  updatedAt: date,
});
function fixtures(turns = []) {
  saved = turns;
  conv = conversationId;
  sendCalls = [];
  denied = false;
  finish = undefined;
  window.h = {
    list: async (input) => {
      if (denied) throw Error("access denied");
      return {
        actorId: actor,
        ownerId: input.ownerId,
        projectId: input.projectId,
        conversations: saved.length
          ? [
              {
                conversationId: conv,
                title: saved[0].body.slice(0, 200),
                turnCount: saved.length,
                createdAt: date,
                updatedAt: date,
              },
            ]
          : [],
      };
    },
    read: async (input) => {
      if (denied || !saved.length) throw Error("unavailable");
      return {
        actorId: actor,
        ownerId: input.ownerId,
        projectId: input.projectId,
        conversationId: input.conversationId,
        title: saved[0].body.slice(0, 200),
        turnCount: saved.length,
        turns: saved.slice(input.after, input.after + 20),
        nextAfter: Math.min(input.after + 20, saved.length),
        hasMore: input.after + 20 < saved.length,
      };
    },
    send: (input) => {
      sendCalls.push(structuredClone(input));
      conv = input.conversationId;
      const turn = {
        ...completed(input.body, saved.length + 1),
        turnId: input.turnId,
        state: "running",
        allowDraftGeneration: input.allowDraftGeneration,
        events: [],
      };
      saved = [...saved, turn];
      return new Promise((resolve) => {
        finish = () => {
          Object.assign(turn, { state: "completed", events: completed().events });
          resolve({ turn });
        };
      });
    },
    resume: async (input) => {
      const turn = saved.find((turn) => turn.turnId === input.turnId);
      turn.state = "completed";
      turn.events = completed().events;
      return { turn };
    },
    cancel: async (input) => {
      const turn = saved.find((turn) => turn.turnId === input.turnId);
      if (!turn) throw Error("missing");
      turn.state = "cancelled";
      return { turn };
    },
  };
}
async function mount(p = project) {
  selectedProject = p;
  const previous = document.querySelector("textarea");
  client?.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root.render(
    <QueryClientProvider client={client}>
      <MiloConversationWorkspace
        key={++mountId}
        actorId={actor}
        project={p}
        onOpenResult={(event) => results.push({ opened: event.reference })}
      />
    </QueryClientProvider>,
  );
  await until(
    () => !!document.querySelector("textarea") && document.querySelector("textarea") !== previous,
    "fresh composer mounted",
  );
}
async function input(value) {
  const field = document.querySelector("textarea");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}
const refresh = async () => {
  await client.invalidateQueries();
  await tick();
};
async function group(name, work) {
  await work();
  results.push({ name, passed: true });
}
async function run() {
  await group("send, duplicate suppression, actual retained handoff and result link", async () => {
    fixtures();
    await mount();
    await input("Review this draft <img src=x onerror=alert(1)> safely.");
    const box = document.querySelector('input[type="checkbox"]');
    box.click();
    await tick();
    document
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    document
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await until(() => sendCalls.length === 1, "one request dispatched");
    await refresh();
    assert(
      sendCalls[0].allowDraftGeneration === true &&
        sendCalls[0].ownerId === actor &&
        !Object.hasOwn(sendCalls[0], "actorId"),
      "immutable scope and generation choice",
    );
    assert(document.querySelector("form").getAttribute("aria-busy") === "true", "composer busy");
    assert(!document.querySelector("img"), "message is text, never executable HTML");
    finish();
    await until(
      () => text().includes("The saved draft has two section headings"),
      "saved response visible",
    );
    assert(
      text().includes(t("team.role.seo")) && text().includes(t("team.role.lead")),
      "named specialists",
    );
    assert(
      !text().includes("fixture-private-internal") && !text().includes("operationId"),
      "internal evidence stays out of flow",
    );
    button("chat.openContext").click();
    assert(results.at(-1).opened.id === "a", "actual result target");
  });
  await group("reload reads saved work without model dispatch", async () => {
    const calls = sendCalls.length;
    await mount();
    await until(
      () => text().includes("The saved draft has two section headings"),
      "history restored",
    );
    assert(sendCalls.length === calls, "reload never dispatches");
    assert(!text().includes(t("chat.running")), "terminal work has no stale running label");
  });
  await group(
    "history-only failure also hides cached conversation titles until recovery",
    async () => {
      const read = window.h.read;
      window.h.read = async () => {
        throw Error("history read unavailable");
      };
      await client.invalidateQueries({ predicate: (query) => query.queryKey.includes("history") });
      await until(
        () => !document.querySelector("aside ul"),
        "cached conversation directory hidden after failed history read",
      );
      assert(
        !text().includes(saved[0].body) &&
          !text().includes("The saved draft has two section headings"),
        "private title and response both hidden",
      );
      assert(
        button("chat.new").disabled && button("chat.send").disabled,
        "new work waits for status recovery",
      );
      window.h.read = read;
      await refresh();
      await until(
        () =>
          !!document.querySelector("aside ul") &&
          text().includes("The saved draft has two section headings"),
        "confirmed history restores conversation directory",
      );
    },
  );
  await group("failed refresh hides history and disables new work", async () => {
    denied = true;
    await refresh();
    await until(
      () => !text().includes("The saved draft has two section headings"),
      "private stale answer hidden",
    );
    assert(text().includes(t("chat.unavailable")), "access failure visible");
    assert(!document.querySelector("textarea"), "composer removed on directory failure");
  });
  await group("late response cannot cross into another client", async () => {
    fixtures();
    await mount();
    await input("Old client task");
    button("chat.send").click();
    await until(() => !!finish, "original send started");
    const oldFinish = finish;
    const p = { ownerId: other, projectId: "p", name: "Different client, same project ID" };
    fixtures([completed("Second client saved task")]);
    await mount(p);
    await until(() => text().includes("Second client saved task"), "new client read");
    oldFinish();
    await tick();
    await tick();
    assert(
      text().includes(p.name) && !text().includes("Old client task"),
      "late request scoped to unmounted client",
    );
    assert(
      !document.querySelector('input[type="checkbox"]'),
      "collaborator cannot grant generation",
    );
  });
  await group("pending recovery and explicit cancellation", async () => {
    fixtures([{ ...completed(), state: "pending", events: [] }]);
    await mount();
    await until(() => button("chat.resume"), "pending resume offered");
    button("chat.resume").click();
    await until(() => text().includes(t("chat.completed")), "saved request resumed");
    saved = [{ ...completed("Cancellation task"), state: "running", events: [] }];
    await refresh();
    await until(() => button("chat.stop"), "stop available");
    button("chat.stop").click();
    await until(() => text().includes(t("chat.cancelled")), "cancelled state observed");
    assert(!button("chat.stop"), "no stale stop after cancellation");
  });
  await group("uncertain submission recovers the same immutable request", async () => {
    fixtures();
    await mount();
    window.h.send = async (input) => {
      sendCalls.push(structuredClone(input));
      throw Error("connection lost");
    };
    await input("Recover exactly this task");
    button("chat.send").click();
    await until(() => button("chat.recover"), "recovery offered");
    button("chat.recover").click();
    await until(() => sendCalls.length === 2, "recovery call made");
    assert(
      JSON.stringify(sendCalls[0]) === JSON.stringify(sendCalls[1]),
      "same turn, text, scope and generation flag",
    );
  });
  await group("keyboard, UTF-8 bounds and long-history pagination", async () => {
    fixtures();
    await mount();
    await input("ą".repeat(4001));
    assert(
      button("chat.send").disabled &&
        document.querySelector("textarea").getAttribute("aria-invalid") === "true",
      "UTF-8 limit shown",
    );
    await input("Keyboard task");
    document
      .querySelector("textarea")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    await until(() => sendCalls.length === 1, "keyboard send");
    finish();
    await tick();
    fixtures(Array.from({ length: 21 }, (_, i) => completed(`Task ${i + 1}`, i + 1)));
    await mount();
    await until(
      () => text().includes("Task 21") && !text().includes("Task 20"),
      "latest page selected",
    );
    const previous = [...document.querySelectorAll("button")]
      .filter((node) => node.textContent === t("collaboration.previous") && !node.disabled)
      .at(-1);
    previous.click();
    await until(() => text().includes("Task 20"), "older page loaded");
    await input("Cannot send from incomplete history");
    assert(button("chat.send").disabled, "older page cannot send");
    button("chat.latest").click();
    await until(
      () => text().includes("Task 21") && !text().includes("Task 20"),
      "return to latest",
    );
  });
  await group("long project names and messages stay within the viewport", async () => {
    const long = completed("LongMessage".repeat(500));
    long.events.at(-1).text = "LongAnswer".repeat(400);
    fixtures([long]);
    await mount({ ...project, name: "ClientName".repeat(60) });
    await until(() => text().includes("LongAnswer"), "long reply read");
    assert(
      document.getElementById("root").scrollWidth <= window.innerWidth,
      "conversation has no horizontal overflow",
    );
    const field = document.querySelector("textarea");
    assert(
      document.querySelector(`label[for="${CSS.escape(field.id)}"]`) &&
        document.getElementById(field.getAttribute("aria-describedby")),
      "composer has label and help",
    );
  });
  fixtures([completed("Improve our next article while keeping the client requirements.")]);
  await mount(project);
  await until(() => text().includes("The saved draft has two section headings"), "final preview");
  document.getElementById("results").textContent = JSON.stringify(
    { locale, completed: true, results },
    null,
    2,
  );
}
run().catch((error) => {
  document.getElementById("results").textContent = JSON.stringify(
    { locale, completed: false, error: error.message, results },
    null,
    2,
  );
});
