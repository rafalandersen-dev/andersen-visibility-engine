import type { PublicAiVisibilityAudit } from "./public-audit";

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

function isAudit(value: unknown): value is PublicAiVisibilityAudit {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.normalizedUrl === "string" &&
    typeof row.auditedAt === "string" &&
    typeof row.overall === "number" &&
    Boolean(row.categories && typeof row.categories === "object")
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
