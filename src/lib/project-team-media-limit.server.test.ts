import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
import { acquireTeamMedia, TeamMediaCapacityError } from "./project-team-media-limit.server";
beforeEach(() => vi.resetAllMocks());
it("classifies only the database capacity sentinel as admission contention", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "team_media_capacity" } });
  await expect(acquireTeamMedia("owner")).rejects.toBeInstanceOf(TeamMediaCapacityError);
  for (const error of [
    { message: "permission denied" },
    "team_media_capacity",
    { message: "connection failed" },
  ]) {
    rpc.mockResolvedValueOnce({ data: null, error });
    await expect(acquireTeamMedia("owner")).rejects.not.toBeInstanceOf(TeamMediaCapacityError);
  }
});
