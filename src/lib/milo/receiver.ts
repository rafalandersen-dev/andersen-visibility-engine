// =============================================================================
// Milo Growth publishing receiver for milogrowth.com (pure, runtime-agnostic).
// Contract: MILO-WEBSITE-CONNECTOR.md. Order: method, secret configured (503),
// auth (401), content type, byte-capped body, JSON, strict schema, storage.
// Errors return a code only; payloads and secrets are never echoed or logged.
// =============================================================================

import { z } from "zod";
import { SITE_ORIGIN } from "../locales.ts";
import { MarkdownRejected, markdownToSections, type BlogSection } from "./markdown.ts";
import { STATIC_POSTS } from "./static-posts.ts";

export const MILO_SOURCE = "milo-growth";
export const MILO_SECRET_HEADER = "x-milo-publish-secret";
/** The only Milo project allowed to write to this site. */
export const MILO_PROJECT_ID = "ijnag106";
export const MIN_SECRET_LENGTH = 32;
const MAX_BODY_BYTES = 512 * 1024;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z.string().min(1).max(120).regex(SLUG_RE);
const id = z.string().trim().min(1).max(200);

export const draftSchema = z
  .object({
    source: z.literal(MILO_SOURCE),
    projectId: id,
    assetId: id,
    title: z.string().trim().min(1).max(300),
    slug,
    assetType: z.string().trim().min(1).max(64),
    destinationType: z.string().trim().min(1).max(64),
    language: z.string().trim().min(1).max(32),
    markdown: z.string().min(1).max(200_000),
    // Milo sends an empty string when there is no meta title.
    metaTitle: z.string().trim().max(300),
    metaDescription: z.string().trim().max(1000),
    sourceOpportunityTitle: z.string().max(500).nullable().optional(),
    sourceType: z.string().max(64).nullable().optional(),
    status: z.literal("draft"),
    createdAt: z.string().max(64),
    sentAt: z.string().max(64),
  })
  .strict();

export const liveSchema = z
  .object({
    source: z.literal(MILO_SOURCE),
    projectId: id,
    assetId: id,
    externalId: z.string().trim().min(1).max(200),
    slug,
    destinationType: z.string().trim().min(1).max(64),
  })
  .strict();

export interface DraftRow {
  id: string;
  slug: string;
  title: string;
  meta_title: string;
  meta_description: string;
  sections: BlogSection[];
  published_slug: string | null;
}

/** Storage port. `upsertDraft` must throw `{ code: "23505" }` on a slug clash. */
export interface MiloStore {
  getDraft(projectId: string, assetId: string): Promise<DraftRow | null>;
  upsertDraft(row: {
    project_id: string;
    asset_id: string;
    slug: string;
    title: string;
    meta_title: string;
    meta_description: string;
    markdown: string;
    sections: BlogSection[];
  }): Promise<{ id: string }>;
  /** Idempotent: creates or refreshes the public copy of this draft. */
  publish(draft: DraftRow): Promise<void>;
}

export interface MiloDeps {
  /** Value of MILO_PUBLISH_SECRET, read per request. Missing or short gives 503. */
  secret: string | undefined;
  /** Created lazily, only after auth and a valid payload. */
  store: () => MiloStore | Promise<MiloStore>;
}

class Rejected extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
const fail = (status: number, error: string) => json(status, { ok: false, error });

const digest = async (v: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));

/** Constant-time comparison over SHA-256 digests (length-independent). */
export async function secretMatches(provided: string | null, expected: string) {
  if (!provided) return false;
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Reads at most `cap` bytes, cancelling as soon as it is exceeded (Content-Length is not trusted). */
async function readBodyCapped(request: Request, cap: number) {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared) > cap) {
    await request.body?.cancel().catch(() => {});
    return null;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

const isEnglish = (v: string) => ["english", "en"].includes(v.trim().toLowerCase());

function checkTarget(projectId: string, destinationType: string, slugValue: string) {
  if (projectId !== MILO_PROJECT_ID) throw new Rejected(422, "unknown_project");
  if (destinationType !== "blogPost") throw new Rejected(422, "unsupported_destination");
  if (STATIC_POSTS.some((p) => p.slug === slugValue)) throw new Rejected(409, "slug_reserved");
}

async function receiveDraft(store: MiloStore, input: z.infer<typeof draftSchema>) {
  checkTarget(input.projectId, input.destinationType, input.slug);
  if (!isEnglish(input.language)) throw new Rejected(422, "unsupported_language");

  let sections: BlogSection[];
  try {
    sections = markdownToSections(input.markdown, input.title);
  } catch (err) {
    if (err instanceof MarkdownRejected) throw new Rejected(422, err.code);
    throw err;
  }
  if (sections.length === 0) throw new Rejected(422, "empty_content");

  const existing = await store.getDraft(input.projectId, input.assetId);
  if (existing?.published_slug && existing.published_slug !== input.slug) {
    throw new Rejected(409, "slug_locked_after_publish");
  }
  try {
    const { id: externalId } = await store.upsertDraft({
      project_id: input.projectId,
      asset_id: input.assetId,
      slug: input.slug,
      title: input.title,
      meta_title: input.metaTitle,
      meta_description: input.metaDescription,
      markdown: input.markdown,
      sections,
    });
    // No private preview exists, so no draftUrl: unpublished content stays private.
    return { ok: true, externalId };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new Rejected(409, "slug_conflict");
    throw err;
  }
}

async function receiveLive(store: MiloStore, input: z.infer<typeof liveSchema>) {
  checkTarget(input.projectId, input.destinationType, input.slug);
  const draft = await store.getDraft(input.projectId, input.assetId);
  if (!draft) throw new Rejected(404, "draft_not_found");
  if (draft.id !== input.externalId) throw new Rejected(409, "receipt_unknown");
  if (draft.slug !== input.slug) throw new Rejected(409, "slug_mismatch");
  await store.publish(draft);
  return { ok: true, liveUrl: `${SITE_ORIGIN}/blog/${draft.slug}`, externalId: draft.id };
}

export async function handleMiloRequest(
  kind: "draft" | "live",
  request: Request,
  deps: MiloDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" }, { Allow: "POST" });
  }
  const secret = deps.secret?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(`[milo] ${kind}: publishing secret not configured, refusing request`);
    return fail(503, "publishing_not_configured");
  }
  if (!(await secretMatches(request.headers.get(MILO_SECRET_HEADER), secret))) {
    return fail(401, "unauthorized");
  }
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (contentType.toLowerCase() !== "application/json") return fail(415, "unsupported_media_type");

  let text: string | null;
  try {
    text = await readBodyCapped(request, MAX_BODY_BYTES);
  } catch {
    return fail(400, "invalid_encoding");
  }
  if (text === null) return fail(413, "payload_too_large");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json");
  }
  const parsed = (kind === "draft" ? draftSchema : liveSchema).safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))];
    return json(400, { ok: false, error: "invalid_payload", fields: fields.slice(0, 20) });
  }

  try {
    const store = await deps.store();
    const result =
      kind === "draft"
        ? await receiveDraft(store, parsed.data as z.infer<typeof draftSchema>)
        : await receiveLive(store, parsed.data as z.infer<typeof liveSchema>);
    return json(200, result);
  } catch (err) {
    if (err instanceof Rejected) return fail(err.status, err.code);
    console.error(`[milo] ${kind}: internal error`, err instanceof Error ? err.name : "unknown");
    return fail(500, "internal_error");
  }
}
