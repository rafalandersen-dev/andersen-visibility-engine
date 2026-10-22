import { Resolver } from "node:dns/promises";

/** workerd's node:dns `Resolver` performs A/AAAA lookups but its `cancel()` throws
 * "Not implemented". Only that unsupported-cleanup refusal is tolerated; anything
 * else a cancel throws makes the aborted lookup report technical_dns_unavailable. */
function cancelUnsupported(error: unknown) {
  try {
    const value = error as { message?: unknown; code?: unknown };
    return value?.message === "Not implemented" || value?.code === "ERR_METHOD_NOT_IMPLEMENTED";
  } catch {
    return false;
  }
}

/** Each admitted lookup owns a resolver. Abort rejects the lookup immediately via
 * its own race, so abort/deadline responsiveness never depends on the runtime
 * supporting `cancel()`; where `cancel()` is supported (Node) abort also stops the
 * pending DNS requests. A lookup whose queries both settled has nothing pending and
 * is never cancelled, so a successful answer cannot be replaced by a cleanup error.
 * Late query results after an abort are absorbed by allSettled (no unhandled
 * rejection) and never used. */
export async function resolveTechnicalAddresses(hostname: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const resolver = new Resolver();
  let cancelFailed = false;
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      try {
        resolver.cancel();
      } catch (error) {
        if (!cancelUnsupported(error)) cancelFailed = true;
      }
      reject(signal.reason ?? new Error("aborted"));
    };
  });
  // The race below handles the rejection; this only keeps an abort that arrives
  // after the lookup finished from surfacing as an unhandled rejection.
  aborted.catch(() => {});
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    let results: PromiseSettledResult<string[]>[];
    try {
      results = await Promise.race([
        Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]),
        aborted,
      ]);
    } catch (error) {
      if (cancelFailed) throw new Error("technical_dns_unavailable");
      throw error;
    }
    signal.throwIfAborted();
    const addresses: { address: string; family: number }[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        const code = (result.reason as { code?: unknown })?.code;
        if (code !== "ENODATA" && code !== "ENOTFOUND")
          throw new Error("technical_dns_unavailable");
      } else {
        if (result.value.length > 64) throw new Error("technical_dns_unavailable");
        addresses.push(
          ...result.value.map((address) => ({ address, family: index === 0 ? 4 : 6 })),
        );
      }
    }
    if (!addresses.length || addresses.length > 64) throw new Error("technical_dns_unavailable");
    return addresses;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
