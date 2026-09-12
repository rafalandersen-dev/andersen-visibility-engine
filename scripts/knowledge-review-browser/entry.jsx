import React from "react";
import { createRoot } from "react-dom/client";
import { KnowledgeOutputInspection } from "./src/components/KnowledgeOutputInspection";
const root = createRoot(document.getElementById("root"));
const results = [];
const tick = () => new Promise((r) => setTimeout(r, 20));
const assert = (v, m) => {
  if (!v) throw Error(m);
};
const button = (key) => [...document.querySelectorAll("button")].find((b) => b.textContent === key);
const snapshot = {
  checkedAt: "2026-09-12T12:00:00Z",
  title: "Fixture article",
  deliverable: {
    metaTitle: "Title",
    metaDescription: "Description",
    slug: "fixture",
    markdown: "Fixture body",
    html: "<p>Fixture body</p>",
  },
  facts: [
    {
      kind: "content",
      outputId: "a",
      reviewKey: "fact-1",
      reference: { recordRevision: 1, sourceRevision: 1 },
      record: null,
      source: null,
    },
  ],
  reviewable: true,
  forgotten: false,
  version: { hash: "a".repeat(64) },
  contextHash: "b".repeat(64),
};
let savedCalls = 0,
  withdrawCalls = 0,
  changed = 0,
  settle;
let history = [];
window.h = {
  read: async () => snapshot,
  history: async () => history,
  save: () => {
    savedCalls++;
    return new Promise((r) => (settle = r));
  },
  withdraw: async () => {
    withdrawCalls++;
    history = [];
  },
};
async function mount(key) {
  root.render(
    <KnowledgeOutputInspection
      key={key}
      projectId="p"
      assetId={key}
      onReviewChange={() => changed++}
    />,
  );
  await tick();
}
async function inspect() {
  button("knowledge.inspect.open").click();
  await tick();
}
async function confirm() {
  for (const box of document.querySelectorAll("input[type=checkbox]")) {
    box.click();
    await tick();
  }
}
(async () => {
  await mount("a");
  await inspect();
  assert(button("knowledge.review.save").disabled, "Save enabled without confirmations");
  await confirm();
  assert(!button("knowledge.review.save").disabled, "Save unavailable after confirmations");
  const save = button("knowledge.review.save");
  save.click();
  save.click();
  await tick();
  assert(savedCalls === 1, "Duplicate save");
  assert(save.disabled, "Save not disabled while pending");
  history = [{ reviewId: "review", reviewedAt: snapshot.checkedAt, active: true }];
  settle({});
  await tick();
  assert(document.body.textContent.includes("knowledge.review.saved"), "Missing saved status");
  assert(changed === 1, "Missing save callback");
  results.push("Confirmed save, pending duplicate suppression and success feedback passed");
  button("knowledge.review.withdraw").click();
  await tick();
  assert(withdrawCalls === 1, "Withdrawal count");
  assert(
    !document.body.textContent.includes("knowledge.review.saved"),
    "Saved status retained after withdrawal",
  );
  assert(button("knowledge.review.save").disabled, "Withdrawal retained confirmations");
  results.push("Withdrawal clears saved status and requires fresh confirmation");
  await inspect();
  await confirm();
  window.h.save = async () => {
    throw Error("unavailable");
  };
  button("knowledge.review.save").click();
  await tick();
  assert(document.querySelector("[role=alert]"), "Missing failure alert");
  assert(!document.body.textContent.includes("knowledge.review.saved"), "Failure reported saved");
  assert(button("knowledge.review.save").disabled, "Failed save not held");
  results.push("Failed save shows alert and requires reinspection");
  await mount("b");
  await inspect();
  await confirm();
  window.h.save = () => new Promise((r) => (settle = r));
  button("knowledge.review.save").click();
  await tick();
  const before = changed;
  await mount("c");
  settle({});
  await tick();
  assert(changed === before, "Late mutation changed new scope");
  assert(
    !document.body.textContent.includes("knowledge.review.saved"),
    "Late result leaked to new scope",
  );
  results.push("Unmounted scope ignores late mutation feedback");
  document.getElementById("results").textContent = JSON.stringify(
    { passed: true, results },
    null,
    2,
  );
})().catch((e) => {
  document.getElementById("results").textContent = JSON.stringify(
    { passed: false, error: e.message, results },
    null,
    2,
  );
});
