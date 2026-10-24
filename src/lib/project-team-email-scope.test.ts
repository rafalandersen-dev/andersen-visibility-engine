import { afterEach, expect, it, vi } from "vitest";
import { teamNotificationEmailScope, teamEmailScopeMatches } from "./project-team-email-scope";
import { runTeamNotificationWorker } from "./project-team-delivery.server";
const scope = {
  owner_id: "00000000-0000-4000-8000-000000000001",
  project_id: "test",
  recipient_id: "00000000-0000-4000-8000-000000000002",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
};
afterEach(() => vi.unstubAllEnvs());
it.each([
  "",
  "{}",
  "invalid",
  JSON.stringify({ ...scope, project_id: "*" }),
  JSON.stringify({ ...scope, expires_at: "2020-01-01T00:00:00Z" }),
  JSON.stringify({ ...scope, expires_at: "2099-01-01T00:00:00Z" }),
  JSON.stringify({ ...scope, all: true }),
])("missing/malformed/expired scope disables even explicitly enabled transport", async (raw) => {
  vi.stubEnv("TEAM_NOTIFICATION_EMAIL_SCOPE", raw);
  vi.stubEnv("TEAM_NOTIFICATION_EMAIL_ENABLED", "true");
  vi.stubEnv("LOVABLE_API_KEY", "");
  expect(teamNotificationEmailScope()).toBeNull();
  expect(await runTeamNotificationWorker()).toEqual({
    enabled: false,
    queued: 0,
    processed: 0,
    failed: 0,
  });
});
it("requires all three identities to match exactly", () => {
  vi.stubEnv("TEAM_NOTIFICATION_EMAIL_SCOPE", JSON.stringify(scope));
  expect(teamNotificationEmailScope()).toEqual(scope);
  expect(teamEmailScopeMatches(scope, scope)).toBe(true);
  for (const key of ["owner_id", "project_id", "recipient_id"])
    expect(teamEmailScopeMatches(scope, { ...scope, [key]: "other" })).toBe(false);
});
