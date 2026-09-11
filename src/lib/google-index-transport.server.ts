import { inspectionInProperty, inspectionUrl, normalizeGoogleIndex } from "./google-index";
const ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
/** Fixed Google destination; token is never used to fetch the inspected URL. */
export async function fetchGoogleIndex(
  accessToken: string,
  property: string,
  rawUrl: string,
  request: typeof fetch = fetch,
) {
  const url = inspectionUrl(rawUrl);
  if (!url || !inspectionInProperty(url, property)) throw new Error("google_inspection_scope");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await request(ENDPOINT, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: property, languageCode: "en-US" }),
    });
    if (response.status === 401 || response.status === 403)
      throw new Error("google_inspection_access");
    if (response.status === 429) throw new Error("google_inspection_quota");
    if (
      !response.ok ||
      !response.body ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")
    )
      throw new Error("google_inspection_unavailable");
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 1048576))
      throw new Error("google_inspection_unavailable");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "",
      bytes = 0,
      chunks = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1048576 || ++chunks > 4096) throw new Error("google_inspection_unavailable");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("inspectionResult" in parsed) ||
      !parsed.inspectionResult ||
      typeof parsed.inspectionResult !== "object" ||
      Array.isArray(parsed.inspectionResult)
    )
      throw new Error("google_inspection_unavailable");
    return normalizeGoogleIndex(parsed, { url, property, observedAt: new Date().toISOString() });
  } catch (error) {
    const safe =
      error instanceof Error &&
      ["google_inspection_access", "google_inspection_quota"].includes(error.message)
        ? error.message
        : "google_inspection_unavailable";
    throw new Error(safe);
  } finally {
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
    clearTimeout(timeout);
  }
}
