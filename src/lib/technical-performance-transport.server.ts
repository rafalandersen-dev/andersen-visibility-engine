import { z } from "zod";
import { inspectionUrl } from "./google-index";
import { normalizeCrux, normalizeLighthouse } from "./technical-performance";
export const performanceQuery = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("crux"),
      url: z.string().max(8192),
      scope: z.enum(["url", "origin"]),
      device: z.enum(["PHONE", "DESKTOP", "TABLET", "ALL"]),
    })
    .strict(),
  z
    .object({
      source: z.literal("pagespeed"),
      url: z.string().max(8192),
      device: z.enum(["mobile", "desktop"]),
    })
    .strict(),
]);
export type PerformanceQuery = z.infer<typeof performanceQuery>;
export type PerformanceObservation =
  ReturnType<typeof normalizeCrux> | ReturnType<typeof normalizeLighthouse>;
const CRUX = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const PAGESPEED = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const LIMIT = 4 * 1024 * 1024;
/** One explicit request to a fixed Google API. Never follows provider redirects or
 * fetches returned URLs. Keys and provider response bodies never enter errors. */
export async function fetchTechnicalPerformance(
  raw: PerformanceQuery,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<PerformanceObservation> {
  const query = performanceQuery.parse(raw),
    url = inspectionUrl(query.url);
  if (!url) throw new Error("performance_scope");
  if (!apiKey || apiKey.length > 1024 || /\s/.test(apiKey))
    throw new Error("performance_configuration");
  const endpoint = new URL(query.source === "crux" ? CRUX : PAGESPEED);
  endpoint.searchParams.set("key", apiKey);
  const controller = new AbortController();
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const timer = setTimeout(
    () => {
      controller.abort();
      rejectDeadline(new Error("performance_unavailable"));
    },
    query.source === "crux" ? 15000 : 60000,
  );
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const bounded = <T>(operation: PromiseLike<T>) =>
    Promise.race([Promise.resolve(operation), deadline]);
  try {
    let body: string | undefined;
    if (query.source === "crux") {
      body = JSON.stringify({
        [query.scope]: query.scope === "origin" ? new URL(url).origin : url,
        ...(query.device === "ALL" ? {} : { formFactor: query.device }),
        metrics: [
          "largest_contentful_paint",
          "interaction_to_next_paint",
          "cumulative_layout_shift",
        ],
      });
    } else {
      endpoint.searchParams.set("url", url);
      endpoint.searchParams.set("strategy", query.device);
      endpoint.searchParams.set("category", "performance");
    }
    const pending = request(endpoint.toString(), {
      method: query.source === "crux" ? "POST" : "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
    }).then((response) => {
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw new Error("performance_unavailable");
      }
      return response;
    });
    const response = await bounded(pending);
    if (response.status === 401 || response.status === 403) throw new Error("performance_access");
    if (response.status === 429) throw new Error("performance_quota");
    const noRecord = query.source === "crux" && response.status === 404;
    if (
      (!response.ok && !noRecord) ||
      !response.body ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")
    )
      throw new Error("performance_unavailable");
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > LIMIT))
      throw new Error("performance_unavailable");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "",
      bytes = 0,
      chunks = 0;
    while (true) {
      const part = await bounded(reader.read());
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > LIMIT || ++chunks > 8192) throw new Error("performance_unavailable");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("performance_unavailable");
    const root = parsed as Record<string, unknown>,
      observedAt = new Date().toISOString();
    if (query.source === "crux") {
      if (noRecord) {
        const error = root.error as { status?: unknown } | undefined;
        if (error?.status !== "NOT_FOUND") throw new Error("performance_unavailable");
        return normalizeCrux({}, { ...query, url, observedAt });
      }
      if (!root.record || typeof root.record !== "object" || Array.isArray(root.record))
        throw new Error("performance_unavailable");
      return normalizeCrux(parsed, { ...query, url, observedAt });
    }
    if (
      !root.lighthouseResult ||
      typeof root.lighthouseResult !== "object" ||
      Array.isArray(root.lighthouseResult)
    )
      throw new Error("performance_unavailable");
    return normalizeLighthouse(parsed, { ...query, url, observedAt });
  } catch (error) {
    throw new Error(
      error instanceof Error && ["performance_access", "performance_quota"].includes(error.message)
        ? error.message
        : "performance_unavailable",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}
