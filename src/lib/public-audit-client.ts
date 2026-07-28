import type { PublicAiVisibilityAudit } from "./public-audit";

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
  const payload = (await response.json().catch(() => undefined)) as
    { error?: { message?: string } } | PublicAiVisibilityAudit | undefined;
  if (!response.ok) {
    const message =
      payload && "error" in payload && payload.error?.message
        ? payload.error.message
        : "The audit is temporarily unavailable. Please try again later.";
    throw new Error(message);
  }
  if (!isAudit(payload)) {
    throw new Error("The audit returned an invalid response. Please try again later.");
  }
  return payload;
}
