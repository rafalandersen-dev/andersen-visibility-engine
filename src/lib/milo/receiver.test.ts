import { describe, expect, it } from "vitest";
import { MILO_PROJECT_ID, handleMiloRequest, type DraftRow, type MiloStore } from "./receiver";

const SECRET = "test-only-secret-not-a-real-credential-0123456789";

function memoryStore() {
  const drafts = new Map<string, DraftRow & { assetKey: string }>();
  const published = new Map<string, DraftRow>();
  let n = 0;
  const store: MiloStore = {
    async getDraft(projectId, assetId) {
      return drafts.get(`${projectId}/${assetId}`) ?? null;
    },
    async upsertDraft(row) {
      const key = `${row.project_id}/${row.asset_id}`;
      for (const [k, d] of drafts) if (k !== key && d.slug === row.slug) throw { code: "23505" };
      const prev = drafts.get(key);
      const next = {
        ...row,
        id: prev?.id ?? `id-${++n}`,
        published_slug: prev?.published_slug ?? null,
        assetKey: key,
      };
      drafts.set(key, next);
      return { id: next.id };
    },
    async publish(draft) {
      published.set(draft.id, structuredClone(draft));
      for (const d of drafts.values()) if (d.id === draft.id) d.published_slug = draft.slug;
    },
  };
  return { store, drafts, published };
}

const draftBody = (over: Record<string, unknown> = {}) => ({
  source: "milo-growth",
  projectId: MILO_PROJECT_ID,
  assetId: "a1",
  title: "How Milo works",
  slug: "how-milo-works",
  assetType: "article",
  destinationType: "blogPost",
  language: "English",
  markdown: "# How Milo works\n\nIntro paragraph.\n\n## Steps\n\n- one\n- two",
  metaTitle: "",
  metaDescription: "",
  status: "draft",
  createdAt: "2026-11-21T10:00:00.000Z",
  sentAt: "2026-11-21T10:01:00.000Z",
  ...over,
});

const liveBody = (over: Record<string, unknown> = {}) => ({
  source: "milo-growth",
  projectId: MILO_PROJECT_ID,
  assetId: "a1",
  externalId: "id-1",
  slug: "how-milo-works",
  destinationType: "blogPost",
  ...over,
});

function call(
  kind: "draft" | "live",
  body: unknown,
  opts: {
    secret?: string | undefined;
    header?: string | null;
    store?: MiloStore;
    method?: string;
  } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sent = opts.header === undefined ? SECRET : opts.header;
  if (sent !== null) headers["x-milo-publish-secret"] = sent;
  return handleMiloRequest(
    kind,
    new Request("https://milogrowth.com/api/milo/" + kind, {
      method: opts.method ?? "POST",
      headers,
      ...(opts.method === "GET"
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }),
    {
      secret: "secret" in opts ? opts.secret : SECRET,
      store: () => opts.store ?? memoryStore().store,
    },
  );
}

describe("auth and request shape", () => {
  it("fails closed with 503 when the secret is unset or too short", async () => {
    for (const secret of [undefined, "", "short"]) {
      const res = await call("draft", draftBody(), { secret });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, error: "publishing_not_configured" });
    }
  });

  it("rejects a missing or wrong secret with 401", async () => {
    expect((await call("draft", draftBody(), { header: null })).status).toBe(401);
    expect((await call("live", liveBody(), { header: "wrong" })).status).toBe(401);
  });

  it("rejects non-POST, wrong content type, bad JSON and unknown fields", async () => {
    expect((await call("draft", draftBody(), { method: "GET" })).status).toBe(405);
    const noType = await handleMiloRequest(
      "draft",
      new Request("https://x", {
        method: "POST",
        headers: { "x-milo-publish-secret": SECRET },
        body: "{}",
      }),
      { secret: SECRET, store: () => memoryStore().store },
    );
    expect(noType.status).toBe(415);
    expect((await call("draft", "{nope")).status).toBe(400);
    const extra = await call("draft", draftBody({ surprise: 1 }));
    expect(extra.status).toBe(400);
    expect((await extra.json()).error).toBe("invalid_payload");
  });

  it("rejects an oversize body without reading it all", async () => {
    const res = await call("draft", draftBody({ markdown: "x".repeat(600 * 1024) }));
    expect(res.status).toBe(413);
  });
});

describe("draft", () => {
  it("stores a draft, returns an externalId and no draftUrl", async () => {
    const { store, drafts } = memoryStore();
    const res = await call("draft", draftBody(), { store });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, externalId: "id-1" });
    expect(drafts.get(`${MILO_PROJECT_ID}/a1`)?.sections).toEqual([
      { type: "p", text: "Intro paragraph." },
      { type: "h2", text: "Steps" },
      { type: "ul", items: ["one", "two"] },
    ]);
  });

  it("is idempotent by asset id and updates the same row", async () => {
    const { store, drafts } = memoryStore();
    await call("draft", draftBody(), { store });
    const res = await call("draft", draftBody({ title: "Renamed", slug: "renamed" }), { store });
    expect((await res.json()).externalId).toBe("id-1");
    expect(drafts.size).toBe(1);
    expect(drafts.get(`${MILO_PROJECT_ID}/a1`)?.title).toBe("Renamed");
  });

  it("refuses other projects, destinations, languages and the static slug", async () => {
    const cases: [Record<string, unknown>, number, string][] = [
      [{ projectId: "someone-else" }, 422, "unknown_project"],
      [{ destinationType: "servicePage" }, 422, "unsupported_destination"],
      [{ language: "Polish" }, 422, "unsupported_language"],
      [{ slug: "local-seo-guide" }, 409, "slug_reserved"],
    ];
    for (const [over, status, error] of cases) {
      const res = await call("draft", draftBody(over));
      expect([res.status, (await res.json()).error]).toEqual([status, error]);
    }
  });

  it("rejects markdown that cannot be shown safely", async () => {
    const res = await call("draft", draftBody({ markdown: "Hi <script>alert(1)</script>" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("raw_html_not_supported");
    const link = await call("draft", draftBody({ markdown: "[x](javascript:alert(1))" }));
    expect((await link.json()).error).toBe("unsafe_link_url");
  });

  it("reports a slug clash between two assets as 409", async () => {
    const { store } = memoryStore();
    await call("draft", draftBody(), { store });
    const res = await call("draft", draftBody({ assetId: "a2" }), { store });
    expect([res.status, (await res.json()).error]).toEqual([409, "slug_conflict"]);
  });
});

describe("live", () => {
  it("publishes the draft and returns the canonical live URL", async () => {
    const { store, published } = memoryStore();
    await call("draft", draftBody(), { store });
    const res = await call("live", liveBody(), { store });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      liveUrl: "https://milogrowth.com/blog/how-milo-works",
      externalId: "id-1",
    });
    expect(published.get("id-1")?.title).toBe("How Milo works");
  });

  it("is idempotent and keeps serving the live copy until the next live flip", async () => {
    const { store, published } = memoryStore();
    await call("draft", draftBody(), { store });
    await call("live", liveBody(), { store });
    expect((await call("live", liveBody(), { store })).status).toBe(200);
    await call("draft", draftBody({ title: "Edited after publish" }), { store });
    expect(published.get("id-1")?.title).toBe("How Milo works");
    await call("live", liveBody(), { store });
    expect(published.get("id-1")?.title).toBe("Edited after publish");
  });

  it("locks the slug once published", async () => {
    const { store } = memoryStore();
    await call("draft", draftBody(), { store });
    await call("live", liveBody(), { store });
    const res = await call("draft", draftBody({ slug: "new-slug" }), { store });
    expect([res.status, (await res.json()).error]).toEqual([409, "slug_locked_after_publish"]);
  });

  it("refuses unknown drafts, wrong receipts and mismatched slugs", async () => {
    const { store } = memoryStore();
    expect((await call("live", liveBody(), { store })).status).toBe(404);
    await call("draft", draftBody(), { store });
    expect(
      (await (await call("live", liveBody({ externalId: "other" }), { store })).json()).error,
    ).toBe("receipt_unknown");
    expect((await (await call("live", liveBody({ slug: "nope" }), { store })).json()).error).toBe(
      "slug_mismatch",
    );
  });

  it("returns 500 with a code only when storage fails", async () => {
    const broken: MiloStore = {
      getDraft: async () => {
        throw new Error("db down: secret detail");
      },
      upsertDraft: async () => ({ id: "x" }),
      publish: async () => {},
    };
    const res = await call("live", liveBody(), { store: broken });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "internal_error" });
  });
});
