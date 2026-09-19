import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ContentAsset, Project } from "./types";
import { serverWpPublication, serverShopifyPublication } from "./connector-guard.server";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  rpc: vi.fn(),
  approval: vi.fn(),
  secret: vi.fn(),
}));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: mocks.workspace }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("./publication-approval.server", () => ({ assertPublicationApproved: mocks.approval }));
vi.mock("./publish-secret.server", () => ({
  resolveWordPressAppPassword: mocks.secret,
  resolveShopifyAdminToken: mocks.secret,
}));
vi.mock("./source-refresh.server", () => ({ readOutputSourceDependencies: vi.fn(async () => []) }));
const ownerId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const recordId = "00000000-0000-4000-8000-000000000003";
const now = "2026-09-12T12:00:00Z";
const prior = "2026-09-11T12:00:00Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  mocks.approval.mockResolvedValue(undefined);
  mocks.secret.mockResolvedValue("test-placeholder");
});
afterEach(() => vi.useRealTimers());

it.each([
  ["WordPress", serverWpPublication],
  ["Shopify", serverShopifyPublication],
] as const)(
  "holds stale knowledge before %s credential resolution, then admits a current review",
  async (_name, authorize) => {
    const source = {
      ownerId,
      projectId: "p1",
      id: sourceId,
      revision: 1,
      kind: "owner",
      label: "Owner guidance",
      fingerprint: "a".repeat(64),
      observedAt: prior,
      status: "active",
    };
    const record = {
      ownerId,
      projectId: "p1",
      id: recordId,
      revision: 1,
      sourceId,
      sourceRevision: 1,
      key: "lesson.style",
      category: "lesson",
      appliesTo: "both",
      value: "Use plain language",
      locator: "Owner",
      status: "accepted",
      updatedAt: now,
      reviewedAt: prior,
    };
    const reference = {
      recordId,
      recordRevision: 1,
      sourceId,
      sourceRevision: 1,
      sourceFingerprint: source.fingerprint,
    };
    const asset = {
      id: "a1",
      projectId: "p1",
      title: "A simple guide",
      slug: "simple-guide",
      markdown: "A plain article with no links.",
      status: "Approved",
      knowledgeReferences: [reference],
      images: [],
    } as unknown as ContentAsset;
    const project = {
      id: "p1",
      name: "Project",
      businessName: "Business",
      websiteUrl: "https://example.test",
      connectorType: _name === "WordPress" ? "wordpress" : "shopify",
      wordpress: {
        siteUrl: "https://example.test",
        username: "test",
        applicationPasswordSet: true,
      },
      shopify: {
        shopDomain: "example.myshopify.com",
        adminAccessTokenSet: true,
        defaultBlogId: "gid://shopify/Blog/1",
      },
    } as Project;
    const workspace = { data: { projects: [project], content: [asset] }, rev: 1 };
    mocks.workspace.mockResolvedValue(workspace);
    mocks.rpc.mockImplementation(async (name: string) => {
      const knowledge = { sources: [source], records: [record] };
      if (name === "read_output_knowledge_dependencies") return { data: [], error: null };
      if (name === "read_project_knowledge") return { data: knowledge, error: null };
      if (name === "read_output_knowledge_review_context")
        return {
          data: {
            knowledge,
            registry: [],
            brand: { brandIntelligence: null, brandOwnerFields: [], toneOfVoice: "" },
            contextHash: "b".repeat(64),
          },
          error: null,
        };
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const original = structuredClone(asset);
    await expect(authorize(ownerId, "p1", "a1")).rejects.toThrow("Source facts need review");
    expect(mocks.approval).toHaveBeenCalledOnce();
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toContain(
      "read_output_knowledge_review_context",
    );
    expect(asset).toEqual(original);
    record.reviewedAt = now;
    await expect(authorize(ownerId, "p1", "a1")).resolves.toMatchObject({
      asset: { id: "a1" },
      args: { assetId: "a1" },
    });
    expect(mocks.secret).toHaveBeenCalledExactlyOnceWith(ownerId, project);
    expect(asset).toEqual(original);
  },
);
