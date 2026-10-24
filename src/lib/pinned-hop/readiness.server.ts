/** On-demand readiness only. This never fetches the destination, sends a key,
 * obtains a challenge or keeps an idle service awake between user/worker jobs. */
export const PINNED_HOP_STARTUP_MS = 70_000;
type ReadinessConfig = {
  endpoint: string;
  startupBudgetMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export async function waitForPinnedHopReadiness(config: ReadinessConfig): Promise<boolean> {
  const now = config.now ?? (() => performance.now());
  const started = now();
  const deadline = started + config.startupBudgetMs;
  const doFetch = config.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 4; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) return false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: Response | undefined;
    try {
      const result = await Promise.race([
        (async () => {
          response = await doFetch(config.endpoint.replace(/\/+$/, "") + "/healthz", {
            method: "GET",
            headers: { accept: "application/json" },
            redirect: "manual",
            cache: "no-store",
            signal: controller.signal,
          });
          // A redirect, authentication refusal or wrong route is not a cold start.
          if (![200, 502, 503, 504].includes(response.status)) return "refused";
          if (response.status !== 200) return "unready";
          const reader = response.body?.getReader();
          if (!reader) return "unready";
          let size = 0;
          const parts: Uint8Array[] = [];
          try {
            while (true) {
              controller.signal.throwIfAborted();
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > 256) return "unready";
              parts.push(value);
            }
          } finally {
            void reader.cancel().catch(() => {});
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const part of parts) {
            bytes.set(part, offset);
            offset += part.length;
          }
          const body = JSON.parse(new TextDecoder().decode(bytes));
          return body?.ok === true ? "ready" : "unready";
        })(),
        new Promise<string>((resolve) => {
          timer = setTimeout(
            () => {
              controller.abort();
              resolve("unready");
            },
            Math.min(8_000, remaining),
          );
        }),
      ]);
      if (now() >= deadline || controller.signal.aborted) {
        if (now() >= deadline) return false;
      } else if (result === "ready") return true;
      else if (result === "refused") return false;
    } catch {
      // A startup/network/read failure can only repeat this readiness request.
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
    const nextProbe = started + (attempt + 1) * 20_000;
    if (attempt === 3 || nextProbe >= deadline) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, nextProbe - now())));
  }
  return false;
}
