import { z } from "zod";
import {
  backlinkDetailPayload,
  backlinkDetailScope,
  detailScope,
  normalizeBacklinkDetails,
  type BacklinkDetailScope,
} from "./backlink-details";

const token = z
  .string()
  .min(1)
  .max(8192)
  .refine((value) => new TextEncoder().encode(value).length <= 8192);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Private provider continuation state. Persistence must bind this to the authenticated
 * owner, project and completed parent request. It is never browser-supplied authority. */
export const backlinkContinuation = z
  .object({
    scope: backlinkDetailScope,
    token,
    priorReturnedCount: count.positive(),
    pageNumber: z.number().int().min(2).max(10000),
  })
  .strict();
export type BacklinkContinuation = z.infer<typeof backlinkContinuation>;

function checkedContinuation(raw: unknown, scope: ReturnType<typeof detailScope>) {
  const saved = backlinkContinuation.parse(raw);
  if (JSON.stringify(saved.scope) !== JSON.stringify(scope))
    throw Error("backlink_page_scope_mismatch");
  return saved;
}
/** The provider requires every other request parameter to remain identical, including
 * the original offset. Tokens are opaque; never decode or rebuild them. */
export function backlinkPagePayload(
  raw: BacklinkDetailScope,
  continuation: BacklinkContinuation | null,
  now = new Date(),
) {
  const scope = detailScope(raw, now);
  const payload = backlinkDetailPayload(scope, now);
  return continuation === null
    ? payload
    : {
        ...payload,
        search_after_token: checkedContinuation(continuation, scope).token,
      };
}

/** Pure response normalization only. No persistence, admission or provider call.
 * Row counts describe observations in this chain, not a stable unique-link inventory. */
export function normalizeBacklinkPage(
  raw: unknown,
  requested: BacklinkDetailScope,
  observedAt: string,
  continuation: BacklinkContinuation | null = null,
) {
  const scope = detailScope(requested, new Date(observedAt));
  const previous = continuation === null ? null : checkedContinuation(continuation, scope);
  const observation = normalizeBacklinkDetails(raw, scope, observedAt);
  const envelope = z
    .object({
      tasks: z
        .array(
          z.object({
            data: z.object({ search_after_token: token.or(z.literal("")).nullish() }),
            result: z
              .array(z.object({ search_after_token: token.or(z.literal("")).nullish() }))
              .length(1),
          }),
        )
        .length(1),
    })
    .parse(raw);
  const requestToken = envelope.tasks[0].data.search_after_token || null;
  if (requestToken !== (previous?.token ?? null)) throw Error("backlink_page_echo_mismatch");
  const nextToken = envelope.tasks[0].result[0].search_after_token || null;
  if (nextToken && (nextToken === previous?.token || observation.providerReturnedCount === 0))
    throw Error("backlink_page_did_not_advance");
  const returnedInChain = (previous?.priorReturnedCount ?? 0) + observation.providerReturnedCount;
  if (!Number.isSafeInteger(returnedInChain)) throw Error("backlink_page_count_overflow");
  const pageNumber = previous?.pageNumber ?? 1;
  const pageLimitReached = pageNumber === 10000 && nextToken !== null;
  const next: BacklinkContinuation | null =
    nextToken && !pageLimitReached
      ? {
          scope,
          token: nextToken,
          priorReturnedCount: returnedInChain,
          pageNumber: pageNumber + 1,
        }
      : null;
  return {
    observation: {
      ...observation,
      moreProviderResults:
        Boolean(nextToken) || observation.providerTotalCount - scope.offset > returnedInChain,
    },
    page: { pageNumber, returnedInChain, initialOffset: scope.offset, pageLimitReached },
    continuation: next,
  };
}
