/** Normalize a shop domain: strip protocol/path; append .myshopify.com if bare. */
export function normalizeShopDomain(raw: string): string {
  let d = (raw || "").trim().toLowerCase();
  d = d
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\/+$/, "");
  if (!d) return "";
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}
