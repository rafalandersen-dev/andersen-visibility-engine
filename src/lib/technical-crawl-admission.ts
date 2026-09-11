export class TechnicalCrawlAdmissionError extends Error {
  constructor(readonly reason: "capacity" | "ownership" = "ownership") {
    super("technical_crawl_admission_" + reason);
    this.name = "TechnicalCrawlAdmissionError";
  }
}
export type CrawlConnectionAdmission = (
  url: string,
  signal: AbortSignal,
) => Promise<() => Promise<void>>;
