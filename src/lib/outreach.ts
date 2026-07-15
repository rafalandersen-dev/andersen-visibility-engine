import type { BacklinkAnalysisResult, LinkMarketplaceOrder, OutreachDraft, OutreachFollowUp, OutreachTargetSource } from "./types";

export interface OutreachTargetSuggestion {
  domain: string;
  source: OutreachTargetSource;
  reason: string;
}

export function normalizeOutreachDomain(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return "";
  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function buildOutreachTargets(
  analysis?: BacklinkAnalysisResult,
  orders: LinkMarketplaceOrder[] = [],
): OutreachTargetSuggestion[] {
  const seen = new Set<string>();
  const result: OutreachTargetSuggestion[] = [];
  const add = (target: OutreachTargetSuggestion) => {
    const domain = normalizeOutreachDomain(target.domain);
    if (!domain || seen.has(domain)) return;
    seen.add(domain);
    result.push({ ...target, domain });
  };
  for (const gap of analysis?.gapDomains ?? []) {
    add({ domain: gap.domain, source: "linkGap", reason: `Links to ${gap.intersections} analyzed competitor(s), but not to this project.` });
  }
  for (const order of orders) {
    add({ domain: order.domain, source: "marketplace", reason: `Existing sponsored-publication request: ${order.publicationTitle}.` });
  }
  return result;
}

export function getOutreachFollowUpDueAt(
  draft: OutreachDraft,
  followUp: OutreachFollowUp,
): string | null {
  const initialSentAt =
    (draft.deliveryEvents ?? []).find(
      (event) => event.kind === "initial" && event.status === "accepted",
    )?.at ?? draft.sentAt;
  if (!initialSentAt) return null;
  const due =
    Date.parse(initialSentAt) + Math.max(2, followUp.delayDays) * 24 * 60 * 60 * 1000;
  return Number.isFinite(due) ? new Date(due).toISOString() : null;
}
