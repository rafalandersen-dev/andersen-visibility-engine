/**
 * GSC Lite / SEO Proof Import v1 — forgiving Google Search Console CSV parsing,
 * normalization, summary and matching to Milo-published pages.
 *
 * Pure module (no I/O). Handles English and lightly-localized GSC exports:
 * decimal points or commas, "12.5%" / "12,5%" / "0.125" CTRs, "8.2"/"8,2"
 * positions, and comma- or semicolon-delimited files with quoted fields.
 */
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

let counter = 0;
function uid(): string {
  counter += 1;
  return `gsc_${Date.now().toString(36)}_${counter}`;
}

/** Map a raw CSV header to a canonical field name (or "" if unrecognized). */
export function normalizeGscHeader(header: string): string {
  const h = header.replace(/^﻿/, "").trim().toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ");
  if (/^(query|queries|search query|top queries?)$/.test(h)) return "query";
  if (/^(page|pages|url|urls|landing page|address|top pages?)$/.test(h)) return "page";
  if (/^(date|dates|day)$/.test(h)) return "date";
  if (/^(clicks?|url clicks)$/.test(h)) return "clicks";
  if (/^(impressions?|impr)$/.test(h)) return "impressions";
  if (/^(ctr|click through rate|click-through rate)$/.test(h)) return "ctr";
  if (/^(position|avg position|average position|avg\.? pos\.?|pos)$/.test(h)) return "position";
  return "";
}

/** Parse a numeric value tolerating %, thousands separators and decimal commas. */
export function parseNumber(value: string): number {
  if (value == null) return 0;
  let s = String(value).trim().replace(/%/g, "").replace(/\s+/g, "");
  if (!s) return 0;
  s = s.replace(/[^\d.,-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // The right-most separator is the decimal one; the other is thousands.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    // "1,234" → thousands; "12,5" / "0,125" → decimal. Leading group must be
    // non-zero to count as thousands (so "0,125" stays a decimal fraction).
    if (/^[1-9]\d{0,2}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  } else if (hasDot) {
    // "1.234" European thousands vs "12.5" / "0.125" decimal.
    if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Parse a CTR into a 0–100 percentage. "0.125" → 12.5, "12,5%" → 12.5. */
export function parseCtr(value: string): number {
  const raw = String(value ?? "");
  const hadPercent = raw.includes("%");
  let n = parseNumber(raw);
  if (!hadPercent && n > 0 && n <= 1) n = n * 100; // fraction form
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

/** Split CSV text into rows of fields, honoring quotes and a detected delimiter. */
function parseCsvGrid(text: string): string[][] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = clean.split("\n").find((l) => l.trim().length > 0) ?? "";
  const count = (ch: string) => (firstLine.match(new RegExp(`\\${ch}`, "g")) ?? []).length;
  const delim = count("\t") > count(",") && count("\t") > count(";") ? "\t" : count(";") > count(",") ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function detectImportType(rows: GscRow[]): GscImport["importType"] {
  if (!rows.length) return "unknown";
  const kinds = new Set(rows.map((r) => r.type));
  const hasQuery = kinds.has("query");
  const hasPage = kinds.has("page");
  const hasDate = kinds.has("date");
  if (hasQuery && hasPage) return "mixed";
  if (hasQuery) return "queries";
  if (hasPage) return "pages";
  if (hasDate) return "dates";
  return "unknown";
}

export function summarizeGscRows(rows: GscRow[]): GscImportSummary {
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  // Impression-weighted average position; CTR derived from totals when possible.
  const posWeight = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  const averagePosition = totalImpressions > 0 ? Math.round((posWeight / totalImpressions) * 10) / 10 : 0;
  const averageCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0;
  const topQ = [...rows].filter((r) => r.query).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)[0];
  const topP = [...rows].filter((r) => r.page).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)[0];
  return {
    totalClicks,
    totalImpressions,
    averageCtr,
    averagePosition,
    rowCount: rows.length,
    topQuery: topQ?.query,
    topPage: topP?.path ?? topP?.page,
  };
}

export class GscParseError extends Error {}

/** Parse a GSC CSV export into a normalized GscImport. Throws GscParseError. */
export function parseGscCsv(csvText: string, fileName?: string): GscImport {
  if (!csvText || !csvText.trim()) throw new GscParseError("The CSV file is empty.");
  const grid = parseCsvGrid(csvText);
  if (grid.length < 2) throw new GscParseError("The CSV has no data rows.");

  const headerCells = grid[0].map(normalizeGscHeader);
  const col = (name: string) => headerCells.indexOf(name);
  const iClicks = col("clicks");
  const iImpr = col("impressions");
  const iCtr = col("ctr");
  const iPos = col("position");
  const iQuery = col("query");
  const iPage = col("page");
  const iDate = col("date");

  if (iClicks === -1 && iImpr === -1) {
    throw new GscParseError("Could not find clicks/impressions columns. Please export a standard Google Search Console CSV.");
  }
  if (iQuery === -1 && iPage === -1 && iDate === -1) {
    throw new GscParseError("Could not find a Query, Page or Date column. Please export a standard Google Search Console CSV.");
  }

  const dataRows = grid.slice(1);
  const truncated = dataRows.length > MAX_ROWS_PER_IMPORT;
  const limited = dataRows.slice(0, MAX_ROWS_PER_IMPORT);

  const rows: GscRow[] = [];
  for (const cells of limited) {
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i] : "");
    const query = iQuery >= 0 ? get(iQuery).trim() : "";
    const pageRaw = iPage >= 0 ? get(iPage).trim() : "";
    const date = iDate >= 0 ? get(iDate).trim() : "";
    const type: GscRow["type"] = query ? "query" : pageRaw ? "page" : date ? "date" : "unknown";
    // A row with no dimension value at all is noise — skip it.
    if (type === "unknown") continue;
    const row: GscRow = {
      type,
      clicks: Math.round(parseNumber(get(iClicks))),
      impressions: Math.round(parseNumber(get(iImpr))),
      ctr: parseCtr(get(iCtr)),
      position: Math.round(parseNumber(get(iPos)) * 10) / 10,
    };
    if (query) row.query = query;
    if (pageRaw) { row.page = pageRaw; row.path = normalizePath(pageRaw); }
    if (date) row.date = date;
    rows.push(row);
  }

  if (!rows.length) throw new GscParseError("No valid rows were found in this CSV.");

  return {
    id: uid(),
    importedAt: new Date().toISOString(),
    source: "manual_csv",
    importType: detectImportType(rows),
    fileName,
    rows,
    summary: summarizeGscRows(rows),
    truncated,
  };
}

/**
 * Aggregate page-level GSC rows by normalized path and match them to the
 * project's Milo-published content assets. `assets` are the project's content
 * items (they live in the store, not on Project). Returns every published page,
 * with `hasGscData` false when nothing matched.
 */
export function matchGscToPublishedContent(
  assets: ContentAsset[],
  imp: GscImport,
): MatchedGscPagePerformance[] {
  type Agg = { clicks: number; impressions: number; posWeight: number; queries: Map<string, GscRow> };
  const byPath = new Map<string, Agg>();
  for (const r of imp.rows) {
    if (!r.path) continue;
    const a = byPath.get(r.path) ?? { clicks: 0, impressions: 0, posWeight: 0, queries: new Map() };
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.posWeight += r.position * r.impressions;
    if (r.query) {
      const prev = a.queries.get(r.query);
      if (prev) {
        prev.clicks += r.clicks;
        prev.impressions += r.impressions;
      } else {
        a.queries.set(r.query, { ...r });
      }
    }
    byPath.set(r.path, a);
  }

  const published = assets.filter((c) => c.livePublishStatus === "published" && c.liveUrl);
  return published
    .map((c) => {
      const path = normalizePath(c.liveUrl as string);
      const a = byPath.get(path);
      const gscImpressions = a?.impressions ?? 0;
      const gscClicks = a?.clicks ?? 0;
      const topQueries = a
        ? [...a.queries.values()]
            .sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions)
            .slice(0, 5)
            .map((q) => ({ query: q.query as string, clicks: q.clicks, impressions: q.impressions, ctr: q.ctr, position: q.position }))
        : [];
      return {
        assetId: c.id,
        title: c.title,
        liveUrl: c.liveUrl as string,
        path,
        publishedAt: c.livePublishedAt,
        gscClicks,
        gscImpressions,
        gscCtr: gscImpressions > 0 ? Math.round((gscClicks / gscImpressions) * 1000) / 10 : 0,
        gscPosition: gscImpressions > 0 ? Math.round((a!.posWeight / gscImpressions) * 10) / 10 : 0,
        topQueries,
        hasGscData: Boolean(a),
      };
    })
    .sort((x, y) => Number(y.hasGscData) - Number(x.hasGscData) || y.gscClicks - x.gscClicks || y.gscImpressions - x.gscImpressions);
}

export type GscRecKey =
  | "improveTitleMeta"
  | "improveCtr"
  | "addSupportingContent"
  | "improveContentDepth"
  | "keepMonitoring"
  | "waitOrPromote";

/** Deterministic recommendation for a matched (or unmatched) page. */
export function gscPageRecommendation(m: MatchedGscPagePerformance): GscRecKey {
  if (!m.hasGscData) return "waitOrPromote";
  if (m.gscImpressions > 0 && m.gscClicks === 0) return "improveTitleMeta";
  if (m.gscImpressions >= 100 && m.gscCtr < 1) return "improveCtr";
  if (m.gscPosition > 20 && m.gscImpressions > 0) return "addSupportingContent";
  if (m.gscPosition >= 8 && m.gscPosition <= 20) return "improveContentDepth";
  return "keepMonitoring";
}
