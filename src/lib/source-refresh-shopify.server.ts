import { z } from "zod";
import { observedFactSchema, type ObservedFact } from "./source-refresh";
import type { KnowledgeScope, KnowledgeSource } from "./project-knowledge";
import type { Project } from "./types";

export const catalogShopDomain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/);
// Fixed read-only query: default shop currency, not country-specific pricing.
export const SHOPIFY_CATALOG_QUERY = `query MiloSourceCatalog {
  shop { myshopifyDomain currencyCode }
  productVariants(first: 20, sortKey: ID) {
    nodes { id title price availableForSale selectedOptions { name value }
      product { id title description status } }
    pageInfo { hasNextPage endCursor }
  }
}`;
const variant = z.object({
  id: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
  title: z.string().max(500),
  price: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .max(50),
  availableForSale: z.boolean(),
  selectedOptions: z
    .array(z.object({ name: z.string().max(200), value: z.string().max(200) }))
    .max(3),
  product: z.object({
    id: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/),
    title: z.string().min(1).max(500),
    description: z.string().max(100000),
    status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED", "UNLISTED"]),
  }),
});
const responseSchema = z.object({
  data: z.object({
    shop: z.object({
      myshopifyDomain: catalogShopDomain,
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
    }),
    productVariants: z.object({
      nodes: z.array(variant).max(20),
      pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().max(2000).nullable() }),
    }),
  }),
  errors: z.array(z.unknown()).max(0).optional(),
});
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A complete result means this bounded variant enumeration ended, not that
 * every Shopify market, discount, channel, inventory location or policy was read. */
export async function observeShopifyCatalog(raw: unknown, expectedDomain: string) {
  const result = responseSchema.parse(raw).data;
  if (result.shop.myshopifyDomain !== catalogShopDomain.parse(expectedDomain))
    throw new Error("catalog_identity_changed");
  const variants = result.productVariants.nodes;
  if (new Set(variants.map((v) => v.id)).size !== variants.length)
    throw new Error("catalog_identity_conflict");
  const facts: ObservedFact[] = [];
  for (const v of variants) {
    const identity = {
      productId: v.product.id,
      variantId: v.id,
      market: "shop-default",
      currency: result.shop.currencyCode,
    };
    const values: [ObservedFact["field"], string][] = [
      ["name", `${v.product.title} — ${v.title}`],
      ["description", v.product.description.slice(0, 2000)],
      ["specification", v.selectedOptions.map((o) => `${o.name}: ${o.value}`).join("; ")],
      ["price", v.price],
      ["availability", `${v.product.status}; availableForSale=${v.availableForSale}`],
    ];
    for (const [field, value] of values) {
      if (!value.trim()) continue;
      const key = await digest([identity, field]);
      facts.push(
        observedFactSchema.parse({
          ...identity,
          field,
          value,
          key,
          fingerprint: await digest([identity, field, value]),
          locator: `Shopify Admin ${v.id}`,
        }),
      );
    }
  }
  return {
    coverage: result.productVariants.pageInfo.hasNextPage
      ? ("catalog-partial" as const)
      : ("catalog-complete" as const),
    facts,
    warnings: result.productVariants.pageInfo.hasNextPage ? ["fact_limit" as const] : [],
    conflicts: [],
  };
}

export async function fetchShopifyCatalog(
  domain: string,
  token: string,
  request: typeof fetch = fetch,
) {
  const host = catalogShopDomain.parse(domain);
  if (!token.trim()) throw new Error("catalog_unavailable");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await request(`https://${host}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: SHOPIFY_CATALOG_QUERY }),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json") ||
      !response.body
    )
      throw new Error("catalog_unavailable");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let count = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 300000 || ++count > 4096) throw new Error("catalog_capacity");
      chunks.push(part.value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return await observeShopifyCatalog(JSON.parse(new TextDecoder().decode(data)), host);
  } catch {
    throw new Error("catalog_unavailable");
  } finally {
    clearTimeout(timer);
    controller.abort();
    await reader?.cancel().catch(() => {});
  }
}

export async function captureConfiguredShopifyCatalog(
  scope: KnowledgeScope,
  source: KnowledgeSource,
) {
  const { readWorkspaceRow } = await import("./workspace.server");
  const workspace = await readWorkspaceRow(scope.ownerId);
  const project = (workspace?.data.projects as Project[] | undefined)?.find(
    (p) => p.id === scope.projectId,
  );
  if (!project || project.connectorType !== "shopify" || !project.shopify)
    throw new Error("catalog_unavailable");
  const domain = catalogShopDomain.parse(project.shopify.shopDomain);
  if (source.url !== `https://${domain}` || source.refreshAdapter !== "shopify-catalog")
    throw new Error("catalog_identity_changed");
  const { resolveShopifyAdminToken } = await import("./publish-secret.server");
  const token = await resolveShopifyAdminToken(scope.ownerId, project);
  return fetchShopifyCatalog(domain, token);
}
