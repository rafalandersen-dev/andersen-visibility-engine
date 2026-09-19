import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  read: vi.fn(),
  history: vi.fn(),
  save: vi.fn(),
  withdraw: vi.fn(),
  click: undefined as undefined | (() => void),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key, useAppLanguage: () => "en" }));
vi.mock("@/lib/project-knowledge.functions", () => ({
  readKnowledgeOutputReviewFn: h.read,
  readKnowledgeOutputReviewHistoryFn: h.history,
  saveKnowledgeOutputReviewFn: h.save,
  withdrawKnowledgeOutputReviewFn: h.withdraw,
}));
vi.mock("./ui/button", () => ({
  Button: ({ onClick }: { onClick: () => void }) => {
    h.click = onClick;
    return createElement("button");
  },
}));
import { KnowledgeOutputInspection } from "./KnowledgeOutputInspection";
beforeEach(() => {
  vi.clearAllMocks();
  h.read.mockReset().mockResolvedValue(null);
  h.history.mockReset().mockResolvedValue([]);
});
it.each(["success", "failure"])(
  "ignores overlapping inspections and releases after %s",
  async (outcome) => {
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    h.read.mockImplementationOnce(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    renderToStaticMarkup(
      createElement(KnowledgeOutputInspection, { projectId: "p", assetId: "a" }),
    );
    h.click!();
    h.click!();
    expect(h.read).toHaveBeenCalledExactlyOnceWith({ data: { projectId: "p", assetId: "a" } });
    expect(h.history).toHaveBeenCalledOnce();
    if (outcome === "success") resolve(null);
    else reject(new Error("unavailable"));
    await new Promise((done) => setTimeout(done, 0));
    h.click!();
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(h.history).toHaveBeenCalledTimes(2);
    expect(h.save).not.toHaveBeenCalled();
    expect(h.withdraw).not.toHaveBeenCalled();
    await new Promise((done) => setTimeout(done, 0));
  },
);
