import { describe, expect, it } from "vitest";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import {
  formatReportDate,
  formatReportMonth,
  formatReportNumber,
  proofReportSubject,
} from "./proof-report-presentation";
import { renderProofReportEmailHtml } from "./proof-report.functions";
import type { MonthlyProofReport } from "./proof-report";

const empty: MonthlyProofReport = {
  monthKey: "2026-09",
  published: [],
  draftedCount: 0,
  scheduledCount: 0,
  linksLive: null,
  gsc: null,
  nextMonthPlan: [],
};
const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

describe("report presentation preserves the reporting period", () => {
  it.each(UI_LANGUAGE_CODES)(
    "%s formats the month and recorded day without timezone drift",
    (language) => {
      const month = new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date("2026-09-01T00:00:00Z"));
      expect(formatReportMonth("2026-09", language)).toBe(month);
      const date = formatReportDate("2026-09-01", language);
      expect(formatReportDate("2026-09-01T00:30:00+14:00", language)).toBe(date);
      expect(formatReportDate("2026-09-01T23:30:00-12:00", language)).toBe(date);
      expect(proofReportSubject("Name $& {count}", "2026-09", language)).toBe(
        `${translate(language, "report.title")} — Name $& {count} · ${month}`,
      );
    },
  );
  it.each(["", "2026-00", "2026-13", "2026-9", "2026-09-01"])(
    "rejects invalid month %s",
    (value) => {
      expect(formatReportMonth(value)).toBe("—");
    },
  );
  it.each([undefined, "", "2026-02-29", "2026-04-31", "2026-13-01", "not-a-date"])(
    "does not normalize an invalid calendar day %s into a real one",
    (value) => {
      expect(formatReportDate(value, "sv")).toBe("—");
    },
  );
  it("accepts leap days and retains the existing metric precision and unknown distinction", () => {
    expect(formatReportDate("2024-02-29", "en")).toBe("29 Feb 2024");
    expect(formatReportNumber(0, "pl")).toBe("0");
    expect(formatReportNumber(12.345, "pl")).toBe("12,35");
    expect(formatReportNumber(12345.678, "en")).toBe("12,345.68");
    for (const value of [null, undefined, NaN, Infinity])
      expect(formatReportNumber(value, "da")).toBe("—");
  });
  it("falls back to English for unavailable languages without enabling them", () => {
    expect(formatReportMonth("2026-09", "fr" as "en")).toBe(formatReportMonth("2026-09", "en"));
    expect(formatReportNumber(12.3, "fr" as "en")).toBe("12.3");
  });
});

describe("localized report email remains an escaped rendering of verified inputs", () => {
  it.each(UI_LANGUAGE_CODES)(
    "%s translates empty states and headings while omitting unknown link counts",
    (language) => {
      const html = renderProofReportEmailHtml(empty, "Client", null, language);
      for (const key of [
        "report.published.empty",
        "report.plan.empty",
        "report.gsc.empty",
        "report.footer",
      ])
        expect(html).toContain(escape(translate(language, key)));
      expect(html).toContain(escape(proofReportSubject("Client", "2026-09", language)));
      expect(html).not.toContain(escape(translate(language, "report.stat.linksLive")));
      expect(html).not.toContain("report.");
      expect(empty.monthKey).toBe("2026-09");
    },
  );
  it.each(UI_LANGUAGE_CODES)(
    "%s preserves evidence disclaimers, unknown metrics and escaped client data",
    (language) => {
      const report: MonthlyProofReport = {
        ...empty,
        linksLive: 0,
        draftedCount: 1234,
        published: [
          {
            id: "1",
            title: "<script>unsafe</script>",
            liveUrl: "javascript:alert(1)",
            publishedAt: "2026-09-01",
          },
          {
            id: "2",
            title: "Safe & live",
            liveUrl: 'https://example.com/?x="&y=1',
            publishedAt: "2026-09-02",
          },
        ],
        nextMonthPlan: [
          { title: "<img src=x>", plannedDate: "2026-10-01", contentType: "Blog Article" },
        ],
        gsc: {
          totalClicks: null,
          totalImpressions: 12345,
          averageCtr: null,
          averagePosition: 12.345,
          importedAt: "2026-09-03",
          basis: "rows",
          property: "<property>",
          windowStart: "2026-09-01",
          windowEnd: "2026-09-02",
          rangeLabel: "<range>",
        },
      };
      const snapshot = JSON.stringify(report);
      const html = renderProofReportEmailHtml(
        report,
        'Site <name> "',
        { agencyName: "$& {count} <agency>", logoUrl: "javascript:alert(2)" },
        language,
      );
      expect(JSON.stringify(report)).toBe(snapshot);
      expect(html).toContain(escape(translate(language, "gsc.integrity.rows")));
      expect(html).toContain(escape(translate(language, "gsc.integrity.disclaimer")));
      expect(html).toContain(
        escape(
          translate(language, "report.gsc.line", {
            clicks: "—",
            impressions: formatReportNumber(12345, language),
            position: formatReportNumber(12.345, language),
          }),
        ),
      );
      expect(html).toContain(
        escape(translate(language, "report.footer.agency", { agency: "$& {count} <agency>" })),
      );
      expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
      expect(html).toContain("&lt;img src=x&gt;");
      expect(html).toContain('href="https://example.com/?x=&quot;&amp;y=1"');
      expect(html).toContain(escape(formatReportDate("2026-10-01", language)));
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<property>");
    },
  );
});
