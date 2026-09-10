import { z } from "zod";

const identity = z.string().min(1).max(200);
const instant = z.string().datetime({ offset: true });
const workspaceSchema = z.object({
  projects: z.array(z.object({ id: identity })).max(1000),
  content: z.array(z.object({ id: identity, projectId: identity, updatedAt: instant })).max(5000),
});
const queueSchema = z
  .array(
    z.object({
      status: z.enum([
        "pending",
        "publishing",
        "published",
        "failed",
        "cancelled",
        "review_required",
      ]),
      attempts: z.number().int().nonnegative(),
      updated_at: instant,
      last_error: z.string().nullable(),
    }),
  )
  .max(1);

type Check = "links" | "sourcesReview" | "author";
export interface PublicationFailureReason {
  kind: "contentReview" | "destination" | "configuration" | "unknown";
  checks: Check[];
  httpStatus?: number;
}

/** Interpret only bounded, recognized Milo messages. Never return provider
 * bodies, URLs, secrets or free-form errors to the client. Historical text is
 * a hint for review, never permission to publish or proof of no side effect.
 */
export function publicationFailureReason(error: string | null): PublicationFailureReason {
  const unknown: PublicationFailureReason = { kind: "unknown", checks: [] };
  if (!error || error.length > 8192) return unknown;
  if (error.startsWith("This draft is not publishable yet: ")) {
    const checks: Check[] = [];
    if (/unresolved internal link\(s\):/.test(error)) checks.push("links");
    if (/need a verified source or a resolved author, plus human review\./.test(error))
      checks.push("sourcesReview");
    if (/YMYL content needs a named author with a real bio, credential or profile/.test(error))
      checks.push("author");
    return { kind: "contentReview", checks };
  }
  const http = /^Website returned an error \(status ([45]\d\d)\)\.$/.exec(error);
  if (http) return { kind: "destination", checks: [], httpStatus: Number(http[1]) };
  if (
    [
      "Could not reach the website endpoint. Check the URL and try again.",
      "Could not reach the live-publish endpoint. Check the URL and try again.",
    ].includes(error)
  )
    return { kind: "destination", checks: [] };
  if (
    [
      "No publish endpoint configured. Add one in Project Setup.",
      "No live-publish endpoint configured. Add one in Project Setup.",
      "No publish secret configured. Add one in Project Setup.",
      "The publish endpoint is not a valid URL.",
      "The live-publish endpoint is not a valid URL.",
      "The publish endpoint must start with http:// or https://.",
      "The live-publish endpoint must start with http:// or https://.",
    ].includes(error)
  )
    return { kind: "configuration", checks: [] };
  return unknown;
}

type Response = { data: unknown; error: unknown };
interface Query extends PromiseLike<Response> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  limit(n: number): Query;
}
interface Dependencies {
  workspace(userId: string): Promise<{ data: unknown; rev: number } | null>;
  db: { from(table: string): Query };
}

export async function inspectPublicationFailure(
  userId: string,
  projectId: string,
  assetId: string,
  queueId: string,
  now = new Date(),
  deps?: Dependencies,
) {
  identity.parse(projectId);
  identity.parse(assetId);
  z.string().uuid().parse(queueId);
  if (!deps) {
    const { readWorkspaceRow } = await import("./workspace.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    deps = { workspace: readWorkspaceRow, db: supabaseAdmin as unknown as Dependencies["db"] };
  }
  const row = await deps.workspace(userId);
  if (!row) throw new Error("publication_inspection_unavailable");
  const workspace = workspaceSchema.parse(row.data);
  const projects = workspace.projects.filter((p) => p.id === projectId);
  const assets = workspace.content.filter((a) => a.id === assetId);
  if (projects.length !== 1 || assets.length !== 1 || assets[0].projectId !== projectId)
    throw new Error("publication_inspection_unavailable");
  // Confirm both project and asset ownership before the service-role query.
  const response = await deps.db
    .from("scheduled_publishes")
    .select("status,attempts,updated_at,last_error")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("asset_id", assetId)
    .eq("id", queueId)
    .limit(2);
  if (response.error) throw new Error("publication_inspection_unavailable");
  const queue = queueSchema.parse(response.data)[0];
  const base = { checkedAt: now.toISOString() };
  if (!queue) return { ...base, state: "absent" as const };
  if (queue.status !== "failed") return { ...base, state: "changed" as const };
  return {
    ...base,
    state: "failed" as const,
    recordedAt: queue.updated_at,
    attempts: queue.attempts,
    draftChanged: Date.parse(assets[0].updatedAt) > Date.parse(queue.updated_at),
    reason: publicationFailureReason(queue.last_error),
  };
}
