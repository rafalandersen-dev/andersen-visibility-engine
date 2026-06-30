/**
 * WordPress Connector v1 — server-side publishing via the WordPress REST API
 * with an Application Password (Basic auth). All calls are server-only so the
 * application password is never sent from or exposed to the browser network tab,
 * and it is never logged (only the host + post id are logged).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { markdownToHtml, slugifyForPublish } from "./markdown";
import type { WordPressPublishResult } from "./types";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === "string" ? v : "");
const asNumber = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** UTF-8 safe base64 (works in worker/edge runtimes without Buffer). */
function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

function wpBase(siteUrl: string): URL {
  let u = (siteUrl || "").trim();
  if (!u) throw new Error("Add your WordPress site URL in Project Setup.");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error("The WordPress site URL is not valid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The WordPress site URL must start with http:// or https://.");
  }
  return parsed;
}

const FRIENDLY_CONNECT = "Could not connect to WordPress. Check the site URL and application password.";

/** Make an authenticated WordPress REST request. Never logs credentials. */
async function wpRequest(
  base: URL,
  username: string,
  appPassword: string,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<unknown> {
  if (!username.trim() || !appPassword.trim()) {
    throw new Error("Add your WordPress username and application password in Project Setup.");
  }
  const endpoint = `${base.origin}${base.pathname.replace(/\/+$/, "")}/wp-json/wp/v2${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${b64(`${username.trim()}:${appPassword}`)}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(FRIENDLY_CONNECT);
  } finally {
    clearTimeout(timer);
  }

  console.info("[wordpress.functions] request", { host: base.host, path, method, status: res.status });

  const raw = await res.text().catch(() => "");
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = undefined;
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error("WordPress rejected the credentials. Check the username and application password and that the user can publish.");
  }
  if (res.status === 404) {
    throw new Error("WordPress REST API not found at this site URL. Check the URL and that the REST API is enabled.");
  }
  if (!res.ok) {
    const apiMsg = isRecord(parsed) ? asString(parsed.message) : "";
    throw new Error(apiMsg ? `WordPress error: ${apiMsg}` : `WordPress returned an error (status ${res.status}).`);
  }
  return parsed;
}

export const testWordPressConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ siteUrl: z.string(), username: z.string(), applicationPassword: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<WordPressPublishResult> => {
    try {
      const base = wpBase(data.siteUrl);
      const me = await wpRequest(base, data.username, data.applicationPassword, "/users/me?context=edit", "GET");
      const name = isRecord(me) ? asString(me.name) || asString(me.slug) : "";
      return { success: true, message: name ? `Connected as ${name}.` : "Connected to WordPress." };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
  });

const ContentInput = z.object({
  siteUrl: z.string(),
  username: z.string(),
  applicationPassword: z.string(),
  postType: z.enum(["post", "page"]).default("post"),
  postId: z.number().optional(),
  title: z.string().default(""),
  contentMarkdown: z.string().default(""),
  slug: z.string().default(""),
  excerpt: z.string().default(""),
});

function restType(postType: "post" | "page"): string {
  return postType === "page" ? "pages" : "posts";
}
function editUrlFor(base: URL, id: number): string {
  return `${base.origin}${base.pathname.replace(/\/+$/, "")}/wp-admin/post.php?post=${id}&action=edit`;
}

export const sendContentToWordPressDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContentInput.parse(input))
  .handler(async ({ data }): Promise<WordPressPublishResult> => {
    try {
      const base = wpBase(data.siteUrl);
      const html = markdownToHtml(data.contentMarkdown);
      const type = restType(data.postType);
      let result: unknown;
      if (data.postId) {
        // Update existing item; do NOT change its publish status or slug.
        result = await wpRequest(base, data.username, data.applicationPassword, `/${type}/${data.postId}`, "POST", {
          title: data.title,
          content: html,
          ...(data.excerpt ? { excerpt: data.excerpt } : {}),
        });
      } else {
        result = await wpRequest(base, data.username, data.applicationPassword, `/${type}`, "POST", {
          title: data.title,
          content: html,
          status: "draft",
          slug: slugifyForPublish(data.slug || data.title),
          ...(data.excerpt ? { excerpt: data.excerpt } : {}),
        });
      }
      const r = isRecord(result) ? result : {};
      const postId = asNumber(r.id);
      return {
        success: true,
        postId,
        postType: data.postType,
        status: "draft",
        editUrl: postId ? editUrlFor(base, postId) : undefined,
        liveUrl: asString(r.link) || undefined,
        message: "WordPress accepted the content as a draft.",
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
  });

export const publishWordPressContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContentInput.parse(input))
  .handler(async ({ data }): Promise<WordPressPublishResult> => {
    try {
      const base = wpBase(data.siteUrl);
      const html = markdownToHtml(data.contentMarkdown);
      const type = restType(data.postType);
      let result: unknown;
      if (data.postId) {
        result = await wpRequest(base, data.username, data.applicationPassword, `/${type}/${data.postId}`, "POST", {
          title: data.title,
          content: html,
          status: "publish",
          ...(data.excerpt ? { excerpt: data.excerpt } : {}),
        });
      } else {
        // No existing item — create and publish in one call.
        result = await wpRequest(base, data.username, data.applicationPassword, `/${type}`, "POST", {
          title: data.title,
          content: html,
          status: "publish",
          slug: slugifyForPublish(data.slug || data.title),
          ...(data.excerpt ? { excerpt: data.excerpt } : {}),
        });
      }
      const r = isRecord(result) ? result : {};
      const postId = asNumber(r.id);
      const liveUrl = asString(r.link);
      return {
        success: true,
        postId,
        postType: data.postType,
        status: "publish",
        editUrl: postId ? editUrlFor(base, postId) : undefined,
        liveUrl: liveUrl || undefined,
        message: "WordPress published the content live.",
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : FRIENDLY_CONNECT };
    }
  });
