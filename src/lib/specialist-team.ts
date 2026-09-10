/** Team display reads durable stage evidence; saved browser assets never imply a running job. */
export const specialistRoles = [
  "lead",
  "brand",
  "research",
  "content",
  "image",
  "seo",
  "authority",
  "ai",
  "performance",
] as const;
export type SpecialistRole = (typeof specialistRoles)[number];
export type TeamStage = {
  stage: "research" | "content" | "image";
  state: "running" | "unknown" | "retained" | "cancelled";
  deliveredAt: string | null;
  outputChanged: boolean;
  outputId: string;
  publishAt: string;
  requestId: string;
};
export function stageRoleEvidence(stages: TeamStage[] | undefined, role: TeamStage["stage"]) {
  if (!stages) return { status: "unavailable" as const, jobs: [], lastDeliveredAt: null };
  const jobs = stages.filter((s) => s.stage === role);
  const status = jobs.some((s) => s.state === "unknown")
    ? "unknown"
    : jobs.some((s) => s.state === "running")
      ? "running"
      : jobs.some((s) => s.outputChanged && s.state !== "cancelled")
        ? "review"
        : jobs.some((s) => s.state === "retained")
          ? "retained"
          : jobs.length
            ? "cancelled"
            : "none";
  const delivered = jobs
    .flatMap((s) =>
      s.deliveredAt && Number.isFinite(Date.parse(s.deliveredAt)) ? [s.deliveredAt] : [],
    )
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return { status, jobs, lastDeliveredAt: delivered[0] ?? null };
}
