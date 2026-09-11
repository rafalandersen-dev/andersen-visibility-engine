import { Resolver } from "node:dns/promises";
/** Each admitted lookup owns a resolver so abort cancels its pending DNS requests. */
export async function resolveTechnicalAddresses(hostname: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const results = await Promise.allSettled([
      resolver.resolve4(hostname),
      resolver.resolve6(hostname),
    ]);
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
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}
