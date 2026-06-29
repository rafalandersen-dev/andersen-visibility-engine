/**
 * Publishing v1 — outbound "create draft on website" server function.
 *
 * The browser must NOT call the client's website endpoint directly, because the
 * publish secret would then be exposed in the page's network traffic. Instead
 * the browser calls THIS server function, which forwards the request to the
 * configured endpoint with the secret in an `x-milo-publish-secret` header.
 *
 * v1 only ever sends `status: "draft"`. No live publishing, no scheduling.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DESTINATION_TYPES = ["blogPost", "servicePage", "faq", "landingPage"] as const;

const PublishInputSchema = z.object({
  endpoint: z.string().default(""),
  secret: z.string().default(""),
  projectId: z.string().default(""),
  assetId: z.string().default(""),
  title: z.string().default(""),
  slug: z.string().default(""),
  assetType: z.string().default("article"),
  destinationType: z.enum(DESTINATION_TYPES),
  language: z.string().default("English"),
  markdown: z.string().default(""),
  metaTitle: z.string().default(""),
  metaDescription: z.string().default(""),
  sourceOpportunityTitle: z.string().default(""),
  sourceType: z.string().default("unknown"),
  createdAt: z.string().default(""),
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

export const publishContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PublishInputSchema.parse(input))
  .handler(async ({ data }) => {
    const endpoint = data.endpoint.trim();
    const secret = data.secret.trim();

    // ---- Validate configuration (never echo the secret back) ----
    if (!endpoint) throw new Error("No publish endpoint configured. Add one in Project Setup.");
    if (!secret) throw new Error("No publish secret configured. Add one in Project Setup.");

    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error("The publish endpoint is not a valid URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("The publish endpoint must start with http:// or https://.");
    }

    const sentAt = new Date().toISOString();
    const payload = {
      source: "milo-growth",
      projectId: data.projectId,
      assetId: data.assetId,
      title: data.title,
      slug: data.slug,
      assetType: data.assetType,
      destinationType: data.destinationType,
      language: data.language,
      markdown: data.markdown,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      sourceOpportunityTitle: data.sourceOpportunityTitle,
      sourceType: data.sourceType,
      status: "draft" as const,
      createdAt: data.createdAt || sentAt,
      sentAt,
    };

    // Log only non-sensitive metadata — never the secret or full body.
    console.info("[publish.functions] sending draft", {
      host: url.host,
      assetId: data.assetId,
      destinationType: data.destinationType,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-milo-publish-secret": secret,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error("Could not reach the website endpoint. Check the URL and try again.");
    } finally {
      clearTimeout(timer);
    }

    // Read the body once, safely.
    const rawText = await res.text().catch(() => "");
    let body: unknown = undefined;
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        body = undefined;
      }
    }

    if (!res.ok) {
      const apiError = isRecord(body) ? asString(body.error) : "";
      throw new Error(
        apiError
          ? `Website rejected the draft: ${apiError}`
          : `Website returned an error (status ${res.status}).`,
      );
    }

    // 2xx but explicit { ok: false }
    if (isRecord(body) && body.ok === false) {
      const apiError = asString(body.error);
      throw new Error(apiError ? `Website rejected the draft: ${apiError}` : "Website rejected the draft.");
    }

    const draftUrl = isRecord(body) ? asString(body.draftUrl) : "";
    const externalId = isRecord(body) ? asString(body.externalId) : "";

    console.info("[publish.functions] draft accepted", {
      host: url.host,
      assetId: data.assetId,
      hasDraftUrl: Boolean(draftUrl),
    });

    return { ok: true as const, draftUrl, externalId, sentAt };
  });
