import React from "react";
import { t, locale } from "@/i18n";
import { createRoot } from "react-dom/client";
import { KnowledgeOutputInspection } from "./src/components/KnowledgeOutputInspection";
const root = createRoot(document.getElementById("root"));
const results = [];
const tick = () => new Promise((r) => setTimeout(r, 20));
const assert = (v, m) => {
  if (!v) throw Error(m);
};
const button = (key) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === t(key));
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
      record: {
        key: "business.service",
        value: "Current service fact for review",
        revision: 2,
        status: "accepted",
        validUntil: "2026-10-01T00:00:00Z",
      },
      source: { label: "Owner supplied source", revision: 2, status: "active" },
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
  const factBox = document.querySelector("input[aria-describedby]");
  assert(factBox, "Fact checkbox lacks a description reference");
  const description = document.getElementById(factBox.getAttribute("aria-describedby"));
  assert(
    description?.textContent.includes("knowledge.inspect.original") ||
      description?.textContent.includes(t("knowledge.inspect.original")),
    "Fact description does not include evidence context",
  );
  assert(
    description.textContent.includes("Current service fact for review"),
    "Current fact text missing from acknowledgement context",
  );
  assert(
    description.textContent.includes("Owner supplied source"),
    "Source missing from acknowledgement context",
  );
  assert(
    description.textContent.includes(t("knowledge.inspect.current")),
    "Current versions missing from acknowledgement context",
  );
  const panel = document.querySelector("[aria-busy]");
  assert(
    panel?.getAttribute("lang") === (locale === "keys" ? "en" : locale),
    "Panel language mismatch",
  );
  assert(panel.getAttribute("aria-busy") === "false", "Inspection remained busy");
  assert(button("knowledge.review.save").disabled, "Save enabled without confirmations");
  await confirm();
  assert(!button("knowledge.review.save").disabled, "Save unavailable after confirmations");
  const save = button("knowledge.review.save");
  save.click();
  save.click();
  await tick();
  assert(savedCalls === 1, "Duplicate save");
  assert(save.disabled, "Save not disabled while pending");
  assert(panel.getAttribute("aria-busy") === "true", "Pending save does not expose busy state");
  history = [{ reviewId: "review", reviewedAt: snapshot.checkedAt, active: true }];
  settle({});
  await tick();
  assert(document.body.textContent.includes(t("knowledge.review.saved")), "Missing saved status");
  assert(changed === 1, "Missing save callback");
  results.push("Confirmed save, pending duplicate suppression and success feedback passed");
  button("knowledge.review.withdraw").click();
  await tick();
  assert(withdrawCalls === 1, "Withdrawal count");
  assert(
    !document.body.textContent.includes(t("knowledge.review.saved")),
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
  assert(
    !document.body.textContent.includes(t("knowledge.review.saved")),
    "Failure reported saved",
  );
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
    !document.body.textContent.includes(t("knowledge.review.saved")),
    "Late result leaked to new scope",
  );
  results.push("Unmounted scope ignores late mutation feedback");
  window.h.history = async () => history;
  history = [];
  await mount("d");
  await inspect();
  await confirm();
  const beforeHistoryFailure = changed;
  window.h.save = async () => {
    savedCalls++;
  };
  window.h.history = async () => {
    throw Error("history unavailable");
  };
  button("knowledge.review.save").click();
  await tick();
  assert(
    changed === beforeHistoryFailure + 1,
    "Confirmed save did not refresh parent after history failure",
  );
  assert(document.querySelector("[role=alert]"), "History failure lacks alert");
  assert(button("knowledge.review.save").disabled, "History failure permits another save");
  assert(
    !document.body.textContent.includes(t("knowledge.review.saved")),
    "History failure reported complete feedback",
  );
  results.push("Confirmed save refreshes parent even when history fails; retry remains held");
  history = [{ reviewId: "review", reviewedAt: snapshot.checkedAt, active: true }];
  window.h.history = async () => history;
  await inspect();
  await confirm();
  const beforeWithdrawalFailure = changed;
  window.h.history = async () => {
    throw Error("history unavailable");
  };
  button("knowledge.review.withdraw").click();
  await tick();
  assert(
    changed === beforeWithdrawalFailure + 1,
    "Confirmed withdrawal did not refresh parent after history failure",
  );
  assert(
    [...document.querySelectorAll("input[type=checkbox]")].every((box) => !box.checked),
    "Confirmed withdrawal retained acknowledgements after history failure",
  );
  assert(document.querySelector("[role=alert]"), "Withdrawal history failure lacks alert");
  assert(button("knowledge.review.save").disabled, "Withdrawal history failure permits save");
  assert(
    !button("knowledge.review.withdraw"),
    "Stale active history remains after confirmed withdrawal",
  );
  results.push(
    "Confirmed withdrawal clears acknowledgements and refreshes parent despite history failure",
  );
  window.h.history = async () => [];
  window.h.read = async () => ({
    ...snapshot,
    reviewable: false,
    forgotten: true,
    facts: snapshot.facts.map((fact) => ({ ...fact, record: null, source: null })),
  });
  await mount("forgotten");
  await inspect();
  assert(
    document.body.textContent.includes(t("knowledge.inspect.forgotten")),
    "Missing forgotten-evidence status",
  );
  assert(
    document.body.textContent.includes(t("knowledge.review.ineligible")),
    "Missing ineligible-review explanation",
  );
  assert(
    !document.querySelector("input[type=checkbox]"),
    "Ineligible evidence exposes acknowledgements",
  );
  assert(!button("knowledge.review.save"), "Ineligible evidence exposes save control");
  results.push("Forgotten ineligible evidence displays its limits without approval controls");
  window.h.read = async () => snapshot;
  window.h.history = async () => {
    throw Error("history unavailable");
  };
  await mount("inspection-history-failure");
  await inspect();
  await confirm();
  assert(document.querySelector("[role=alert]"), "Partial inspection lacks failure alert");
  assert(button("knowledge.review.save").disabled, "Failed history inspection permits save");
  results.push("Current facts with unavailable review history cannot be saved as reviewed");
  const close = button("knowledge.inspect.close");
  close.focus();
  assert(document.activeElement === close, "Close control did not receive focus");
  close.click();
  await tick();
  assert(!button("knowledge.inspect.close"), "Closed inspection remains visible");
  assert(
    document.activeElement === button("knowledge.inspect.open"),
    "Closing inspection lost keyboard focus instead of returning it to the opener",
  );
  results.push("Closing inspection returns keyboard focus to its opener");
  document.getElementById("results").textContent = JSON.stringify(
    { passed: true, locale, results },
    null,
    2,
  );
})().catch((e) => {
  document.getElementById("results").textContent = JSON.stringify(
    { passed: false, locale, error: e.message, results },
    null,
    2,
  );
});
