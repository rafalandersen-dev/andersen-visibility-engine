/** Bounds the authenticated MCP body before parsing or dispatching any work.
 * This is an application read limit, not a claim about upstream proxy buffering.
 */
export const MCP_MAX_BODY_BYTES = 200_000;
export const MCP_MAX_BATCH = 20;
export const MCP_BODY_TIMEOUT_MS = 10_000;
export const MCP_MAX_BODY_CHUNKS = 4096;

export class McpRequestError extends Error {
  constructor(
    readonly status: 400 | 408 | 413,
    readonly code: -32600 | -32700,
    message: string,
  ) {
    super(message);
    this.name = "McpRequestError";
  }
}

export async function readMcpPayload(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MCP_MAX_BODY_BYTES))
    throw new McpRequestError(413, -32600, "Request is too large.");
  if (!request.body) throw new McpRequestError(400, -32600, "Invalid request.");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new McpRequestError(408, -32600, "Request body timed out. No tool was started."));
    }, MCP_BODY_TIMEOUT_MS);
  });
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let chunks = 0;
    const parts: string[] = [];
    while (true) {
      const item = await Promise.race([reader.read(), deadline]);
      if (item.done) break;
      chunks++;
      bytes += item.value.byteLength;
      if (bytes > MCP_MAX_BODY_BYTES || chunks > MCP_MAX_BODY_CHUNKS)
        throw new McpRequestError(413, -32600, "Request is too large.");
      parts.push(decoder.decode(item.value, { stream: true }));
    }
    parts.push(decoder.decode());
    let payload: unknown;
    try {
      payload = JSON.parse(parts.join(""));
    } catch {
      throw new McpRequestError(400, -32700, "Parse error.");
    }
    if (Array.isArray(payload) && (payload.length === 0 || payload.length > MCP_MAX_BATCH))
      throw new McpRequestError(
        400,
        -32600,
        `A batch must contain 1–${MCP_MAX_BATCH} messages. No tool was started.`,
      );
    return payload;
  } catch (error) {
    if (error instanceof McpRequestError) throw error;
    throw new McpRequestError(400, -32700, "Could not read the request body.");
  } finally {
    clearTimeout(timer);
    // A slow/failed stream cancellation must not defeat the read deadline.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Keep a batch ordered with at most one active tool in this HTTP request.
 * Per-tool authorization, write quotas and idempotency remain authoritative.
 * Earlier items may have completed when a later item fails; never retry a batch
 * automatically or describe a batch as transactional.
 */
export async function dispatchMcpPayload(
  payload: unknown,
  handle: (message: Record<string, unknown>) => Promise<object | null>,
  audit: (message: Record<string, unknown>, response: object | null) => Promise<void>,
): Promise<object | object[] | null> {
  const one = async (message: unknown): Promise<object | null> => {
    if (!message || typeof message !== "object" || Array.isArray(message))
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request." } };
    const record = message as Record<string, unknown>;
    const response = await handle(record);
    await audit(record, response);
    return response;
  };
  if (!Array.isArray(payload)) return one(payload);
  // Defence for other future callers that do not use readMcpPayload.
  if (payload.length === 0 || payload.length > MCP_MAX_BATCH)
    throw new McpRequestError(
      400,
      -32600,
      `A batch must contain 1–${MCP_MAX_BATCH} messages. No tool was started.`,
    );
  const responses: object[] = [];
  const failed = (message: unknown, code: number, text: string) => {
    // Valid JSON-RPC notifications have no correlated response, including
    // when their own handler fails or a previous batch item prevents dispatch.
    if (message && typeof message === "object" && !Array.isArray(message)) {
      const record = message as Record<string, unknown>;
      if (typeof record.method === "string" && record.id == null) return null;
    }
    const id =
      message && typeof message === "object" && !Array.isArray(message)
        ? (message as Record<string, unknown>).id
        : null;
    return {
      jsonrpc: "2.0",
      id: typeof id === "string" || (typeof id === "number" && Number.isFinite(id)) ? id : null,
      error: { code, message: text },
    };
  };
  for (let index = 0; index < payload.length; index++) {
    try {
      const response = await one(payload[index]);
      if (response !== null) responses.push(response);
    } catch {
      // Preserve successful earlier responses when a later outcome is unknown.
      // No raw exceptions, automatic rollback, later dispatch or batch replay.
      const failure = failed(
        payload[index],
        -32603,
        "This message's result is unconfirmed. Check Milo before retrying.",
      );
      if (failure) responses.push(failure);
      for (const later of payload.slice(index + 1)) {
        const unstarted = failed(
          later,
          -32004,
          "This message was not started because an earlier batch message failed.",
        );
        if (unstarted) responses.push(unstarted);
      }
      break;
    }
  }
  return responses.length ? responses : null;
}
