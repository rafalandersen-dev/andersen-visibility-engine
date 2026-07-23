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
import { ambiguousTransportFailure, classifyHttpFailure } from "./publish-outcome";
import { publishBlockers } from "./checklist";
import { assembleContentAsset } from "./content-assembler";
import type { ContentAsset, Project } from "./types";

const DESTINATION_TYPES = ["blogPost", "servicePage", "faq", "landingPage"] as const;

/**
 * Resolve the publish target from the CALLER'S OWN workspace.
 *
 * The endpoint and secret used to be sent up in the request body. That made the
 * server an open forwarder: an authenticated caller could hand it any URL and it
 * would POST there. It also made any per-domain publishing limit unenforceable,
 * because the domain the counter would key on came from the same request it was
 * supposed to constrain. Both are fixed by never trusting the client for this —
 * the browser now sends only ids, and the target is derived server-side.
 */
async function resolvePublishContext(
  userId: string,
  projectId: string,
  assetId: string,
): Promise<{
  asset: ContentAsset;
  project: Project;
  corpus: ContentAsset[];
  draftEndpoint: string;
  liveEndpoint: string;
  secret: string;
}> {
  const { readWorkspaceRow } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("Workspace not found.");
  const projects = (row.data.projects as Project[] | undefined) ?? [];
  const content = (row.data.content as ContentAsset[] | undefined) ?? [];
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found in your workspace.");
  const asset = content.find((c) => c.id === assetId);
  if (!asset) throw new Error("Content not found in your workspace.");
  return {
    asset,
    project,
    corpus: content,
    draftEndpoint: (project.publishEndpoint ?? "").trim(),
    liveEndpoint: (project.livePublishEndpoint ?? "").trim(),
    secret: (project.publishSecret ?? "").trim(),
  };
}

/**
 * The SAME deterministic publishing checklist the editor and cron use, enforced
 * SERVER-SIDE on the manual custom-endpoint RPCs so a direct call cannot bypass a
 * hard blocker (review fix — dimension 4).
 */
function assertPublishableServerSide(
  asset: ContentAsset,
  project: Project,
  corpus: ContentAsset[],
): void {
  const blockers = publishBlockers(asset, project, corpus);
  if (blockers.length) {
    throw new Error(
      `This draft is not publishable yet: ${blockers.map((b) => b.detail || b.label).join(" ")}`,
    );
  }
}

export const PublishInputSchema = z.object({
  // endpoint/secret deliberately absent — resolved server-side, see resolvePublishTarget.
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

/**
 * The draft payload for an asset, derived entirely server-side — the ONE
 * builder shared by the manual publish-live flow and the scheduled runner, so
 * a re-publish transmits exactly what a scheduled publish would. The body is
 * always the canonical assembled markdown (P1.1 B), never client-supplied.
 */
export function draftPayloadFor(
  asset: ContentAsset,
  project: Project,
): z.infer<typeof PublishInputSchema> {
  return {
    projectId: project.id,
    assetId: asset.id,
    title: asset.title,
    slug: asset.publishSlug || asset.slug || "",
    assetType: asset.assetType ?? "article",
    destinationType: asset.publishDestinationType ?? project.defaultDestinationType ?? "blogPost",
    language: asset.language ?? project.primaryLanguage ?? "English",
    markdown: assembleContentAsset(asset, project).markdown,
    metaTitle: asset.metaTitle ?? "",
    metaDescription: asset.metaDescription ?? "",
    sourceOpportunityTitle: asset.sourceOpportunityTitle ?? asset.title,
    sourceType: asset.sourceType ?? "unknown",
    createdAt: asset.createdAt ?? asset.updatedAt ?? "",
  };
}

/**
 * Send a content asset to the website as a DRAFT. Plain function — no auth
 * middleware — so both the browser server fn below and the scheduled-publish
 * runner can call it. The runner needs it because the custom-endpoint contract
 * requires the draft to exist before it can be flipped live.
 */
export async function publishDraftDirect(
  data: z.infer<typeof PublishInputSchema> & { endpoint: string; secret: string },
): Promise<{ ok: true; draftUrl: string; externalId: string; sentAt: string }> {
  {
    const { endpoint, secret } = data;

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
      throw classifyHttpFailure(
        res.status,
        apiError
          ? `Website rejected the draft: ${apiError}`
          : `Website returned an error (status ${res.status}).`,
      );
    }

    // 2xx but explicit { ok: false }
    if (isRecord(body) && body.ok === false) {
      const apiError = asString(body.error);
      throw new Error(
        apiError ? `Website rejected the draft: ${apiError}` : "Website rejected the draft.",
      );
    }

    const draftUrl = isRecord(body) ? asString(body.draftUrl) : "";
    const externalId = isRecord(body) ? asString(body.externalId) : "";

    console.info("[publish.functions] draft accepted", {
      host: url.host,
      assetId: data.assetId,
      hasDraftUrl: Boolean(draftUrl),
    });

    return { ok: true as const, draftUrl, externalId, sentAt };
  }
}

export const publishContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PublishInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Target + content come from the caller's own workspace, never from the request.
    const {
      asset,
      project,
      corpus,
      draftEndpoint: endpoint,
      secret,
    } = await resolvePublishContext(context.userId as string, data.projectId, data.assetId);
    assertPublishableServerSide(asset, project, corpus);
    // Re-derive the body server-side — never forward client-supplied markdown.
    const markdown = assembleContentAsset(asset, project).markdown;
    return publishDraftDirect({ ...data, markdown, endpoint, secret });
  });

// ============================================================
// Publishing v1.1 — publish an existing draft LIVE on the website
// ============================================================

/**
 * Input to the plain publishLiveDirect transport. endpoint/secret ARE present
 * here because the server-side callers (the browser server fn below, and the
 * cron runner via publish.server.ts) both resolve them from the workspace
 * first. The browser never supplies them.
 */
export const PublishLiveInputSchema = z.object({
  endpoint: z.string().default(""),
  secret: z.string().default(""),
  projectId: z.string().default(""),
  assetId: z.string().default(""),
  externalId: z.string().default(""),
  slug: z.string().default(""),
  destinationType: z.enum(DESTINATION_TYPES),
});

/**
 * POST a live-publish instruction to a custom website endpoint. Plain function
 * — no auth middleware — so the scheduled-publish cron runner can call it too.
 *
 * The receiving endpoint upserts by slug/assetId (see MILO-WEBSITE-CONNECTOR.md),
 * so repeating this call updates the same page rather than creating a duplicate.
 */
export async function publishLiveDirect(
  data: z.infer<typeof PublishLiveInputSchema>,
): Promise<{ ok: true; liveUrl: string; externalId: string; publishedAt: string }> {
  {
    const endpoint = data.endpoint.trim();
    const secret = data.secret.trim();

    if (!endpoint)
      throw new Error("No live-publish endpoint configured. Add one in Project Setup.");
    if (!secret) throw new Error("No publish secret configured. Add one in Project Setup.");

    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error("The live-publish endpoint is not a valid URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("The live-publish endpoint must start with http:// or https://.");
    }

    const payload = {
      source: "milo-growth",
      projectId: data.projectId,
      assetId: data.assetId,
      externalId: data.externalId,
      slug: data.slug,
      destinationType: data.destinationType,
    };

    console.info("[publish.functions] publishing live", {
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
      // Unknown outcome: the site may have published before the connection died.
      throw ambiguousTransportFailure(
        "Could not reach the live-publish endpoint. Check the URL and try again.",
      );
    } finally {
      clearTimeout(timer);
    }

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
      throw classifyHttpFailure(
        res.status,
        apiError
          ? `Website rejected the publish: ${apiError}`
          : `Website returned an error (status ${res.status}).`,
      );
    }

    if (isRecord(body) && body.ok === false) {
      const apiError = asString(body.error);
      throw classifyHttpFailure(
        400,
        apiError ? `Website rejected the publish: ${apiError}` : "Website rejected the publish.",
      );
    }

    const liveUrl = isRecord(body) ? asString(body.liveUrl) : "";
    const externalId = isRecord(body) ? asString(body.externalId) : "";
    // Deliberately NOT an error. The publish succeeded; the endpoint simply did
    // not tell us where it landed. Failing here would send the queue row back to
    // 'pending' and republish a page that is already live.

    const publishedAt = new Date().toISOString();
    console.info("[publish.functions] live publish accepted", {
      host: url.host,
      assetId: data.assetId,
    });

    return { ok: true as const, liveUrl, externalId, publishedAt };
  }
}

export const publishLiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    // The browser sends ids only; endpoint/secret are resolved server-side.
    PublishLiveInputSchema.omit({ endpoint: true, secret: true }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { asset, project, corpus, draftEndpoint, liveEndpoint, secret } =
      await resolvePublishContext(context.userId as string, data.projectId, data.assetId);
    // Refuse to flip a draft live if the asset now fails a hard blocker.
    assertPublishableServerSide(asset, project, corpus);
    // ALWAYS refresh the draft before flipping live. The live instruction
    // carries NO content — the site's draft endpoint is the only thing that
    // transmits the body, and it upserts idempotently by assetId. Skipping this
    // made "Re-publish live" a silent no-op on already-published pages: the
    // receiving endpoint answered `alreadyPublished: ok` without writing a byte,
    // Milo recorded "Published", and the live page kept serving the old copy
    // (verified live on synergymassage.se, 2026-07-23).
    const draft = await publishDraftDirect({
      ...draftPayloadFor(asset, project),
      endpoint: draftEndpoint,
      secret,
    });
    return publishLiveDirect({
      ...data,
      externalId: draft.externalId || data.externalId,
      endpoint: liveEndpoint,
      secret,
    });
  });
