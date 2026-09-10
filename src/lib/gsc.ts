/** Bounded Search Console intake. Saved provenance remains owner-supplied. */
import { normalizePath } from "./analytics";
import type {
  ContentAsset,
  GscRow,
  GscImport,
  GscImportSummary,
  MatchedGscPagePerformance,
} from "./types";
export const MAX_ROWS_PER_IMPORT = 1000;
export const MAX_IMPORTS = 5;
/** API refresh keeps the established rolling window; retained records are not rewritten. */
export function retainGscApiImport(existing: GscImport[], imp: GscImport): GscImport[] {
  return [imp, ...existing].slice(0, MAX_IMPORTS);
}

export const MAX_GSC_BYTES = 2_000_000;
export class GscParseError extends Error {}

export function normalizeGscHeader(header: string): string {
  const h = header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ");
  if (/^(query|queries|search query|top queries?)$/.test(h)) return "query";
  if (/^(page|pages|url|urls|landing page|address|top pages?)$/.test(h)) return "page";
  if (/^(date|dates|day)$/.test(h)) return "date";
  if (/^(clicks?|url clicks)$/.test(h)) return "clicks";
  if (/^(impressions?|impr)$/.test(h)) return "impressions";
  if (/^(ctr|click through rate|click-through rate)$/.test(h)) return "ctr";
  if (/^(position|avg position|average position|avg\.? pos\.?|pos)$/.test(h)) return "position";
  return "";
}
/** Strict decimal syntax. Ambiguous thousands separators must be removed explicitly. */
export function parseNumber(value: string): number | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(s))
    throw new GscParseError("Invalid number; use plain digits and a decimal point or comma.");
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER)
    throw new GscParseError("Number is out of range.");
  return n;
}
export function parseCtr(value: string): number | null {
  const raw = String(value ?? "").trim();
  const percent = raw.endsWith("%");
  const n = parseNumber(percent ? raw.slice(0, -1) : raw);
  if (n === null) return null;
  const result = percent ? n : n * 100;
  if (result > 100)
    throw new GscParseError("CTR must be a fraction from 0 to 1 or a percentage from 0% to 100%.");
  return result;
}
export function gscMetric(value: unknown, kind: "count" | "ctr" | "position"): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    return null;
  if (kind === "count" && !Number.isSafeInteger(value)) return null;
  if (kind === "ctr" && value > 100) return null;
  if (kind === "position" && value < 1) return null;
  return value;
}
/** Do not discard a query/fragment or collapse www, case, slash, protocol or hostname. */
export function gscPageUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    /[\s\\]/.test(value) ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  try {
    const u = new URL(value);
    if (
      !/^https?:$/.test(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !u.hostname.includes(".")
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function gscProperty(value: string): string | null {
  if (value.startsWith("sc-domain:")) {
    const host = value.slice(10);
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
    return value;
  }
  return gscPageUrl(value);
}
export function gscPageInProperty(page: string, property: string): boolean {
  const url = gscPageUrl(page),
    prop = gscProperty(property);
  if (!url || !prop) return false;
  if (prop.startsWith("sc-domain:")) {
    const host = new URL(url).hostname,
      domain = prop.slice(10);
    return host === domain || host.endsWith(`.${domain}`);
  }
  return url.startsWith(prop);
}
export function gscDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function parseCsvGrid(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, "\n");
  const first = clean.split("\n")[0];
  // Only count delimiters outside quoted headers.
  const counts = new Map([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  for (const c of first) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  const delim = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    inQuotes = false,
    closed = false;
  const pushField = () => {
    if (field.length > 4000) throw new GscParseError("CSV cell is too long.");
    row.push(field);
    field = "";
    closed = false;
    if (row.length > 16) throw new GscParseError("Too many columns.");
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS_PER_IMPORT + 1)
      throw new GscParseError("CSV exceeds 1,000 rows. Export a smaller table.");
  };
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          closed = true;
        }
      } else field += c;
    } else if (c === delim) pushField();
    else if (c === "\n") pushRow();
    else if (c === '"' && !field && !closed) inQuotes = true;
    else {
      if (closed || c === '"') throw new GscParseError("Malformed CSV quoting.");
      field += c;
    }
  }
  if (inQuotes) throw new GscParseError("Unclosed CSV quote.");
  if (field || row.length || closed) pushRow();
  return rows;
}
export function detectImportType(rows: GscRow[]): GscImport["importType"] {
  const kinds = new Set(rows.map((r) => r.type));
  if (kinds.size > 1) return "mixed";
  return ({ query: "queries", page: "pages", date: "dates", unknown: "unknown" } as const)[
    rows[0]?.type ?? "unknown"
  ];
}
export const unknownGscSummary = (rowCount = 0): GscImportSummary => ({
  totalClicks: null,
  totalImpressions: null,
  averageCtr: null,
  averagePosition: null,
  rowCount,
});
export function safeGscRow(r: GscRow): GscRow {
  return {
    ...r,
    clicks: gscMetric(r.clicks, "count"),
    impressions: gscMetric(r.impressions, "count"),
    ctr: gscMetric(r.ctr, "ctr"),
    position: gscMetric(r.position, "position"),
  };
}
export function sortGscRows(a: GscRow, b: GscRow) {
  return (b.clicks ?? -1) - (a.clicks ?? -1) || (b.impressions ?? -1) - (a.impressions ?? -1);
}
export function summarizeGscRows(input: GscRow[]): GscImportSummary {
  const rows = input.map(safeGscRow),
    result = unknownGscSummary(rows.length);
  result.topQuery = [...rows].filter((r) => r.type === "query").sort(sortGscRows)[0]?.query;
  result.topPage = [...rows].filter((r) => r.type === "page").sort(sortGscRows)[0]?.page;
  const keys = rows.map((r) =>
    r.type === "page" ? gscPageUrl(r.page) : r.type === "query" ? r.query : r.date,
  );
  if (
    !rows.length ||
    detectImportType(rows) === "mixed" ||
    rows.some(
      (r) => r.type === "unknown" || [r.query, r.page, r.date].filter(Boolean).length !== 1,
    ) ||
    keys.some((k) => !k) ||
    new Set(keys).size !== keys.length
  )
    return result;
  const sum = (key: "clicks" | "impressions") =>
    rows.every((r) => r[key] !== null)
      ? gscMetric(
          rows.reduce((s, r) => s + r[key]!, 0),
          "count",
        )
      : null;
  result.totalClicks = sum("clicks");
  result.totalImpressions = sum("impressions");
  if (result.totalImpressions !== null && result.totalImpressions > 0) {
    if (result.totalClicks !== null)
      result.averageCtr = gscMetric((result.totalClicks / result.totalImpressions) * 100, "ctr");
    if (rows.every((r) => r.impressions === 0 || r.position !== null))
      result.averagePosition = gscMetric(
        rows.reduce((s, r) => s + (r.position ?? 0) * r.impressions!, 0) / result.totalImpressions,
        "position",
      );
  }
  return result;
}
/** Recompute display, never overwrite historical imports or trust their cached summary. */
export function gscImportSummary(imp: GscImport): GscImportSummary {
  if (imp.integrityVersion !== 2 || imp.rows.length > MAX_ROWS_PER_IMPORT)
    return unknownGscSummary(imp.rows.length);
  const base = summarizeGscRows(imp.rows);
  if (imp.source !== "api") return base;
  const a = imp.aggregate;
  return {
    ...base,
    ...unknownGscSummary(imp.rows.length),
    topQuery: base.topQuery,
    topPage: base.topPage,
    totalClicks: gscMetric(a?.clicks, "count"),
    totalImpressions: gscMetric(a?.impressions, "count"),
    averageCtr: gscMetric(a?.ctr, "ctr"),
    averagePosition: gscMetric(a?.position, "position"),
  };
}
export function gscSummaryBasis(imp: GscImport): "legacy" | "aggregate" | "rows" | "unknown" {
  if (imp.integrityVersion !== 2) return "legacy";
  if (imp.source === "api") return imp.aggregate ? "aggregate" : "unknown";
  return detectImportType(imp.rows) === "mixed" ? "unknown" : "rows";
}
export function formatGscMetric(n: number | null | undefined, percent = false): string {
  return n == null || !Number.isFinite(n)
    ? "—"
    : `${Math.round(n * 100) / 100}${percent ? "%" : ""}`;
}
export function parseGscCsv(
  csvText: string,
  fileName?: string,
  context?: { property: string; start: string; end: string },
): GscImport {
  if (!csvText.trim()) throw new GscParseError("The CSV file is empty.");
  if (new TextEncoder().encode(csvText).byteLength > MAX_GSC_BYTES)
    throw new GscParseError("CSV exceeds 2 MB.");
  if (
    context &&
    (!gscProperty(context.property) ||
      !gscDay(context.start) ||
      !gscDay(context.end) ||
      context.start > context.end)
  )
    throw new GscParseError("Supply a valid Search Console property and inclusive date range.");
  const grid = parseCsvGrid(csvText.replace(/^\uFEFF/, ""));
  if (grid.length < 2) throw new GscParseError("The CSV has no data rows.");
  const header = grid[0].map(normalizeGscHeader),
    known = header.filter(Boolean);
  if (new Set(known).size !== known.length)
    throw new GscParseError("Duplicate columns are ambiguous.");
  const dimensions = ["query", "page", "date"].filter((d) => header.includes(d));
  if (dimensions.length !== 1 || header.some((h) => !h))
    throw new GscParseError(
      "Import one standard Query, Page or Date table at a time; remove unsupported columns.",
    );
  if (!header.includes("clicks") && !header.includes("impressions"))
    throw new GscParseError("Clicks or impressions column required.");
  const type = dimensions[0] as GscRow["type"],
    seen = new Set<string>();
  const rows = grid.slice(1).map((cells) => {
    if (cells.length !== header.length)
      throw new GscParseError("CSV row width differs from its header.");
    const get = (key: string) => cells[header.indexOf(key)]?.trim() ?? "";
    const key = get(type);
    const identity = type === "page" ? (gscPageUrl(key) ?? key) : key;
    if (!key || seen.has(identity))
      throw new GscParseError("Missing or duplicate dimension value.");
    seen.add(identity);
    if (
      type === "page" &&
      (!gscPageUrl(key) || (context && !gscPageInProperty(key, context.property)))
    )
      throw new GscParseError(
        "Page must be a full public URL within the supplied property, without credentials, query strings or fragments.",
      );
    if (
      type === "date" &&
      (!gscDay(key) || (context && (key < context.start || key > context.end)))
    )
      throw new GscParseError("Date is invalid or outside the supplied window.");
    const clicks = parseNumber(get("clicks")),
      impressions = parseNumber(get("impressions")),
      position = parseNumber(get("position")),
      ctr = parseCtr(get("ctr"));
    if (
      [clicks, impressions].some((n) => n !== null && !Number.isSafeInteger(n)) ||
      (clicks !== null && impressions !== null && clicks > impressions) ||
      (position !== null && position < 1)
    )
      throw new GscParseError("Invalid count, click/impression relationship or position.");
    return {
      type,
      [type]: key,
      ...(type === "page" ? { path: normalizePath(key) } : {}),
      clicks,
      impressions,
      ctr,
      position,
    } as GscRow;
  });
  return {
    id: `gsc_${globalThis.crypto.randomUUID()}`,
    importedAt: new Date().toISOString(),
    integrityVersion: 2,
    source: "manual_csv",
    importType: detectImportType(rows),
    fileName: fileName?.slice(0, 200),
    rows,
    summary: summarizeGscRows(rows),
    truncated: false,
    ...(context
      ? { selectedSiteUrl: context.property, dateRange: { start: context.start, end: context.end } }
      : {}),
  };
}
export function matchGscToPublishedContent(
  assets: ContentAsset[],
  imp: GscImport,
): MatchedGscPagePerformance[] {
  const byUrl = new Map<string, GscRow[]>();
  if (imp.integrityVersion === 2 && imp.rows.length <= MAX_ROWS_PER_IMPORT)
    for (const row of imp.rows) {
      const url = gscPageUrl(row.page);
      if (
        row.type !== "page" ||
        row.query ||
        row.date ||
        !url ||
        !imp.selectedSiteUrl ||
        !gscPageInProperty(url, imp.selectedSiteUrl)
      )
        continue;
      byUrl.set(url, [...(byUrl.get(url) ?? []), safeGscRow(row)]);
    }
  return assets
    .filter((c) => c.livePublishStatus === "published" && gscPageUrl(c.liveUrl))
    .map((c) => {
      const url = gscPageUrl(c.liveUrl)!,
        matches = byUrl.get(url),
        r = matches?.length === 1 ? matches[0] : undefined;
      return {
        assetId: c.id,
        title: c.title,
        liveUrl: c.liveUrl!,
        path: normalizePath(c.liveUrl!),
        publishedAt: c.livePublishedAt,
        gscClicks: r?.clicks ?? null,
        gscImpressions: r?.impressions ?? null,
        gscCtr: r?.ctr ?? null,
        gscPosition: r?.position ?? null,
        topQueries: [],
        hasGscData: !!r && [r.clicks, r.impressions, r.ctr, r.position].some((n) => n !== null),
      };
    })
    .sort(
      (a, b) =>
        Number(b.hasGscData) - Number(a.hasGscData) || (b.gscClicks ?? -1) - (a.gscClicks ?? -1),
    );
}
export type GscRecKey =
  | "improveTitleMeta"
  | "improveCtr"
  | "addSupportingContent"
  | "improveContentDepth"
  | "keepMonitoring"
  | "waitOrPromote";
export function gscPageRecommendation(m: MatchedGscPagePerformance): GscRecKey {
  if (!m.hasGscData) return "waitOrPromote";
  if (m.gscImpressions !== null && m.gscImpressions > 0 && m.gscClicks === 0)
    return "improveTitleMeta";
  if (m.gscImpressions !== null && m.gscImpressions >= 100 && m.gscCtr !== null && m.gscCtr < 1)
    return "improveCtr";
  if (
    m.gscPosition !== null &&
    m.gscPosition > 20 &&
    m.gscImpressions !== null &&
    m.gscImpressions > 0
  )
    return "addSupportingContent";
  if (m.gscPosition !== null && m.gscPosition >= 8 && m.gscPosition <= 20)
    return "improveContentDepth";
  return "keepMonitoring";
}
