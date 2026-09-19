import { describe, expect, it, vi } from "vitest";
import {
  classifyConversationFailure,
  recordConversationDiagnostic,
  conversationStages,
} from "./milo-conversation-diagnostics.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
import { AiMalformedCredentialError } from "./ai-provider.server";
import type { TeamReadRpc } from "./project-team-read.server";

const turnId = "00000000-0000-4000-8000-000000000004";
const operationId = "00000000-0000-4000-8000-000000000009";

describe("bounded conversation failure classification", () => {
  it("maps a NOWAIT admission refusal to SQLSTATE 55P03 at the recorded stage", () => {
    // The executor is preview-lease-free, so a TeamAdmissionBusyError in its path is
    // only ever a milo_conversation* row FOR SHARE/FOR UPDATE NOWAIT refusal (55P03).
    const diagnosis = classifyConversationFailure(new TeamAdmissionBusyError(), "brief_start");
    expect(diagnosis).toEqual({
      stage: "brief_start",
      errorClass: "unknown",
      nameCategory: "other",
      httpStatus: null,
      sqlState: "55P03",
    });
  });
  it("records a non-DB error's safe class and stage with no SQLSTATE", () => {
    // A plain continuity throw carries no structured provider/transport signal: the
    // valuable output is the STAGE, with a safe class/name category and no SQLSTATE.
    const continuity = classifyConversationFailure(
      new Error("Conversation continuity unavailable."),
      "continuity_check",
    );
    expect(continuity).toMatchObject({
      stage: "continuity_check",
      errorClass: "unknown",
      sqlState: null,
    });
    // A recognised provider-name error still classifies safely from the allowlist.
    const credential = classifyConversationFailure(new AiMalformedCredentialError(), "plan_model");
    expect(credential).toMatchObject({
      stage: "plan_model",
      errorClass: "malformed_credential",
      sqlState: null,
    });
  });
  it("never derives its class from a raw message, only structured signals", () => {
    // A message that merely contains provider words does not steer the class.
    const spoof = classifyConversationFailure(
      new Error("rate limit 429 insufficient_quota https://provider/x"),
      "reply_model",
    );
    expect(spoof.errorClass).toBe("unknown");
    expect(spoof.httpStatus).toBeNull();
    expect(spoof.sqlState).toBeNull();
  });
  it("keeps the stage vocabulary constrained and free of user content", () => {
    expect(conversationStages).not.toContain("outcome_save");
    expect(new Set(conversationStages).size).toBe(conversationStages.length);
  });
  it("fails closed on a hostile Proxy or throwing getter without weakening the 55P03 case", () => {
    // A Proxy whose getPrototypeOf trap throws makes a bare `instanceof` raise. The
    // classifier runs FIRST in the executor's catch, so it must swallow that and
    // still return a safe diagnosis at the recorded stage rather than re-throwing
    // (which would prevent the outcome write and the diagnostic).
    const hostileProto = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("synthetic");
        },
      },
    );
    expect(classifyConversationFailure(hostileProto, "brief_start")).toEqual({
      stage: "brief_start",
      errorClass: "unknown",
      nameCategory: "none",
      httpStatus: null,
      sqlState: null,
    });
    // A throwing property getter is tolerated too — classifyAiError already guards
    // every read — so the best safe diagnosis (unknown, no SQLSTATE) still surfaces.
    const hostileGetter = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile getter");
        },
      },
    );
    expect(classifyConversationFailure(hostileGetter, "continuity_read")).toMatchObject({
      stage: "continuity_read",
      errorClass: "unknown",
      sqlState: null,
    });
    // The genuine typed busy error still classifies as 55P03: fail-closed handling
    // must never weaken the real positive case.
    expect(classifyConversationFailure(new TeamAdmissionBusyError(), "brief_start").sqlState).toBe(
      "55P03",
    );
  });
});

describe("best-effort, inert diagnostic recording", () => {
  it("sends only correlation ids and fixed enums to the service-only RPC", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc: TeamReadRpc = async (name, args) => {
      calls.push({ name, args });
      return { data: null, error: null };
    };
    await recordConversationDiagnostic(
      {
        turnId,
        operationId,
        diagnosis: {
          stage: "brief_start",
          errorClass: "unknown",
          nameCategory: "other",
          httpStatus: null,
          sqlState: "55P03",
        },
        outcome: { state: "unknown", code: "execution_unknown" },
      },
      rpc,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("record_milo_conversation_diagnostic");
    expect(calls[0].args).toEqual({
      p_turn: turnId,
      p_operation: operationId,
      p_stage: "brief_start",
      p_outcome: "unknown",
      p_outcome_code: "execution_unknown",
      p_error_class: "unknown",
      p_name_category: "other",
      p_http_status: null,
      p_sql_state: "55P03",
    });
    // No prompt/body/message/token/credential field is ever sent.
    expect(Object.keys(calls[0].args)).toEqual([
      "p_turn",
      "p_operation",
      "p_stage",
      "p_outcome",
      "p_outcome_code",
      "p_error_class",
      "p_name_category",
      "p_http_status",
      "p_sql_state",
    ]);
  });
  it("passes a null operation when none is known", async () => {
    // Typed as the real TeamReadRpc so mock.calls carries the actual [name, args]
    // tuple — no as-any cast that would hide the recorded call shape.
    const rpc = vi.fn<TeamReadRpc>(async () => ({ data: null, error: null }));
    await recordConversationDiagnostic(
      {
        turnId,
        diagnosis: {
          stage: "continuity_read",
          errorClass: "timeout",
          nameCategory: "AbortError",
          httpStatus: null,
          sqlState: null,
        },
        outcome: { state: "unknown", code: "execution_unknown" },
      },
      rpc,
    );
    expect(rpc.mock.calls[0][1].p_operation).toBeNull();
  });
  it("swallows an RPC error object without throwing and never retries", async () => {
    const rpc = vi.fn<TeamReadRpc>(async () => ({ data: null, error: { code: "42883" } }));
    await expect(
      recordConversationDiagnostic(
        {
          turnId,
          operationId,
          diagnosis: {
            stage: "brief_start",
            errorClass: "unknown",
            nameCategory: "other",
            httpStatus: null,
            sqlState: "55P03",
          },
          outcome: { state: "unknown", code: "execution_unknown" },
        },
        rpc,
      ),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("swallows a thrown transport failure and never retries", async () => {
    const rpc = vi.fn<TeamReadRpc>(async () => {
      throw new Error("network");
    });
    await expect(
      recordConversationDiagnostic(
        {
          turnId,
          operationId,
          diagnosis: {
            stage: "plan_model",
            errorClass: "network",
            nameCategory: "other",
            httpStatus: null,
            sqlState: null,
          },
          outcome: { state: "unknown", code: "execution_unknown" },
        },
        rpc,
      ),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("never contacts the RPC when the correlation id is not a uuid", async () => {
    const rpc = vi.fn<TeamReadRpc>(async () => ({ data: null, error: null }));
    await recordConversationDiagnostic(
      {
        turnId: "not-a-uuid",
        diagnosis: {
          stage: "brief_start",
          errorClass: "unknown",
          nameCategory: "other",
          httpStatus: null,
          sqlState: "55P03",
        },
        outcome: { state: "unknown", code: "execution_unknown" },
      },
      rpc,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
