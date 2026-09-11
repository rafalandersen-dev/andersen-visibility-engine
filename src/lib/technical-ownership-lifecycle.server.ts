import { z } from "zod";
import { crawlOwnershipChallenge, verifyCrawlOwnershipDns } from "./technical-ownership.server";
import {
  technicalCrawlRpc,
  technicalProjectTarget,
  type TechnicalRpc,
} from "./technical-crawl.server";
const proofRow = z
  .object({
    user_id: z.string().uuid(),
    project_id: z.string(),
    website_value: z.string().min(1).max(8192),
    origin: z.string().max(8192),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    issued_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
    verified_until: z.string().datetime({ offset: true }).nullable(),
    revoked_at: z.string().datetime({ offset: true }).nullable(),
    attempt_token: z.string().uuid().nullable().optional(),
    attempt_until: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .passthrough();
function canonical(value: string) {
  const raw = value.trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (url.username || url.password) throw new Error("technical_ownership_unavailable");
  return crawlOwnershipChallenge(url.origin).origin;
}
async function call(rpc: TechnicalRpc, name: string, args: Record<string, unknown>) {
  const result = await rpc(name, args);
  if (result.error) throw new Error("technical_ownership_unavailable");
  return result.data;
}
function checked(raw: unknown, user: string, project: string) {
  const row = proofRow.parse(raw);
  if (
    row.user_id !== user ||
    row.project_id !== project ||
    canonical(row.website_value) !== row.origin
  )
    throw new Error("technical_ownership_unavailable");
  crawlOwnershipChallenge(row.origin, row.token);
  return row;
}
function view(row: z.infer<typeof proofRow>, now = Date.now()) {
  const dns = crawlOwnershipChallenge(row.origin, row.token);
  return {
    origin: row.origin,
    name: dns.name,
    value: dns.value,
    expiresAt: row.expires_at,
    verifiedUntil: row.verified_until,
    status: row.revoked_at
      ? ("revoked" as const)
      : Date.parse(row.expires_at) <= now
        ? ("expired" as const)
        : row.verified_until && Date.parse(row.verified_until) > now
          ? ("verified" as const)
          : ("pending" as const),
  };
}
export async function readCrawlOwnership(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const { projectId } = technicalProjectTarget.parse(raw);
  const result = await call(rpc, "read_technical_crawl_ownership", {
    p_user: user,
    p_project: projectId,
  });
  return result === null ? null : view(checked(result, user, projectId));
}
export async function issueCrawlOwnership(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const { projectId } = technicalProjectTarget.parse(raw);
  const context = z
    .object({ website: z.string().min(1).max(8192) })
    .passthrough()
    .parse(await call(rpc, "read_technical_crawl_context", { p_user: user, p_project: projectId }));
  const challenge = crawlOwnershipChallenge(canonical(context.website));
  const result = await call(rpc, "issue_technical_crawl_ownership", {
    p_user: user,
    p_project: projectId,
    p_website: context.website,
    p_origin: challenge.origin,
    p_token: challenge.token,
  });
  return view(checked(result, user, projectId));
}
export async function verifyCrawlOwnership(
  user: string,
  raw: unknown,
  deps = {
    rpc: technicalCrawlRpc as TechnicalRpc,
    verify: verifyCrawlOwnershipDns,
    now: () => Date.now(),
  },
) {
  const { projectId } = technicalProjectTarget.parse(raw);
  const row = checked(
    await call(deps.rpc, "begin_technical_ownership_verification", {
      p_user: user,
      p_project: projectId,
    }),
    user,
    projectId,
  );
  // A saved, freshly admitted attempt is the only input to DNS; the browser supplies no proof.
  if (
    !row.attempt_token ||
    !row.attempt_until ||
    row.revoked_at ||
    Date.parse(row.expires_at) <= deps.now() ||
    Date.parse(row.attempt_until) - deps.now() < 5000
  )
    throw new Error("technical_ownership_unavailable");
  let verified = false;
  try {
    verified = await deps.verify(row.origin, row.token);
  } catch {
    verified = false;
  }
  await call(deps.rpc, "finish_technical_ownership_verification", {
    p_user: user,
    p_project: projectId,
    p_attempt: row.attempt_token,
    p_verified: verified === true,
  });
  return readCrawlOwnership(user, { projectId }, deps.rpc);
}
export async function revokeCrawlOwnership(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const { projectId } = technicalProjectTarget.parse(raw);
  await call(rpc, "revoke_technical_crawl_ownership", { p_user: user, p_project: projectId });
  return readCrawlOwnership(user, { projectId }, rpc);
}
