import {
  backlinkDetailPayload,
  normalizeBacklinkDetails,
  type BacklinkDetailScope,
} from "./backlink-details";
import {
  backlinkPagePayload,
  normalizeBacklinkPage,
  type BacklinkContinuation,
} from "./backlink-pagination";
const ENDPOINT = "https://api.dataforseo.com/v3/backlinks/backlinks/live";
/** Internal transport only. The caller must first acquire durable dispatch and
 * supplier expense admission. No routes or automatic analysis call this module. */
export async function fetchBacklinkDetails(
  scope: BacklinkDetailScope,
  credentials: { login: string; password: string },
  signal: AbortSignal,
  request: typeof fetch = fetch,
) {
  return requestDetails(backlinkDetailPayload(scope), credentials, signal, request, (raw) =>
    normalizeBacklinkDetails(raw, scope, new Date().toISOString()),
  );
}
/** Same bounded single-dispatch transport, with private parent-bound continuation. */
export async function fetchBacklinkPage(
  scope: BacklinkDetailScope,
  credentials: { login: string; password: string },
  signal: AbortSignal,
  continuation: BacklinkContinuation | null,
  request: typeof fetch = fetch,
) {
  return requestDetails(
    backlinkPagePayload(scope, continuation),
    credentials,
    signal,
    request,
    (raw) => normalizeBacklinkPage(raw, scope, new Date().toISOString(), continuation),
  );
}
async function requestDetails<T>(
  payload: ReturnType<typeof backlinkDetailPayload>,
  credentials: { login: string; password: string },
  signal: AbortSignal,
  request: typeof fetch,
  normalize: (raw: unknown) => T,
): Promise<T> {
  const login = credentials.login.trim();
  const password = credentials.password.trim();
  if (!login || !password) throw new Error("backlink_details_unconfigured");
  signal.throwIfAborted();
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => {
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await request(ENDPOINT, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify([payload]),
    });
    controller.signal.throwIfAborted();
    if (
      !response.ok ||
      !response.body ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")
    ) {
      void response.body?.cancel().catch(() => {});
      throw new Error("backlink_details_unavailable");
    }
    reader = response.body.getReader();
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 1048576))
      throw new Error("backlink_details_unavailable");
    let text = "",
      bytes = 0,
      chunks = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    while (true) {
      controller.signal.throwIfAborted();
      const part = await reader.read();
      controller.signal.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1048576 || ++chunks > 4096) throw new Error("backlink_details_unavailable");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return normalize(JSON.parse(text));
  } catch {
    // Neither HTTP errors nor unusable results prove that the provider did not charge.
    throw new Error("backlink_details_unavailable");
  } finally {
    abort();
    signal.removeEventListener("abort", abort);
    clearTimeout(timeout);
  }
}
