export const MAX_BRAND_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_BRAND_DOCUMENT_TEXT = 100000;
export const MAX_BRAND_DOCUMENT_PAGES = 40;
export type BrandDocumentKind = "pdf" | "docx";
export type BrandDocumentSegment = { locator: string; text: string };
export type BrandDocumentText = {
  kind: BrandDocumentKind;
  segments: BrandDocumentSegment[];
  warnings: string[];
};

/** Inspect file signatures, not extensions/MIME. DOCX ZIP envelopes are bounded
 * before the parser runs: reject encrypted/ZIP64 archives and oversized totals.
 */
export function inspectBrandDocument(bytes: Uint8Array): BrandDocumentKind {
  if (!bytes.byteLength || bytes.byteLength > MAX_BRAND_DOCUMENT_BYTES)
    throw new Error("brand_document_size");
  if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "pdf";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 22 || view.getUint32(0, true) !== 0x04034b50)
    throw new Error("brand_document_format");
  let end = bytes.byteLength - 22;
  const lower = Math.max(0, bytes.byteLength - 65557);
  while (end >= lower && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < lower) throw new Error("brand_document_zip");
  const entries = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    entries !== view.getUint16(end + 8, true) ||
    !entries ||
    entries > 2000 ||
    start + size !== end ||
    end + 22 + view.getUint16(end + 20, true) !== bytes.byteLength
  )
    throw new Error("brand_document_zip");
  let offset = start,
    expanded = 0;
  const names = new Set<string>();
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("brand_document_zip");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true),
      original = view.getUint32(offset + 24, true);
    const length = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      compressed === 0xffffffff ||
      original === 0xffffffff ||
      local === 0xffffffff ||
      local + 30 > start ||
      offset + 46 + length + extra + comment > end ||
      original > 10 * 1024 * 1024 ||
      original > Math.max(1024, compressed * 100)
    )
      throw new Error("brand_document_zip");
    expanded += original;
    if (expanded > 20 * 1024 * 1024) throw new Error("brand_document_zip");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.slice(offset + 46, offset + 46 + length),
    );
    if (
      !name ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").includes("..") ||
      names.has(name)
    )
      throw new Error("brand_document_zip");
    names.add(name);
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error("brand_document_zip");
    const localNameLength = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    if (
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method ||
      (!(flags & 8) &&
        (view.getUint32(local + 18, true) !== compressed ||
          view.getUint32(local + 22, true) !== original)) ||
      local + 30 + localNameLength + localExtra + compressed > start ||
      new TextDecoder().decode(bytes.slice(local + 30, local + 30 + localNameLength)) !== name
    )
      throw new Error("brand_document_zip");
    offset += 46 + length + extra + comment;
  }
  if (offset !== end || !names.has("[Content_Types].xml") || !names.has("word/document.xml"))
    throw new Error("brand_document_format");
  return "docx";
}

export function boundedBrandSegments(
  kind: BrandDocumentKind,
  segments: BrandDocumentSegment[],
  warnings: string[] = [],
): BrandDocumentText {
  let count = 0;
  const cleaned = segments
    .map((s) => ({
      locator: s.locator,
      text: s.text.split(String.fromCharCode(0)).join("").trim(),
    }))
    .filter((s) => s.text);
  for (const segment of cleaned) {
    count += segment.text.length;
    if (count > MAX_BRAND_DOCUMENT_TEXT || segment.locator.length > 200)
      throw new Error("brand_document_text_limit");
  }
  if (!cleaned.length) throw new Error("brand_document_no_text");
  if (cleaned.length > 1000) throw new Error("brand_document_text_limit");
  return { kind, segments: cleaned, warnings: [...new Set(warnings)].slice(0, 10) };
}
