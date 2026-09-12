import { afterEach, expect, it, vi } from "vitest";
import { EMAIL_LANGUAGE_CODES } from "./email-languages";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { PROOF_REPORT_EMAIL_KEYS, proofReportEmailCopy } from "@/i18n/proof-report-email-copy";
import { renderProofReportEmailHtml } from "./proof-report.functions";
import { readProofReportEmailLocale } from "./proof-report-email-preference.server";
import {
  formatReportEmailDate,
  formatReportEmailMonth,
  formatReportEmailNumber,
  proofReportEmailSubject,
  translateProofReportEmail,
} from "./proof-report-email-presentation";
import type { MonthlyProofReport } from "./proof-report";
const tokens = (v: string) => (v.match(/\{[^{}]+\}/g) ?? []).sort();
const report: MonthlyProofReport = {
  monthKey: "2026-09",
  published: [],
  draftedCount: 1234,
  scheduledCount: 0,
  linksLive: null,
  gsc: null,
  nextMonthPlan: [],
};
const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
afterEach(() => {
  vi.useRealTimers();
});
it("covers exactly the 24 email languages without expanding interface selection", () => {
  expect(Object.keys(proofReportEmailCopy).sort()).toEqual([...EMAIL_LANGUAGE_CODES].sort());
  expect(UI_LANGUAGE_CODES).toEqual(["en", "pl", "sv", "da"]);
});
it.each(EMAIL_LANGUAGE_CODES)("%s provides complete report and search-evidence copy", (locale) => {
  const copy = proofReportEmailCopy[locale];
  expect(Object.keys(copy).sort()).toEqual([...PROOF_REPORT_EMAIL_KEYS].sort());
  for (const key of PROOF_REPORT_EMAIL_KEYS) {
    expect(copy[key].trim(), key).not.toBe("");
    expect(tokens(copy[key]), key).toEqual(tokens(proofReportEmailCopy.en[key]));
  }
  expect(
    new Set([
      copy["gsc.integrity.legacy"],
      copy["gsc.integrity.aggregate"],
      copy["gsc.integrity.rows"],
      copy["gsc.integrity.unknown"],
    ]).size,
  ).toBe(4);
});
it.each(EMAIL_LANGUAGE_CODES)(
  "%s renders localized headings/formatting and preserves untrusted client content",
  (locale) => {
    const html = renderProofReportEmailHtml(
      report,
      "<site> $& {count}",
      { agencyName: "<agency> $&", logoUrl: "javascript:alert(1)" },
      locale,
    );
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(
      escape(proofReportEmailSubject("<site> $& {count}", report.monthKey, locale)),
    );
    expect(html).toContain(escape(proofReportEmailCopy[locale]["report.published.empty"]));
    expect(html).toContain(escape(proofReportEmailCopy[locale]["report.plan.empty"]));
    expect(html).toContain(escape(proofReportEmailCopy[locale]["report.gsc.empty"]));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<agency>");
    expect(html).not.toContain(escape(proofReportEmailCopy[locale]["report.stat.linksLive"]));
    expect(html).toContain(escape(formatReportEmailNumber(1234, locale)));
    expect(formatReportEmailMonth("2026-09", locale)).toBe(
      new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date("2026-09-01T00:00:00Z"),
      ),
    );
    expect(formatReportEmailDate("2026-09-01T00:30:00+14:00", locale)).toBe(
      formatReportEmailDate("2026-09-01", locale),
    );
    expect(formatReportEmailDate("2026-02-29", locale)).toBe("—");
    expect(formatReportEmailNumber(null, locale)).toBe("—");
    expect(formatReportEmailNumber(0, locale)).toBe("0");
    for (const basis of ["legacy", "aggregate", "rows", "unknown"] as const) {
      const evidence = {
        ...report,
        gsc: {
          totalClicks: null,
          totalImpressions: 1234,
          averageCtr: null,
          averagePosition: 12.345,
          importedAt: "2026-09-02",
          basis,
          property: "<property>",
          windowStart: "2026-09-01",
          windowEnd: "2026-09-02",
          rangeLabel: "<range>",
        },
      };
      const snapshot = JSON.stringify(evidence);
      const body = renderProofReportEmailHtml(evidence, "Project", null, locale);
      expect(body).toContain(escape(proofReportEmailCopy[locale][`gsc.integrity.${basis}`]));
      expect(body).toContain(escape(proofReportEmailCopy[locale]["gsc.integrity.disclaimer"]));
      expect(body).toContain("&lt;property&gt;");
      expect(body).toContain("&lt;range&gt;");
      expect(JSON.stringify(evidence)).toBe(snapshot);
    }
  },
);
it("keeps interpolation literal and rejects prototype keys", () => {
  expect(
    translateProofReportEmail("fr", "report.footer.agency", { agency: "$& {count}" }),
  ).toContain("$& {count}");
  expect(translateProofReportEmail("fr", "__proto__")).toBe("__proto__");
  expect(formatReportEmailMonth("2026-13", "mt")).toBe("—");
});
function db(result: { data: unknown; error: unknown } | Promise<never>) {
  const capture = {
    table: "",
    columns: "",
    column: "",
    user: "",
    signal: undefined as AbortSignal | undefined,
  };
  const q = {
    select: (columns: string) => {
      capture.columns = columns;
      return q;
    },
    eq: (column: string, user: string) => {
      capture.column = column;
      capture.user = user;
      return q;
    },
    abortSignal: (signal: AbortSignal) => {
      capture.signal = signal;
      return q;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  return {
    capture,
    from: vi.fn((table: string) => {
      capture.table = table;
      return q;
    }),
  };
}
it.each(EMAIL_LANGUAGE_CODES)(
  "reads caller preference %s without enabling or writing email state",
  async (locale) => {
    const source = db({ data: { locale, enabled: false }, error: null });
    expect(await readProofReportEmailLocale("caller-id", source)).toBe(locale);
    expect(source.capture).toMatchObject({
      table: "operational_email_preferences",
      columns: "locale",
      column: "user_id",
      user: "caller-id",
    });
    expect(source.from).toHaveBeenCalledOnce();
  },
);
it("uses the settings default only for an absent preference row", async () => {
  expect(await readProofReportEmailLocale("caller", db({ data: null, error: null }))).toBe("en");
  for (const result of [
    { data: { locale: "xx" }, error: null },
    { data: {}, error: null },
    { data: undefined, error: null },
    { data: { locale: "de" }, error: new Error("private detail") },
  ])
    await expect(readProofReportEmailLocale("caller", db(result))).rejects.toThrow(
      "could not be confirmed",
    );
});
it("aborts a stalled preference read without retrying or disclosing the underlying error", async () => {
  vi.useFakeTimers();
  const source = db(new Promise<never>(() => {}));
  const read = readProofReportEmailLocale("caller", source);
  const rejected = expect(read).rejects.toThrow("could not be confirmed");
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(source.capture.signal?.aborted).toBe(true);
  expect(source.from).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
