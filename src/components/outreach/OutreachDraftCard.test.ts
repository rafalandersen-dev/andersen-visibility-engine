import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import type { OutreachDraft } from "@/lib/types";
import type { OutreachReceipt } from "@/lib/outreach-receipts";
vi.mock("@/lib/store", () => ({
  useStore: (select: (state: { userId: string }) => unknown) => select({ userId: "owner" }),
  reloadWorkspaceForUser: vi.fn(),
  saveWorkspaceNow: vi.fn(),
  updateOutreachDraft: vi.fn(),
}));
vi.mock("@/lib/outreach-delivery.functions", () => ({
  recoverOutreachReceiptFn: vi.fn(),
  reviewOutreachMessageFn: vi.fn(),
  sendOutreachEmailFn: vi.fn(),
}));
import { OutreachDraftCard } from "./OutreachDraftCard";
const draft: OutreachDraft = {
  id: "a",
  projectId: "p",
  targetDomain: "publisher.example",
  contactName: "Editor",
  contactEmail: "editor@example.com",
  source: "manual",
  subject: "Resource",
  body: "Reviewed body",
  suggestedAsset: "Guide",
  rationale: "Relevant",
  status: "Approved",
  followUps: [],
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
const receipt: OutreachReceipt = {
  draft_id: "a",
  project_id: "p",
  step: "initial",
  version_hash: "a".repeat(64),
  recipient: "editor@example.com",
  state: "accepted",
  reserved_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-10T10:00:01Z",
  provider_message_id: "message-1",
};
const render = (status: OutreachDraft["status"]) =>
  renderToStaticMarkup(
    createElement(OutreachDraftCard, {
      draft: { ...draft, status },
      deliveryReady: true,
      receipts: [receipt],
      refreshHistory: async () => {},
      t: (key) => key,
      locale: "en",
    }),
  );
describe("outreach receipt recovery affordance", () => {
  it("never offers recovery for a replied, paused, edited, suppressed or already-sent draft", () => {
    for (const status of ["Replied", "Paused", "Draft", "Suppressed", "Sent"] as const)
      expect(render(status)).not.toContain("outreach.integrity.recover<");
  });
  it("offers recovery only for the supported unchanged-workflow states", () => {
    for (const status of ["Approved", "Failed"] as const)
      expect(render(status)).toContain("outreach.integrity.recover<");
  });
});
