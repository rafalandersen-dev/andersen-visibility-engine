export class TechnicalCrawlAdmissionError extends Error {
  constructor(readonly reason: "capacity" | "ownership" = "ownership") {
    super("technical_crawl_admission_" + reason);
    this.name = "TechnicalCrawlAdmissionError";
  }
}
export type CrawlConnectionAdmission = (
  url: string,
  signal: AbortSignal,
  address: string | null,
) => Promise<(() => Promise<void>) & { promote?: (address: string) => Promise<void> }>;

/** Known policy refusal before a connection; the destination is scoped by the caller. */
export class TechnicalPolicyRefusedError extends Error {
  constructor(readonly url: string) {
    super("technical_policy_refused");
    this.name = "TechnicalPolicyRefusedError";
  }
}
