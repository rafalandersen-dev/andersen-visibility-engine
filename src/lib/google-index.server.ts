import { z } from "zod";
import { inspectionInProperty, inspectionUrl, type GoogleIndexObservation } from "./google-index";
import { technicalCrawlRpc, type TechnicalRpc } from "./technical-crawl.server";
export const googleIndexProject = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
export const googleIndexRequest = googleIndexProject
  .extend({ requestId: z.string().uuid(), url: z.string().max(8192) })
  .strict();
const stored = z.object({
  user_id: z.string().uuid(),
  project_id: z.string(),
  request_id: z.string().uuid(),
  property: z.string(),
  url: z.string(),
  status: z.enum(["running", "succeeded", "failed", "unknown", "held"]),
  observation: z.record(z.unknown()).nullable(),
  error_code: z.enum(["access", "quota", "unavailable"]).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  lease_token: z.string().uuid().optional(),
});
async function call(rpc: TechnicalRpc, name: string, args: Record<string, unknown>) {
  const r = await rpc(name, args);
  if (r.error) throw new Error("google_inspection_unavailable");
  return r.data;
}
function checked(value: unknown, user: string, project: string) {
  const row = stored.parse(value);
  if (
    row.user_id !== user ||
    row.project_id !== project ||
    !inspectionInProperty(row.url, row.property)
  )
    throw new Error("google_inspection_scope");
  return row;
}
function view(row: z.infer<typeof stored>) {
  return {
    requestId: row.request_id,
    property: row.property,
    url: row.url,
    status: row.status,
    error: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    observationJson: row.observation === null ? null : JSON.stringify(row.observation),
  };
}
export async function listGoogleIndex(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = googleIndexProject.parse(raw);
  const data = await call(rpc, "list_google_index_inspections", {
    p_user: user,
    p_project: target.projectId,
  });
  return z
    .array(z.unknown())
    .max(20)
    .parse(data)
    .map((value) => view(checked(value, user, target.projectId)));
}
type Inspect = (
  user: string,
  property: string,
  url: string,
  authorize: () => Promise<boolean>,
) => Promise<GoogleIndexObservation>;
export async function requestGoogleIndex(
  user: string,
  raw: unknown,
  deps: { rpc?: TechnicalRpc; inspect?: Inspect } = {},
) {
  const target = googleIndexRequest.parse(raw),
    rpc = deps.rpc ?? technicalCrawlRpc;
  const scope = { p_user: user, p_project: target.projectId };
  const context = z
    .object({ property: z.string().nullable() })
    .parse(await call(rpc, "read_google_index_context", scope));
  const url = inspectionUrl(target.url);
  if (!url || !context.property || !inspectionInProperty(url, context.property))
    throw new Error("google_inspection_scope");
  const reservation = z.object({ claimed: z.boolean(), record: z.unknown() }).parse(
    await call(rpc, "reserve_google_index_inspection", {
      ...scope,
      p_request: target.requestId,
      p_property: context.property,
      p_url: url,
    }),
  );
  const row = checked(reservation.record, user, target.projectId);
  if (row.request_id !== target.requestId || row.url !== url || row.property !== context.property)
    throw new Error("google_inspection_scope");
  if (!reservation.claimed) return view(row);
  if (!row.lease_token || row.status !== "running")
    throw new Error("google_inspection_unavailable");
  const attempt = { ...scope, p_request: target.requestId, p_lease: row.lease_token };
  let observation: GoogleIndexObservation | null = null,
    error: string | null = null;
  try {
    const inspect = deps.inspect ?? (await import("./gsc-oauth.server")).inspectGoogleIndexForOwner;
    observation = await inspect(user, row.property, row.url, async () =>
      z.boolean().parse(await call(rpc, "authorize_google_index_dispatch", attempt)),
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    error =
      message === "google_inspection_quota"
        ? "quota"
        : [
              "google_inspection_access",
              "not_connected",
              "expired",
              "token_unreadable",
              "not_configured",
            ].includes(message)
          ? "access"
          : "unavailable";
  }
  // Always return the persisted outcome, including a property-change hold or expiry.
  await call(rpc, "finish_google_index_inspection", {
    ...attempt,
    p_observation: observation,
    p_error: error,
  });
  const history = await listGoogleIndex(user, { projectId: target.projectId }, rpc);
  const result = history.find((item) => item.requestId === target.requestId);
  if (!result) throw new Error("google_inspection_unavailable");
  return result;
}
