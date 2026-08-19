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
import {
  ambiguousTransportFailure,
  classifyHttpFailure,
  PublishTransportError,
} from "./publish-outcome";
import { markdownToHtml, slugifyForPublish, unresolvedInternalLinks } from "./markdown";
import type { Project, ShopifyPublishResult, ShopifyBlogOption } from "./types";

const SHOPIFY_API_VERSION = "2025-01";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/** Normalize a shop domain: strip protocol/path; append .myshopify.com if bare. */
export function normalizeShopDomain(raw: string): string {
  let d = (raw || "").trim().toLowerCase();
  d = d
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\/+$/, "");
  if (!d) return "";
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

/** Numeric id from a Shopify GID (e.g. gid://shopify/Article/123 → "123"). */
export function idFromGid(gid: string): string {
  const parts = (gid || "").split("/");
  return parts[parts.length - 1] || "";
}

const FRIENDLY_CONNECT =
  "Could not connect to Shopify. Check the shop domain and Admin API access token.";

async function shopifyGraphQL(
  shopDomain: string,
  token: string,
  query: string,
  variables?: unknown,
): Promise<unknown> {
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
    // Network error or abort: Shopify may already have applied the mutation.
    // Never retryable — a retry without an articleGid would CREATE a second article.
    throw ambiguousTransportFailure(FRIENDLY_CONNECT);
  } finally {
    clearTimeout(timer);
  }

  console.info("[shopify.functions] graphql", { host: domain, status: res.status });

  if (res.status === 401 || res.status === 403) {
    throw classifyHttpFailure(
      res.status,
      "Shopify rejected the token. Check the Admin API access token and its content permissions.",
    );
  }
  if (res.status === 404) {
    throw classifyHttpFailure(
      res.status,
      "Shopify store not found. Check the shop domain (for example mystore.myshopify.com).",
    );
  }
  const raw = await res.text().catch(() => "");
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!res.ok) {
    throw classifyHttpFailure(res.status, `Shopify returned an error (status ${res.status}).`);
  }
  if (isRecord(parsed) && Array.isArray(parsed.errors) && parsed.errors.length) {
    const msg = isRecord(parsed.errors[0])
      ? asString((parsed.errors[0] as Record<string, unknown>).message)
      : "";
    // GraphQL errors arrive with HTTP 200. The mutation may have partially
    // applied, so treat them as ambiguous rather than safe to repeat.
    throw ambiguousTransportFailure(
      msg ? `Shopify error: ${msg}` : "Shopify rejected the request (check access scopes).",
    );
  }
  return isRecord(parsed) ? parsed.data : undefined;
}

function shopDomainSchema() {
  return z.object({
    shopDomain: z.string(),
    // Empty when testing an already-saved token: the browser never receives
    // it, so the server resolves it from the store instead. A typed value
    // tests THAT value (the pre-save test flow).
    adminAccessToken: z.string().default(""),
    projectId: z.string().default(""),
  });
}

/**
 * Save (or rotate) the Shopify Admin API access token. The token goes into the
 * service-role-only secret store — never back into the workspace data the
 * browser hydrates (P0-3 pattern, same as savePublishSecretFn). Empty input is
 * a no-op so the Setup form can re-save settings without knowing the current
 * token.
 */
export const saveShopifyAdminTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().min(1), adminAccessToken: z.string().max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = data.adminAccessToken.trim();
    if (!token) return { tokenSet: false };
    const { storeProjectSecret } = await import("./publish-secret.server");
    await storeProjectSecret(context.userId as string, data.projectId, "shopifyAdminToken", token);
    return { tokenSet: true };
  });

/**
 * The saved Admin token for one of the caller's own projects — store-first
 * with legacy workspace fallback. Used by the connection test and blog list
 * when the browser has no token to send (it never receives a saved one).
 */
async function savedShopifyToken(userId: string, projectId: string): Promise<string> {
  const { readWorkspaceRow } = await import("./workspace.server");
  const { resolveShopifyAdminToken } = await import("./publish-secret.server");
  const row = await readWorkspaceRow(userId);
  const projects = (row?.data.projects as Project[] | undefined) ?? [];
  const project = projects.find((p) => p.id === projectId);
  return resolveShopifyAdminToken(userId, { id: projectId, shopify: project?.shopify });
}

async function tokenForCall(
  userId: string,
  data: { adminAccessToken: string; projectId: string },
): Promise<string> {
  return (
    data.adminAccessToken.trim() ||
    (data.projectId ? await savedShopifyToken(userId, data.projectId) : "")
  );
}

export const testShopifyConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shopDomainSchema().parse(input))
  .handler(async ({ data, context }): Promise<ShopifyPublishResult> => {
    try {
      const out = await shopifyGraphQL(
        data.shopDomain,
        await tokenForCall(context.userId as string, data),
        `{ shop { name myshopifyDomain primaryDomain { url } } }`,
      );
      const shop = isRecord(out) && isRecord(out.shop) ? out.shop : {};
      const name = asString(shop.name) || asString(shop.myshopifyDomain);
      return { success: true, message: name ? `Connected to ${name}.` : "Connected to Shopify." };
    } catch (e) {
      // Preserve the transport classification: only a proven-nothing-created
      // failure may be retried by the scheduled runner.
      return {
        success: false,
        error: e instanceof Error ? e.message : FRIENDLY_CONNECT,
        retryable: e instanceof PublishTransportError ? e.retryable : false,
      };
    }
  });

export const listShopifyBlogsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shopDomainSchema().parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ success: boolean; blogs: ShopifyBlogOption[]; error?: string }> => {
      try {
        const out = await shopifyGraphQL(
          data.shopDomain,
          await tokenForCall(context.userId as string, data),
          `{ blogs(first: 50) { nodes { id handle title } } }`,
        );
        const nodes =
          isRecord(out) &&
          isRecord(out.blogs) &&
          Array.isArray((out.blogs as Record<string, unknown>).nodes)
            ? ((out.blogs as Record<string, unknown>).nodes as unknown[])
            : [];
        const blogs: ShopifyBlogOption[] = nodes.filter(isRecord).map((n) => {
          const gid = asString(n.id);
          return {
            gid,
            id: idFromGid(gid),
            handle: asString(n.handle),
            title: asString(n.title) || asString(n.handle),
          };
        });
        return { success: true, blogs };
      } catch (e) {
        return {
          success: false,
          blogs: [],
          error: e instanceof Error ? e.message : FRIENDLY_CONNECT,
        };
      }
    },
  );

export const ArticleInput = z.object({
  // Connector identity — the manual RPC handlers ignore the request's content and
  // credentials, re-reading + re-deriving everything from the caller's own asset
  // (connector-guard.server.ts). Optional/defaulted so the cron transport, which
  // calls upsertArticle with derived args, stays unaffected.
  projectId: z.string().default(""),
  assetId: z.string().default(""),
  shopDomain: z.string(),
  adminAccessToken: z.string(),
  blogGid: z.string(),
  blogHandle: z.string().default(""),
  articleGid: z.string().optional(),
  title: z.string().default(""),
  contentMarkdown: z.string().default(""),
  // Deterministic Article/FAQPage JSON-LD <script>, appended to the article body
  // at publish (P0.5). Empty string when there's nothing to emit.
  jsonLd: z.string().default(""),
  // Internal paths known to resolve on the site — relative in-body links publish
  // as active links only if in this set (P0.4). Others render as plain text.
  knownInternalPaths: z.array(z.string()).default([]),
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

/** Refuse to publish while any in-body internal link is unresolved (link-safety P0). */
function assertResolvedLinks(contentMarkdown: string, knownInternalPaths: string[]): void {
  const unresolved = unresolvedInternalLinks(contentMarkdown, new Set(knownInternalPaths));
  if (unresolved.length) {
    throw new PublishTransportError(
      `This article has ${unresolved.length} unverified internal link${
        unresolved.length === 1 ? "" : "s"
      } (${unresolved.join(", ")}). Resolve them in the editor before publishing.`,
      false,
    );
  }
}

function buildArticleFields(data: z.infer<typeof ArticleInput>, isPublished: boolean) {
  const fields: Record<string, unknown> = {
    title: data.title,
    body:
      markdownToHtml(data.contentMarkdown, {
        knownInternalPaths: new Set(data.knownInternalPaths),
      }) + data.jsonLd,
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

function readArticleResult(
  out: unknown,
  key: "articleCreate" | "articleUpdate",
): { article?: Record<string, unknown>; error?: string } {
  const node = isRecord(out) && isRecord(out[key]) ? (out[key] as Record<string, unknown>) : {};
  const errs = Array.isArray(node.userErrors) ? node.userErrors : [];
  if (errs.length) {
    const e0 = isRecord(errs[0]) ? errs[0] : {};
    return { error: asString(e0.message) || "Shopify rejected the article." };
  }
  return {
    article: isRecord(node.article) ? (node.article as Record<string, unknown>) : undefined,
  };
}

/**
 * Create-or-update a Shopify article. Exported so the scheduled-publish runner
 * can reuse it: the server fns below carry `requireSupabaseAuth`, which the
 * cron runner has no session for.
 */
export async function upsertArticle(
  data: z.infer<typeof ArticleInput>,
  isPublished: boolean,
): Promise<ShopifyPublishResult> {
  assertResolvedLinks(data.contentMarkdown, data.knownInternalPaths);
  const fields = buildArticleFields(data, isPublished);
  let out: unknown;
  let res: { article?: Record<string, unknown>; error?: string };
  if (data.articleGid) {
    out = await shopifyGraphQL(data.shopDomain, data.adminAccessToken, UPDATE_MUTATION, {
      id: data.articleGid,
      article: fields,
    });
    res = readArticleResult(out, "articleUpdate");
  } else {
    out = await shopifyGraphQL(data.shopDomain, data.adminAccessToken, CREATE_MUTATION, {
      article: { blogId: data.blogGid, ...fields },
    });
    res = readArticleResult(out, "articleCreate");
  }
  if (res.error || !res.article)
    return { success: false, error: res.error || "Shopify did not return an article." };
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
    message: published
      ? "Shopify published the article live."
      : "Shopify saved the article as a draft (unpublished).",
  };
}

/**
 * Manual "send to Shopify draft" RPC. Re-reads + re-derives the article content,
 * credentials and connector identity from the caller's own stored asset and runs
 * the SAME publishing checklist as the editor and cron — a hand-rolled call to
 * this endpoint cannot bypass a hard blocker (review fix C). The request body is
 * not trusted.
 */
export const sendContentToShopifyDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArticleInput.parse(input))
  .handler(async ({ data, context }): Promise<ShopifyPublishResult> => {
    let args: z.infer<typeof ArticleInput>;
    try {
      const { serverShopifyArgs } = await import("./connector-guard.server");
      args = await serverShopifyArgs(context.userId as string, data.projectId, data.assetId);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
    try {
      if (!args.blogGid)
        return { success: false, error: "Select a Shopify blog in Project Setup first." };
      return await upsertArticle(args, false);
    } catch (e) {
      // Preserve the transport classification: only a proven-nothing-created
      // failure may be retried by the scheduled runner.
      return {
        success: false,
        error: e instanceof Error ? e.message : FRIENDLY_CONNECT,
        retryable: e instanceof PublishTransportError ? e.retryable : false,
      };
    }
  });

/**
 * Manual "publish to Shopify live" RPC. Re-derives + authorises the args from the
 * caller's own asset and enforces the full checklist server-side (review fix C)
 * before the live upsert runs. The request body is not trusted.
 */
export const publishShopifyContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArticleInput.parse(input))
  .handler(async ({ data, context }): Promise<ShopifyPublishResult> => {
    let args: z.infer<typeof ArticleInput>;
    try {
      const { serverShopifyArgs } = await import("./connector-guard.server");
      args = await serverShopifyArgs(context.userId as string, data.projectId, data.assetId);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
    try {
      if (!args.blogGid && !args.articleGid)
        return { success: false, error: "Select a Shopify blog in Project Setup first." };
      return await upsertArticle(args, true);
    } catch (e) {
      // Preserve the transport classification: only a proven-nothing-created
      // failure may be retried by the scheduled runner.
      return {
        success: false,
        error: e instanceof Error ? e.message : FRIENDLY_CONNECT,
        retryable: e instanceof PublishTransportError ? e.retryable : false,
      };
    }
  });
