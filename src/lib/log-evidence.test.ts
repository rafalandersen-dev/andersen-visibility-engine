import { describe, it, expect, vi } from "vitest";
import {
  claimedLogAgent,
  prepareLogImport,
  summarizeLogBatch,
  logDocumentSchema,
  type LogRow,
} from "./log-evidence";
import { importLogEvidence } from "./log-evidence.server";
import { logEvidenceCopy } from "@/i18n/log-evidence";
export const logFixture = {
  format: "milo-log-evidence-v1",
  source: "Synthetic fixture",
  layer: "edge",
  method: "manual export v1",
  hostname: "example.com",
  windowStart: "2026-08-01T00:00:00Z",
  windowEnd: "2026-08-02T00:00:00Z",
  completeness: "partial",
  publicPathsConfirmed: true,
  supersedesId: null,
  rows: [
    {
      time: "2026-08-01T12:00:00Z",
      page: "/public",
      status: 200,
      method: "GET",
      userAgent: "Mozilla/5.0 (compatible; GPTBot/1.0; https://example.com)",
    },
  ],
};
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
describe("private log normalization", () => {
  it.each([
    ["GPTBot/1.0", "GPTBot"],
    ["gptbot", "GPTBot"],
    ["NotGPTBot", "unknown"],
    ["GPTBot-Evil", "unknown"],
    ["GPTBot bingbot", "unknown"],
    ["Mozilla/5.0", "unknown"],
    ["ChatGPT-User/1.0", "ChatGPT-User"],
  ])("classifies %s only as a supplied claim", (ua, expected) =>
    expect(claimedLogAgent(ua)).toBe(expected),
  );
  it("never retains UA text and enforces strict field allowlists", () => {
    const doc = prepareLogImport({
      ...logFixture,
      rows: [{ ...logFixture.rows[0], userAgent: "GPTBot PRIVATE UA TOKEN" }],
    });
    expect(JSON.stringify(doc)).not.toContain("PRIVATE");
    expect(JSON.stringify(doc)).not.toContain("userAgent");
    expect(doc.verified).toBe(false);
    for (const extra of [
      { ip: "192.0.2.1" },
      { headers: {} },
      { cookie: "secret" },
      { body: "secret" },
      { verified: true },
    ])
      expect(() =>
        prepareLogImport({ ...logFixture, rows: [{ ...logFixture.rows[0], ...extra }] }),
      ).toThrow();
    expect(() => prepareLogImport({ ...logFixture, verified: true })).toThrow();
    expect(() => logDocumentSchema.parse({ ...doc, verified: true })).toThrow();
  });
  it.each([
    "/x?token=secret",
    "/x#secret",
    "/x%3Ftoken",
    "/user@private",
    "https://example.com/x",
    "//evil.example/x",
    "/../x",
    "/x\\y",
    "/x\nsecret",
  ])("refuses unsafe path %s", (page) =>
    expect(() =>
      prepareLogImport({ ...logFixture, rows: [{ ...logFixture.rows[0], page }] }),
    ).toThrow(),
  );
  it.each([
    "user:pass@example.com",
    "127.0.0.1",
    "example.com/path",
    "example.com?token=x",
    "example.com:443",
    "example.local",
  ])("refuses unsafe hostname %s", (hostname) =>
    expect(() => prepareLogImport({ ...logFixture, hostname })).toThrow(),
  );
  it("rejects all malformed and out-of-window rows, invalid intervals, bounds and future instants", () => {
    for (const row of [
      { ...logFixture.rows[0], time: logFixture.windowEnd },
      { ...logFixture.rows[0], status: 600 },
      { ...logFixture.rows[0], time: "2026-08-01T12:00:00+99:99" },
    ])
      expect(() => prepareLogImport({ ...logFixture, rows: [logFixture.rows[0], row] })).toThrow();
    for (const change of [
      { windowEnd: logFixture.windowStart },
      { windowEnd: "2026-10-01T00:00:00Z" },
      { windowStart: "2019-12-31T00:00:00Z" },
      { publicPathsConfirmed: false },
      { rows: Array(501).fill(logFixture.rows[0]) },
    ])
      expect(() => prepareLogImport({ ...logFixture, ...change })).toThrow();
    expect(() => prepareLogImport(logFixture, Date.parse(logFixture.windowStart))).toThrow();
  });
  it("normalizes timezones, stable order and safe duplicates without claiming distinct requests", () => {
    const r = logFixture.rows[0];
    const doc = prepareLogImport({
      ...logFixture,
      rows: [r, { ...r, time: "2026-08-01T14:00:00+02:00" }, { ...r, page: "/other" }],
    });
    expect(doc.input.rows).toHaveLength(2);
    expect(doc.duplicateRows).toBe(1);
    expect(doc.submittedRows).toBe(3);
    expect(prepareLogImport({ ...logFixture, rows: [{ ...r, page: "/other" }, r] }).input).toEqual(
      doc.input,
    );
  });
  it("shows separate supplied denominators and never derives real traffic or answer/referral counts", () => {
    const doc = prepareLogImport({ ...logFixture, completeness: "complete" });
    const row = {
      ...doc,
      id: scope.ownerId,
      createdAt: logFixture.windowEnd,
      hash: "a".repeat(64),
    } as LogRow;
    const exact = summarizeLogBatch(row, logFixture.windowStart, logFixture.windowEnd);
    expect(exact).toMatchObject({
      supplied: 1,
      claimed: 1,
      coverage: "declared-complete",
      statuses: [["200", 1]],
      pages: [["/public", 1]],
    });
    expect(summarizeLogBatch(row, "2026-07-31T00:00:00Z", logFixture.windowEnd).coverage).toBe(
      "unknown",
    );
    expect(summarizeLogBatch(row, logFixture.windowEnd, "2026-08-03T00:00:00Z")).toMatchObject({
      supplied: 0,
      claimed: 0,
      coverage: "unknown",
    });
    expect(() => summarizeLogBatch(row, "bad", "bad")).toThrow();
  });
  it("revalidates canonical safe records and limits before any server write", async () => {
    const rpc = vi.fn(async () => ({ data: scope.ownerId, error: null }));
    const doc = prepareLogImport(logFixture);
    await importLogEvidence(scope, doc, rpc);
    expect(rpc).toHaveBeenCalledTimes(1);
    for (const bad of [
      { ...doc, submittedRows: 2 },
      { ...doc, input: { ...doc.input, rows: [...doc.input.rows, ...doc.input.rows] } },
      { ...doc, input: { ...doc.input, rows: [{ ...doc.input.rows[0], userAgent: "secret" }] } },
      { ...doc, verified: true },
    ])
      await expect(importLogEvidence(scope, bad, rpc)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("has complete copy in four locales", () => {
    for (const locale of ["pl", "sv", "da"])
      expect(Object.keys(logEvidenceCopy[locale])).toEqual(Object.keys(logEvidenceCopy.en));
  });
});
