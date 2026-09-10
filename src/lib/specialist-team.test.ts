import { describe, expect, it } from "vitest";
import { stageRoleEvidence, type TeamStage } from "./specialist-team";
const stage = (patch: Partial<TeamStage> = {}): TeamStage => ({
  stage: "content",
  state: "retained",
  deliveredAt: "2026-09-10T12:00:00Z",
  outputChanged: false,
  outputId: "asset",
  publishAt: "2026-09-15T09:00:00Z",
  requestId: "request",
  ...patch,
});
describe("truthful specialist job evidence", () => {
  it("does not present an unavailable read as no work", () => {
    expect(stageRoleEvidence(undefined, "content").status).toBe("unavailable");
    expect(stageRoleEvidence([], "content").status).toBe("none");
  });
  it("keeps uncertainty visible alongside running and retained jobs", () => {
    const evidence = stageRoleEvidence(
      [
        stage(),
        stage({ state: "running", deliveredAt: null }),
        stage({ state: "unknown", deliveredAt: null }),
      ],
      "content",
    );
    expect(evidence.status).toBe("unknown");
    expect(evidence.jobs).toHaveLength(3);
  });
  it("uses actual delivery dates and never the planned publication date", () => {
    expect(stageRoleEvidence([stage({ deliveredAt: null })], "content").lastDeliveredAt).toBeNull();
    expect(
      stageRoleEvidence([stage(), stage({ deliveredAt: "2026-09-11T12:00:00Z" })], "content")
        .lastDeliveredAt,
    ).toBe("2026-09-11T12:00:00Z");
  });
  it("keeps role boundaries and cancelled owner decisions", () => {
    expect(stageRoleEvidence([stage({ stage: "image", state: "running" })], "content").status).toBe(
      "none",
    );
    expect(
      stageRoleEvidence([stage({ state: "cancelled", outputChanged: true })], "content").status,
    ).toBe("cancelled");
    expect(stageRoleEvidence([stage({ outputChanged: true })], "content").status).toBe("review");
  });
});
