import { observedFactSchema, type ObservedFact } from "./source-refresh";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : undefined;
const list = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const scalar = (value: unknown, max = 2000): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return;
  const text = String(value).trim();
  return text && text.length <= max ? text : undefined;
};
const hasType = (value: ObjectValue, type: string) =>
  list(value["@type"]).some(
    (t) => t === type || t === `https://schema.org/${type}` || t === `http://schema.org/${type}`,
  );
const cleanText = (html: string) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
async function digest(value: unknown) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parse explicit source-reported page text and Schema.org Product/Offer fields.
 * No page evaluation, model call, network fan-out, catalog-completeness claim,
 * timezone inference, or choice between conflicting offers. Input comes from
 * the existing bounded SSRF-safe page reader, never a browser credential. */
export async function observePublicPage(html: string) {
  if (typeof html !== "string" || new TextEncoder().encode(html).byteLength > 300_000)
    throw new Error("source_page_capacity");
  const warnings = new Set<string>();
  const conflicts = new Set<string>();
  const facts = new Map<string, ObservedFact>();
  let candidates = 0;
  async function add(value: Omit<ObservedFact, "key" | "fingerprint">, discriminator = "") {
    if (++candidates > 100) {
      warnings.add("fact_limit");
      return;
    }
    const identity = [
      value.productId ?? "",
      value.variantId ?? "",
      value.market ?? "",
      value.currency ?? "",
      value.field,
      discriminator,
    ];
    const key = await digest(identity);
    const fingerprint = await digest([
      identity,
      value.value,
      value.validUntil ?? "",
      value.validityUnknown ?? false,
    ]);
    const fact = observedFactSchema.parse({ ...value, key, fingerprint });
    const previous = facts.get(key);
    if (previous && previous.fingerprint !== fingerprint) {
      conflicts.add(key);
      facts.delete(key);
    } else if (!conflicts.has(key)) facts.set(key, fact);
  }
  const text = cleanText(html).slice(0, 2000);
  if (text.length >= 80)
    await add({
      field: "pageText",
      value: text,
      locator: "Readable page text, first 2,000 characters",
    });
  else warnings.add("limited_readable_text");

  const scripts =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match: RegExpExecArray | null;
  let scriptCount = 0;
  let visited = 0;
  while ((match = scripts.exec(html))) {
    if (++scriptCount > 20) {
      warnings.add("structured_data_limit");
      break;
    }
    if (match[1].length > 100_000) {
      warnings.add("structured_data_limit");
      continue;
    }
    let root: unknown;
    try {
      root = JSON.parse(match[1]);
    } catch {
      warnings.add("invalid_structured_data");
      continue;
    }
    const pending: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
    while (pending.length) {
      const { value, depth } = pending.pop()!;
      if (++visited > 500 || depth > 8) {
        warnings.add("structured_data_limit");
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 100)) pending.push({ value: child, depth: depth + 1 });
        continue;
      }
      const node = object(value);
      if (!node) continue;
      // Traverse explicit JSON-LD graph/list structures only. Do not treat
      // arbitrary nested reference/instruction objects as products.
      for (const key of ["@graph", "itemListElement", "item", "hasVariant"])
        if (node[key]) pending.push({ value: node[key], depth: depth + 1 });
      if (!hasType(node, "Product")) continue;
      const productId = scalar(node["@id"], 200) ?? scalar(node.sku, 200) ?? scalar(node.url, 200);
      if (!productId) {
        warnings.add("missing_product_identity");
        continue;
      }
      const variantId = scalar(node.sku, 200);
      const base = { productId, ...(variantId ? { variantId } : {}) };
      const locator = `JSON-LD Product ${productId}`.slice(0, 200);
      for (const field of ["name", "description"] as const) {
        const value = scalar(node[field]);
        if (value) await add({ ...base, field, value, locator });
      }
      for (const raw of list(node.additionalProperty).slice(0, 20)) {
        const property = object(raw);
        const name = scalar(property?.name, 100),
          value = scalar(property?.value, 1800);
        if (name && value)
          await add({ ...base, field: "specification", value: `${name}: ${value}`, locator }, name);
      }
      for (const raw of list(node.offers).slice(0, 20)) {
        const offer = object(raw);
        if (!offer || !hasType(offer, "Offer")) {
          warnings.add("unsupported_offer");
          continue;
        }
        const market = scalar(offer.eligibleRegion, 80);
        if (offer.eligibleRegion !== undefined && !market) {
          warnings.add("unsupported_market");
          continue;
        }
        const currency = scalar(offer.priceCurrency, 3);
        const identity = {
          ...base,
          ...(market ? { market } : {}),
          ...(currency && /^[A-Z]{3}$/.test(currency) ? { currency } : {}),
        };
        const expiry = scalar(offer.priceValidUntil ?? offer.validThrough, 80);
        const parsedExpiry = observedFactSchema.shape.validUntil.safeParse(expiry);
        const validity = expiry
          ? parsedExpiry.success
            ? { validUntil: parsedExpiry.data }
            : { validityUnknown: true }
          : {};
        if (validity.validityUnknown) warnings.add("offer_expiry_unknown");
        const price = scalar(offer.price, 50);
        if (price && /^\d+(?:\.\d+)?$/.test(price) && identity.currency)
          await add({ ...identity, ...validity, field: "price", value: price, locator });
        else if (offer.price !== undefined) warnings.add("unresolved_price");
        const availability = scalar(offer.availability, 200);
        if (availability)
          await add({
            ...identity,
            ...validity,
            field: "availability",
            value: availability,
            locator,
          });
      }
    }
  }
  return {
    coverage: "public-page" as const,
    facts: [...facts.values()].sort((a, b) => a.key.localeCompare(b.key)),
    conflicts: [...conflicts].sort(),
    warnings: [...warnings].sort(),
  };
}
