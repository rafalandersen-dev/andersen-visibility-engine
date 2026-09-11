import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mock.rpc } }));
import { projectTeamRpc } from "./project-team-membership.server";
it("passes a bounded cancellation signal to the actual team RPC transport", async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, "timeout");
  try {
    mock.rpc.mockReturnValue({ abortSignal: mock.abortSignal });
    mock.abortSignal.mockResolvedValue({ data: {}, error: null });
    await projectTeamRpc("read_project_team_snapshot", {});
    expect(timeout).toHaveBeenCalledWith(9000);
    expect(mock.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
