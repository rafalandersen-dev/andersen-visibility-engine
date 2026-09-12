import { z } from "zod";
import { detailScope } from "./backlink-details";
import { fetchBacklinkPage } from "./backlink-details-transport.server";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import { backlinkPageRequest } from "./backlink-details-history";
import { backlinkContinuation, type BacklinkContinuation } from "./backlink-pagination";
type Dependencies = {
  rpc?: TeamReadRpc;
  fetch?: typeof fetchBacklinkPage;
  credentials?: () => { login: string; password: string };
  now?: () => Date;
};
/** Owner-only lifecycle for explicit authenticated collection requests.
 * The request's target is derived from the current saved website, never input. */
export async function runBacklinkDetails(
  userId: string,
  raw: z.infer<typeof backlinkPageRequest>,
  deps: Dependencies = {},
) {
  const user = z.string().uuid().parse(userId);
  const input = backlinkPageRequest.parse(raw);
  const rpc = deps.rpc ?? projectTeamRpc;
  const now = deps.now ?? (() => new Date());
  const suppliedCredentials = (
    deps.credentials ??
    (() => ({
      login: process.env.DATAFORSEO_LOGIN ?? "",
      password: process.env.DATAFORSEO_PASSWORD ?? "",
    }))
  )();
  const credentials = {
    login: suppliedCredentials.login.trim(),
    password: suppliedCredentials.password.trim(),
  };
  if (!credentials.login || !credentials.password) throw new Error("backlink_details_unconfigured");
  const call = (name: string, args: Record<string, unknown>) => teamCall(name, args, rpc);
  const target = { p_user: user, p_project: input.projectId };
  const context = z
    .object({ website: z.string().min(1).max(8192) })
    .parse(await call("read_backlink_monitoring_context", target));
  if (context.website.trim() !== input.expectedWebsite)
    return { state: "website_changed" as const, requestId: input.requestId };
  const website = new URL(
    /^https?:\/\//i.test(context.website.trim())
      ? context.website.trim()
      : `https://${context.website.trim()}`,
  );
  if (!["http:", "https:"].includes(website.protocol) || website.username || website.password)
    throw new Error("backlink_details_scope");
  const parentRequestId = "parentRequestId" in input ? input.parentRequestId : null;
  const scope =
    "parentRequestId" in input
      ? null
      : detailScope(
          {
            target: website.hostname,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            includeSubdomains: input.includeSubdomains,
            selection: input.selection,
            limit: input.limit,
            offset: input.offset,
          },
          now(),
        );
  const reservation = z
    .object({
      claimed: z.boolean(),
      page: z
        .object({
          parentRequestId: z.string().uuid().nullable(),
          pageNumber: z.number().int().min(1).max(10000),
          priorReturnedCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          requestCursor: z.string().nullable(),
        })
        .strict()
        .optional(),
      record: z.object({
        user_id: z.string().uuid(),
        project_id: z.string(),
        request_id: z.string().uuid(),
        website_value: z.string(),
        scope: z.unknown(),
        lease_token: z.string().uuid().optional(),
        lease_until: z.string().optional(),
      }),
    })
    .parse(
      await call("reserve_backlink_page", {
        ...target,
        p_request: input.requestId,
        p_website: context.website,
        p_scope: scope,
        p_parent: parentRequestId,
      }),
    );
  const record = reservation.record;
  const savedScope = detailScope(record.scope, now());
  if (
    record.user_id !== user ||
    record.project_id !== input.projectId ||
    record.request_id !== input.requestId ||
    record.website_value !== context.website ||
    savedScope.target !== website.hostname.toLowerCase() ||
    (scope !== null && JSON.stringify(savedScope) !== JSON.stringify(scope))
  )
    throw new Error("backlink_details_scope");
  if (!reservation.claimed) return { state: "existing" as const, requestId: input.requestId };
  const page = reservation.page;
  if (
    !page ||
    page.parentRequestId !== parentRequestId ||
    (parentRequestId === null &&
      (page.pageNumber !== 1 || page.priorReturnedCount !== 0 || page.requestCursor !== null))
  )
    throw new Error("backlink_details_unconfirmed");
  const continuation: BacklinkContinuation | null =
    parentRequestId === null
      ? null
      : backlinkContinuation.parse({
          scope: savedScope,
          token: page.requestCursor,
          priorReturnedCount: page.priorReturnedCount,
          pageNumber: page.pageNumber,
        });
  if (
    !record.lease_token ||
    !record.lease_until ||
    !Number.isFinite(Date.parse(record.lease_until))
  )
    throw new Error("backlink_details_unconfirmed");
  const attempt = { ...target, p_request: input.requestId, p_lease: record.lease_token };
  const controller = new AbortController();
  try {
    // Reserve 10s for dispatch admission, 15s for transport, 10s for saving,
    // and 5s for processing/round-trip overhead. Recheck after admission.
    if (Date.parse(record.lease_until) - now().getTime() < 40000)
      return { state: "held" as const, requestId: input.requestId };
    const allowed = await call("authorize_backlink_page_dispatch", attempt);
    if (allowed !== true) return { state: "held" as const, requestId: input.requestId };
    if (Date.parse(record.lease_until) - now().getTime() < 30000)
      throw new Error("backlink_details_expired");
    const result = await (deps.fetch ?? fetchBacklinkPage)(
      savedScope,
      credentials,
      controller.signal,
      continuation,
    );
    const saved = await call("finish_backlink_page", {
      ...attempt,
      p_observation: result.observation,
      p_next_cursor: result.continuation?.token ?? null,
    });
    if (saved !== true) throw new Error("backlink_details_unconfirmed");
    return {
      state: "stored" as const,
      requestId: input.requestId,
      observation: result.observation,
    };
  } catch {
    // A missing dispatch/finish acknowledgement is never permission to retry.
    try {
      await call("finish_backlink_page", { ...attempt, p_observation: null, p_next_cursor: null });
    } catch {
      /* Reservation remains held. */
    }
    return { state: "unknown" as const, requestId: input.requestId };
  } finally {
    controller.abort();
  }
}
