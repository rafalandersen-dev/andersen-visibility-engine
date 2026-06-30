/**
 * Shopify Connector v1 — server-side publishing via the Shopify Admin GraphQL
 * API with a custom/private-app Admin access token. GraphQL-first (REST is
 * legacy; new apps must use GraphQL Admin). All calls are server-only so the
 * access token is never sent to the browser or logged (only the shop host is).
 *
 * Field names follow the current Shopify Admin GraphQL Article schema and need
 * live verification against a real store (no test store available this sprint).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { markdownToHtml, slugifyForPublish } from "./markdown";
import type { ShopifyPublishResult, ShopifyBlogOption } from "./types";

const SHOPIFY_API_VERSION = "2025-01";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/** Normalize a shop domain: strip protocol/path; append .myshopify.com if bare. */
export function normalizeShopDomain(raw: string): string {
  let d = (raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\/+$/, "");
  if (!d) return "";
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

/** Numeric id from a Shopify GID (e.g. gid://shopify/Article/123 → "123"). */
export function idFromGid(gid: string): string {
  const parts = (gid || "").split("/");
  return parts[parts.length - 1] || "";
}

const FRIENDLY_CONNECT = "Could not connect to Shopify. Check the shop domain and Admin API access token.";

async function shopifyGraphQL(shopDomain: string, token: string, query: string, variables?: unknown): Promise<unknown> {
  const domain = normalizeShopDomain(shopDomain);
  if (!domain) throw new Error("The Shopify shop domain is not valid.");
  if (!token.trim()) throw new Error("Add your Shopify Admin API access token in Project Setup.");

  const endpoint = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.trim() },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });
  } catch {
    throw new Error(FRIENDLY_CONNECT);
  } finally {
    clearTimeout(timer);
  }

  console.info("[shopify.functions] graphql", { host: domain, status: res.status });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Shopify rejected the token. Check the Admin API access token and its content permissions.");
  }
  if (res.status === 404) {
    throw new Error("Shopify store not found. Check the shop domain (for example mystore.myshopify.com).");
  }
  const raw = await res.text().catch(() => "");
  let parsed: unknown;
  try { parsed = raw ? JSON.parse(raw) : undefined; } catch { parsed = undefined; }
  if (!res.ok) {
    throw new Error(`Shopify returned an error (status ${res.status}).`);
  }
  if (isRecord(parsed) && Array.isArray(parsed.errors) && parsed.errors.length) {
    const msg = isRecord(parsed.errors[0]) ? asString((parsed.errors[0] as Record<string, unknown>).message) : "";
    throw new Error(msg ? `Shopify error: ${msg}` : "Shopify rejected the request (check access scopes).");
  }
  return isRecord(parsed) ? parsed.data : undefined;
}

function shopDomainSchema() {
  return z.object({ shopDomain: z.string(), adminAccessToken: z.string() });
}

export const testShopifyConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shopDomainSchema().parse(input))
  .handler(async ({ data }): Promise<ShopifyPublishResult> => {
    try {
      const out = await shopifyGraphQL(
        data.shopDomain,
        data.adminAccessToken,
        `{ shop { name myshopifyDomain primaryDomain { url } } }`,
      );
      const shop = isRecord(out) && isRecord(out.shop) ? out.shop : {};
      const name = asString(shop.name) || asString(shop.myshopifyDomain);
      return { success: true, message: name ? `Connected to ${name}.` : "Connected to Shopify." };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
  });

export const listShopifyBlogsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shopDomainSchema().parse(input))
  .handler(async ({ data }): Promise<{ success: boolean; blogs: ShopifyBlogOption[]; error?: string }> => {
    try {
      const out = await shopifyGraphQL(
        data.shopDomain,
        data.adminAccessToken,
        `{ blogs(first: 50) { nodes { id handle title } } }`,
      );
      const nodes = isRecord(out) && isRecord(out.blogs) && Array.isArray((out.blogs as Record<string, unknown>).nodes)
        ? ((out.blogs as Record<string, unknown>).nodes as unknown[])
        : [];
      const blogs: ShopifyBlogOption[] = nodes.filter(isRecord).map((n) => {
        const gid = asString(n.id);
        return { gid, id: idFromGid(gid), handle: asString(n.handle), title: asString(n.title) || asString(n.handle) };
      });
      return { success: true, blogs };
    } catch (e) {
      return { success: false, blogs: [], error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
  });

const ArticleInput = z.object({
  shopDomain: z.string(),
  adminAccessToken: z.string(),
  blogGid: z.string(),
  blogHandle: z.string().default(""),
  articleGid: z.string().optional(),
  title: z.string().default(""),
  contentMarkdown: z.string().default(""),
  handle: z.string().default(""),
  summary: z.string().default(""),
  tags: z.array(z.string()).default([]),
  author: z.string().default(""),
});

export function liveUrlFor(shopDomain: string, blogHandle: string, articleHandle: string): string {
  const d = normalizeShopDomain(shopDomain);
  if (!d || !blogHandle || !articleHandle) return "";
  return `https://${d}/blogs/${blogHandle}/${articleHandle}`;
}

function buildArticleFields(data: z.infer<typeof ArticleInput>, isPublished: boolean) {
  const fields: Record<string, unknown> = {
    title: data.title,
    body: markdownToHtml(data.contentMarkdown),
    isPublished,
  };
  if (data.handle || data.title) fields.handle = slugifyForPublish(data.handle || data.title);
  if (data.summary) fields.summary = data.summary;
  if (data.tags.length) fields.tags = data.tags;
  if (data.author) fields.author = { name: data.author };
  if (isPublished) fields.publishDate = new Date().toISOString();
  return fields;
}

const CREATE_MUTATION = `mutation ArticleCreate($article: ArticleCreateInput!) {
  articleCreate(article: $article) {
    article { id handle isPublished blog { id handle } }
    userErrors { field message }
  }
}`;
const UPDATE_MUTATION = `mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
  articleUpdate(id: $id, article: $article) {
    article { id handle isPublished blog { id handle } }
    userErrors { field message }
  }
}`;

function readArticleResult(out: unknown, key: "articleCreate" | "articleUpdate"): { article?: Record<string, unknown>; error?: string } {
  const node = isRecord(out) && isRecord(out[key]) ? (out[key] as Record<string, unknown>) : {};
  const errs = Array.isArray(node.userErrors) ? node.userErrors : [];
  if (errs.length) {
    const e0 = isRecord(errs[0]) ? errs[0] : {};
    return { error: asString(e0.message) || "Shopify rejected the article." };
  }
  return { article: isRecord(node.article) ? (node.article as Record<string, unknown>) : undefined };
}

async function upsertArticle(data: z.infer<typeof ArticleInput>, isPublished: boolean): Promise<ShopifyPublishResult> {
  const fields = buildArticleFields(data, isPublished);
  let out: unknown;
  let res: { article?: Record<string, unknown>; error?: string };
  if (data.articleGid) {
    out = await shopifyGraphQL(data.shopDomain, data.adminAccessToken, UPDATE_MUTATION, { id: data.articleGid, article: fields });
    res = readArticleResult(out, "articleUpdate");
  } else {
    out = await shopifyGraphQL(data.shopDomain, data.adminAccessToken, CREATE_MUTATION, { article: { blogId: data.blogGid, ...fields } });
    res = readArticleResult(out, "articleCreate");
  }
  if (res.error || !res.article) return { success: false, error: res.error || "Shopify did not return an article." };
  const a = res.article;
  const gid = asString(a.id);
  const handle = asString(a.handle);
  const blog = isRecord(a.blog) ? a.blog : {};
  const blogGid = asString(blog.id) || data.blogGid;
  const blogHandle = asString(blog.handle) || data.blogHandle;
  const published = a.isPublished === true;
  return {
    success: true,
    articleGid: gid,
    articleId: idFromGid(gid),
    blogGid,
    blogId: idFromGid(blogGid),
    handle,
    status: published ? "published" : "draft",
    liveUrl: published ? liveUrlFor(data.shopDomain, blogHandle, handle) : undefined,
    message: published ? "Shopify published the article live." : "Shopify saved the article as a draft (unpublished).",
  };
}

export const sendContentToShopifyDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArticleInput.parse(input))
  .handler(async ({ data }): Promise<ShopifyPublishResult> => {
    try {
      if (!data.blogGid) return { success: false, error: "Select a Shopify blog in Project Setup first." };
      return await upsertArticle(data, false);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
  });

export const publishShopifyContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArticleInput.parse(input))
  .handler(async ({ data }): Promise<ShopifyPublishResult> => {
    try {
      if (!data.blogGid && !data.articleGid) return { success: false, error: "Select a Shopify blog in Project Setup first." };
      return await upsertArticle(data, true);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
  });
