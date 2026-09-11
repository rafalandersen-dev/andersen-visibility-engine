import { z } from "zod";
import {
  technicalFindingCodes,
  technicalFindings,
  technicalFindingLabels,
} from "./technical-findings";
import {
  readTechnicalRun,
  technicalCrawlRpc,
  technicalRunTarget,
  type TechnicalRpc,
} from "./technical-crawl.server";
export const technicalFindingTarget = technicalRunTarget
  .extend({
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    pageIndex: z.number().int().min(0).max(199),
    code: z.enum(technicalFindingCodes),
  })
  .strict();
const receipt = z
  .object({
    opportunityExists: z.boolean(),
    evidenceId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function captureTechnicalFinding(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = technicalFindingTarget.parse(raw);
  const run = await readTechnicalRun(
    user,
    { projectId: target.projectId, runId: target.runId },
    rpc,
  );
  const page = run?.state?.pages[target.pageIndex];
  if (
    !run ||
    run.revision !== target.revision ||
    !["completed", "cancelled", "held"].includes(run.status) ||
    !page ||
    !technicalFindings(page).includes(target.code)
  )
    throw new Error("technical_finding_changed");
  const context = await rpc("read_technical_crawl_context", {
    p_user: user,
    p_project: target.projectId,
  });
  if (context.error) throw new Error("technical_finding_unavailable");
  const locale =
    z.object({ appLanguage: z.string().optional() }).parse(context.data).appLanguage ?? "en";
  const title = (technicalFindingLabels[locale] ?? technicalFindingLabels.en)[target.code];
  const result = await rpc("capture_technical_crawl_finding", {
    p_user: user,
    p_project: target.projectId,
    p_run: target.runId,
    p_revision: target.revision,
    p_page: target.pageIndex,
    p_code: target.code,
    p_title: `${title}: ${page.observation!.url.slice(0, 700)}`,
  });
  if (result.error) throw new Error("technical_finding_unavailable");
  return receipt.parse(result.data);
}
export const technicalEvidenceTarget = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), evidenceId: z.string().uuid() })
  .strict();
export async function readTechnicalFinding(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = technicalEvidenceTarget.parse(raw);
  const result = await rpc("read_technical_crawl_finding", {
    p_user: user,
    p_project: target.projectId,
    p_evidence: target.evidenceId,
  });
  if (result.error) throw new Error("technical_finding_unavailable");
  if (result.data === null) return null;
  const parsed = receipt
    .extend({
      snapshot: z.record(z.unknown()),
      createdAt: z.string(),
      opportunityExists: z.boolean(),
    })
    .parse(result.data);
  const { snapshot, ...metadata } = parsed;
  return { ...metadata, snapshotJson: JSON.stringify(snapshot) };
}
