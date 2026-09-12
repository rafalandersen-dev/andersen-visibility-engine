import { PUBLIC_AUDIT_CATEGORY_KEYS, type PublicAiVisibilityAudit } from "./public-audit";

/** The endpoint did not provide a usable audit error response. The UI offers
 * project setup instead of encouraging an immediate retry of this request. */
export class PublicAuditUnavailableError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "PublicAuditUnavailableError";
  }
}

export interface PublicAuditHttpInput {
  url: string;
  language?: string;
  botProof: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isStatus(value: unknown): boolean {
  return value === "strong" || value === "okay" || value === "needsWork";
}

function isSignals(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    ["title", "metaDescription", "h1", "detectedBusinessName"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    ["headings", "detectedServices", "detectedLocations"].every(
      (key) => value[key] === undefined || isStringArray(value[key]),
    ) &&
    ["hasFaqSignals", "hasContactSignals", "hasTrustSignals"].every(
      (key) => value[key] === undefined || typeof value[key] === "boolean",
    )
  );
}

/** Validate the wire contract before rendering. Do not normalize missing results
 * here: doing so would invent scores or evidence after a broken response. */
function isAudit(value: unknown): value is PublicAiVisibilityAudit {
  if (!isRecord(value)) return false;
  const categories = value.categories;
  return (
    ["id", "url", "normalizedUrl", "auditedAt", "summary", "disclaimer"].every(
      (key) => typeof value[key] === "string",
    ) &&
    isScore(value.overall) &&
    isStatus(value.status) &&
    isRecord(categories) &&
    PUBLIC_AUDIT_CATEGORY_KEYS.every((key) => {
      const category = categories[key];
      return (
        isRecord(category) &&
        isScore(category.score) &&
        isStatus(category.status) &&
        typeof category.explanation === "string" &&
        isStringArray(category.suggestions)
      );
    }) &&
    ["topIssues", "quickWins", "recommendedActions"].every((key) => isStringArray(value[key])) &&
    (value.extractedSignals === undefined || isSignals(value.extractedSignals))
  );
}

export async function runPublicAudit(
  input: PublicAuditHttpInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicAiVisibilityAudit> {
  const configuredUrl = import.meta.env.VITE_PUBLIC_AUDIT_API_URL as string | undefined;
  const configuredPath = configuredUrl?.trim();
  const endpoint =
    configuredPath?.startsWith("/") && !configuredPath.startsWith("//")
      ? configuredPath
      : "/api/public-audit";
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "omit",
  });
  const payload: unknown = await response.json().catch(() => undefined);
  const errorEnvelope =
    payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
  const publicMessage =
    errorEnvelope &&
    typeof errorEnvelope === "object" &&
    "message" in errorEnvelope &&
    typeof errorEnvelope.message === "string" &&
    errorEnvelope.message.trim()
      ? errorEnvelope.message
      : undefined;
  if (!response.ok) {
    // These statuses without a usable envelope do not establish a root cause.
    const notWired = [404, 501, 502, 503].includes(response.status) && !publicMessage;
    if (notWired) {
      throw new PublicAuditUnavailableError(
        "The free audit service is currently unavailable. You can return later or continue to project setup.",
      );
    }
    const message =
      publicMessage ?? "The audit is temporarily unavailable. Please try again later.";
    throw new Error(message);
  }
  if (!isAudit(payload)) {
    throw new Error("The audit returned an invalid response. Please try again later.");
  }
  return payload;
}
