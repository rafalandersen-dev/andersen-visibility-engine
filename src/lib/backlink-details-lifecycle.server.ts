import { z } from "zod";
import { detailScope } from "./backlink-details";
import { fetchBacklinkDetails } from "./backlink-details-transport.server";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import { backlinkDetailsRequest } from "./backlink-details-history";
type Dependencies = {
  rpc?: TeamReadRpc;
  fetch?: typeof fetchBacklinkDetails;
  credentials?: () => { login: string; password: string };
  now?: () => Date;
};
/** Owner-only lifecycle for explicit authenticated collection requests.
 * The request's target is derived from the current saved website, never input. */
export async function runBacklinkDetails(
  userId: string,
  raw: z.infer<typeof backlinkDetailsRequest>,
  deps: Dependencies = {},
) {
  const user = z.string().uuid().parse(userId);
  const input = backlinkDetailsRequest.parse(raw);
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
  const scope = detailScope(
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
      await call("reserve_backlink_details", {
        ...target,
        p_request: input.requestId,
        p_website: context.website,
        p_scope: scope,
      }),
    );
  const record = reservation.record;
  const savedScope = detailScope(record.scope, now());
  if (
    record.user_id !== user ||
    record.project_id !== input.projectId ||
    record.request_id !== input.requestId ||
    record.website_value !== context.website ||
    Object.entries(scope).some(([key, value]) => savedScope[key as keyof typeof scope] !== value)
  )
    throw new Error("backlink_details_scope");
  if (!reservation.claimed) return { state: "existing" as const, requestId: input.requestId };
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
    const allowed = await call("authorize_backlink_details_dispatch", attempt);
    if (allowed !== true) return { state: "held" as const, requestId: input.requestId };
    if (Date.parse(record.lease_until) - now().getTime() < 30000)
      throw new Error("backlink_details_expired");
    const observation = await (deps.fetch ?? fetchBacklinkDetails)(
      scope,
      credentials,
      controller.signal,
    );
    const saved = await call("finish_backlink_details", {
      ...attempt,
      p_observation: observation,
    });
    if (saved !== true) throw new Error("backlink_details_unconfirmed");
    return { state: "stored" as const, requestId: input.requestId, observation };
  } catch {
    // A missing dispatch/finish acknowledgement is never permission to retry.
    try {
      await call("finish_backlink_details", { ...attempt, p_observation: null });
    } catch {
      /* Reservation remains held. */
    }
    return { state: "unknown" as const, requestId: input.requestId };
  } finally {
    controller.abort();
  }
}
