import { z } from "zod";
import { conversationTurnTarget } from "./milo-conversation";
import type { runConversationSpecialists } from "./milo-specialist-executor.server";

const dispatchTarget = conversationTurnTarget.extend({ actorId: z.string().uuid() }).strict();
type Dependencies = {
  secret: () => Promise<string | null>;
  run: typeof runConversationSpecialists;
};
const defaults: Dependencies = {
  secret: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
    };
    const result = await db.rpc("auto_scheduler_secret");
    return !result.error && typeof result.data === "string" && result.data ? result.data : null;
  },
  run: async (...args) => {
    const { runConversationSpecialists } = await import("./milo-specialist-executor.server");
    return runConversationSpecialists(...args);
  },
};
function equalSecret(a: string, b: string) {
  if (!a.length || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

// Small internal identifier envelope, bounded by actual streamed bytes and a
// deadline even if Content-Length is missing, wrong or the sender stalls.
async function readTarget(request: Request) {
  const length = request.headers.get("content-length");
  if (
    !request.body ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > 2048)) ||
    request.headers.get("content-type")?.split(";")[0].trim() !== "application/json"
  )
    throw new Error("invalid_request");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("request_timeout")), 5000);
  });
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let chunks = 0;
    let text = "";
    for (;;) {
      const item = await Promise.race([reader.read(), deadline]);
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 2048 || ++chunks > 64) throw new Error("invalid_request");
      text += decoder.decode(item.value, { stream: true });
    }
    return dispatchTarget.parse(JSON.parse(text + decoder.decode()));
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

/** Dedicated internal route: one saved target, one durable claim. The actor in
 * this envelope is trusted only after private scheduler authentication; storage
 * rechecks current membership, release/start window, capacity and claim state. */
export async function handleMiloDispatch(request: Request, deps: Dependencies = defaults) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  try {
    const expected = await deps.secret();
    if (!expected) return json({ error: "configuration_unavailable" }, 503);
    if (!equalSecret(authorization.slice(7).trim(), expected))
      return json({ error: "forbidden" }, 403);
    let target: z.infer<typeof dispatchTarget>;
    try {
      if (new URL(request.url).search || request.method !== "POST")
        throw new Error("invalid_request");
      target = await readTarget(request);
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const { actorId, ...savedTarget } = target;
    const turn = await deps.run(actorId, savedTarget);
    return json({ ok: true, state: turn.state });
  } catch {
    // No task, provider error, actor identity or scheduler credential in output.
    return json({ error: "dispatch_unavailable" }, 503);
  }
}
