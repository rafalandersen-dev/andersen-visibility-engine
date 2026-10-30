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
/** The fixture's held send: saves a running turn and resolves when `finish()` runs. */
function heldSend(input) {
  sendCalls.push(structuredClone(input));
  conv = input.conversationId;
  const turn = {
    ...completed(input.body, saved.length + 1),
    turnId: input.turnId,
    state: "running",
    allowDraftGeneration: input.allowDraftGeneration,
    allowProviderChecks: input.allowProviderChecks,
    events: [],
  };
  saved = [...saved, turn];
  return new Promise((resolve) => {
    finish = () => {
      Object.assign(turn, { state: "completed", events: completed().events });
      resolve({ turn });
    };
  });
}
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
    send: heldSend,
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
        canConsentChecks={true}
        onOpenResult={(event) => results.push({ opened: event.reference })}
      />
    </QueryClientProvider>,
  );
  await until(
    () => !!document.querySelector("textarea") && document.querySelector("textarea") !== previous,
    "fresh composer mounted",
  );
}
/** CR: the real workspace with a live URL location, so promotion and remounts are
 * observable. `consent` stands in for a working-role change. */
let routed = { locations: [], location: "new", setConsent: undefined };
function Routed({ p }) {
  const [location, setLocation] = React.useState("new");
  const [consent, setConsent] = React.useState(true);
  routed.setConsent = setConsent;
  return (
    <MiloConversationWorkspace
      actorId={actor}
      project={p}
      canConsentChecks={consent}
      location={location}
      onLocationChange={(next) => {
        routed.locations.push(next);
        routed.location = next;
        setLocation(next);
      }}
      onOpenResult={() => {}}
    />
  );
}
async function mountRouted(p = project) {
  const previous = document.querySelector("textarea");
  routed = { locations: [], location: "new", setConsent: undefined };
  client?.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root.render(
    <QueryClientProvider client={client}>
      <Routed key={++mountId} p={p} />
    </QueryClientProvider>,
  );
  await until(
    () => !!document.querySelector("textarea") && document.querySelector("textarea") !== previous,
    "routed composer mounted",
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
    const [generationBox, checksBox] = document.querySelectorAll('input[type="checkbox"]');
    generationBox.click();
    checksBox.click();
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
        sendCalls[0].allowProviderChecks === true &&
        sendCalls[0].ownerId === actor &&
        !Object.hasOwn(sendCalls[0], "actorId"),
      "immutable scope, generation and site-check consent",
    );
    assert(document.querySelector("form").getAttribute("aria-busy") === "true", "composer busy");
    assert(!document.querySelector("img"), "message is text, never executable HTML");
    finish();
    await until(
      () => text().includes("The saved draft has two section headings"),
      "saved response visible",
    );
    assert(
      text().includes(t("chat.generationEnabled")) &&
        text().includes(t("chat.providerChecksEnabled")),
      "message records both consents",
    );
    assert(
      [...document.querySelectorAll('input[type="checkbox"]')].every((box) => !box.checked),
      "consent is per request and clears after sending",
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
      assert(button("chat.send").disabled, "unconfirmed history cannot accept another task");
      const list = window.h.list;
      let recoveryReads = 0;
      window.h.list = async () => {
        recoveryReads++;
        throw Error("Fresh directory authorization unavailable");
      };
      button("chat.new").click();
      await until(
        () => recoveryReads === 1 && !document.querySelector("textarea"),
        "new-conversation recovery requires fresh directory authorization",
      );
      assert(!document.querySelector("aside ul"), "failed recovery cannot reveal cached titles");
      window.h.list = list;
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
      [...document.querySelectorAll('input[type="checkbox"]')]
        .map((box) => box.labels[0].textContent)
        .join("|") === t("conversationStart.consent.checksLabel") &&
        document
          .querySelector('[data-consent="checks"] details')
          .textContent.includes(t("chat.allowProviderChecks")) &&
        !document.querySelector('[data-consent="generation"]'),
      "collaborator may consent to site checks but has no generation control",
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
  await group(
    "CR first-message busy keeps text, identical Try again, no URL or history read before confirmation",
    async () => {
      fixtures();
      const reads = [];
      const read = window.h.read;
      window.h.read = async (input) => {
        reads.push(input.conversationId);
        return read(input);
      };
      await mountRouted();
      window.h.send = async (input) => {
        sendCalls.push(structuredClone(input));
        assert(reads.length === 0, "no history read races the first begin");
        return { notSaved: "busy" };
      };
      await input("First message after a busy admission");
      button("chat.send").click();
      await until(() => text().includes(t("chat.notSavedBusy")), "confirmed rollback is explained");
      const first = sendCalls[0];
      assert(routed.locations.length === 0 && routed.location === "new", "URL not promoted");
      assert(reads.length === 0, "nonexistent conversation never read");
      assert(
        document.querySelector("textarea").value === first.body && !button("chat.recover"),
        "text kept; no uncertain-recovery banner for a known rollback",
      );
      window.h.send = (input) => {
        assert(reads.length === 0, "no history read while the retry begin is in flight");
        return heldSend(input);
      };
      button("common.retry").click();
      await until(() => sendCalls.length === 2 && !!finish, "Try again dispatched");
      assert(JSON.stringify(sendCalls[1]) === JSON.stringify(first), "identical immutable request");
      assert(routed.location === "new", "still not promoted while unconfirmed");
      finish();
      await until(
        () =>
          routed.location === first.conversationId &&
          reads.includes(first.conversationId) &&
          text().includes("The saved draft has two section headings"),
        "confirmed save promotes the URL and then reads history",
      );
      assert(document.querySelector("textarea").value === "", "composer cleared only on save");
      assert(sendCalls.length === 2, "no further dispatch");
    },
  );
  await group(
    "CR directory failure conceals, then reveals the same uncertain request and recovers it identically",
    async () => {
      fixtures();
      await mountRouted();
      window.h.send = async (input) => {
        sendCalls.push(structuredClone(input));
        throw Error("connection lost");
      };
      await input("Unknown outcome must survive a directory failure");
      button("chat.send").click();
      await until(() => !!button("chat.recover"), "uncertain recovery offered");
      const first = sendCalls[0];
      assert(routed.location === "new", "uncertain first message is not promoted");
      await tick();
      assert(
        ![...document.querySelectorAll('[role="alert"]')].some((n) =>
          n.textContent.includes(t("chat.unavailable")),
        ),
        "an unconfirmed new conversation is not reported as lost access",
      );
      const list = window.h.list;
      window.h.list = async () => {
        throw Error("directory authorization unavailable");
      };
      await client.invalidateQueries({ predicate: (q) => q.queryKey.includes("directory") });
      await until(
        () =>
          text().includes(t("chat.unavailable")) &&
          !document.querySelector("textarea") &&
          !text().includes(first.body) &&
          !button("chat.recover"),
        "private request, composer and recovery concealed",
      );
      window.h.list = list;
      await client.invalidateQueries({ predicate: (q) => q.queryKey.includes("directory") });
      await until(
        () => !!button("chat.recover") && document.querySelector("textarea")?.value === first.body,
        "same in-memory request revealed after fresh authorization",
      );
      window.h.send = heldSend;
      button("chat.recover").click();
      await until(() => sendCalls.length === 2 && !!finish, "recovery dispatched");
      assert(
        JSON.stringify(sendCalls[1]) === JSON.stringify(first),
        "identical immutable recovery",
      );
      finish();
      await until(
        () => routed.location === first.conversationId && text().includes(first.body),
        "recovered request saved and promoted",
      );
    },
  );
  await group(
    "CR a busy recovery of a lost-response send stays uncertain with the same request",
    async () => {
      fixtures();
      let readable = false;
      const read = window.h.read;
      window.h.read = async (input) => {
        if (!readable) throw Error("history read refused");
        return read(input);
      };
      await mountRouted();
      // The original attempt commits (synthetic saved turn) but its response is lost.
      window.h.send = async (input) => {
        void heldSend(input);
        throw Error("response lost after commit");
      };
      await input("Committed, but the browser never heard back");
      button("chat.send").click();
      await until(() => !!button("chat.recover"), "uncertain recovery offered");
      const first = sendCalls[0];
      assert(saved.length === 1, "the original attempt did commit");
      // Recovery cannot acquire admission: this attempt alone rolled back.
      window.h.send = async (input) => {
        sendCalls.push(structuredClone(input));
        return { notSaved: "busy" };
      };
      button("chat.recover").click();
      await until(() => sendCalls.length === 2, "recovery attempted");
      await tick();
      await tick();
      assert(JSON.stringify(sendCalls[1]) === JSON.stringify(first), "identical recovery request");
      assert(!text().includes(t("chat.notSavedBusy")), "no claim that nothing was saved");
      assert(!!button("chat.recover") && !button("common.retry"), "still recoverable as uncertain");
      assert(
        document.querySelector("textarea").value === first.body && button("chat.send").disabled,
        "text kept and a new task cannot be sent alongside the unknown one",
      );
      assert(routed.location === "new", "an unknown first message is still not bookmarked");
      // Later the same request is confirmed (idempotent begin returns the saved turn).
      readable = true;
      window.h.send = async (input) => {
        sendCalls.push(structuredClone(input));
        return { turn: saved.find((turn) => turn.turnId === input.turnId) };
      };
      button("chat.recover").click();
      await until(
        () => routed.location === first.conversationId && text().includes(first.body),
        "later recovery confirms the original turn and promotes it",
      );
      assert(JSON.stringify(sendCalls[2]) === JSON.stringify(first), "same request again");
      assert(saved.length === 1, "exactly one saved turn; nothing duplicated");
      finish();
      await until(
        () => text().includes("The saved draft has two section headings"),
        "the original turn's result appears",
      );
    },
  );
  await group(
    "CR directory failure while the send is in flight keeps and confirms it",
    async () => {
      fixtures();
      await mountRouted();
      await input("Directory fails during this send");
      button("chat.send").click();
      await until(() => !!finish, "send in flight");
      const first = sendCalls[0];
      const list = window.h.list;
      window.h.list = async () => {
        throw Error("directory authorization unavailable");
      };
      await client.invalidateQueries({ predicate: (q) => q.queryKey.includes("directory") });
      await until(
        () => text().includes(t("chat.unavailable")) && !text().includes(first.body),
        "concealed while sending",
      );
      finish();
      await tick();
      await tick();
      assert(!text().includes(first.body), "a late save never reveals while authorization fails");
      window.h.list = list;
      await client.invalidateQueries({ predicate: (q) => q.queryKey.includes("directory") });
      await until(
        () =>
          text().includes("The saved draft has two section headings") &&
          text().includes(first.body),
        "fresh authorization reveals the confirmed turn",
      );
      assert(sendCalls.length === 1, "no duplicate dispatch");
      assert(routed.location === first.conversationId, "confirmed conversation promoted");
    },
  );
  await group("CR a consent-role change discards retained private request state", async () => {
    fixtures();
    await mountRouted();
    window.h.send = async (input) => {
      sendCalls.push(structuredClone(input));
      throw Error("connection lost");
    };
    await input("Must not survive a role change");
    button("chat.send").click();
    await until(() => !!button("chat.recover"), "uncertain recovery offered");
    routed.setConsent(false);
    await until(
      () => !button("chat.recover") && document.querySelector("textarea")?.value === "",
      "role change remounts with no retained request",
    );
    assert(!text().includes("Must not survive a role change"), "no private text across roles");
    assert(sendCalls.length === 1, "nothing replayed");
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
