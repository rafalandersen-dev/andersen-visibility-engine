import { describe, expect, it } from "vitest";
import {
  checkOutputDependencies,
  compareSourceSnapshots,
  type SourceSnapshot,
  type OutputDependency,
} from "./source-refresh";

const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const sourceId = "00000000-0000-4000-8000-000000000002";
const fact = {
  key: "sku:one:price:SE:SEK",
  productId: "one",
  variantId: "blue",
  market: "SE",
  currency: "SEK",
  field: "price" as const,
  value: "120",
  locator: "Product offer",
  fingerprint: "a".repeat(64),
};
const snapshot: SourceSnapshot = {
  ...scope,
  sourceId,
  revision: 1,
  observedAt: "2026-09-10T08:00:00Z",
  coverage: "public-page",
  facts: [fact],
};
const dependency: OutputDependency = {
  ...scope,
  sourceId,
  key: fact.key,
  fingerprint: fact.fingerprint,
  productId: fact.productId,
  variantId: fact.variantId,
  market: fact.market,
  currency: fact.currency,
  critical: true,
};
const input = {
  scope,
  dependencies: [dependency],
  snapshots: [snapshot],
  unavailableSourceIds: [],
  now: "2026-09-10T08:05:00Z",
  useAt: "2026-09-10T08:15:00Z",
  maxAgeMs: 3600000,
};

describe("bounded source change comparison", () => {
  it("retains unchanged facts while identifying only the changed and added keys", () => {
    const current: SourceSnapshot = {
      ...snapshot,
      revision: 2,
      facts: [
        { ...fact, value: "125", fingerprint: "b".repeat(64) },
        { ...fact, key: "two", productId: "two" },
      ],
    };
    expect(compareSourceSnapshots(snapshot, current).map((c) => [c.key, c.kind])).toEqual([
      [fact.key, "changed"],
      ["two", "added"],
    ]);
    expect(compareSourceSnapshots(snapshot, { ...snapshot, revision: 2 })).toEqual([]);
  });
  it.each(["public-page", "catalog-partial"] as const)(
    "missing facts in %s coverage are unknown, not deleted",
    (coverage) => {
      expect(
        compareSourceSnapshots(snapshot, { ...snapshot, revision: 2, coverage, facts: [] })[0].kind,
      ).toBe("unobserved");
    },
  );
  it("only two complete catalog enumerations establish removal", () => {
    const complete: SourceSnapshot = { ...snapshot, coverage: "catalog-complete" };
    expect(compareSourceSnapshots(complete, { ...complete, revision: 2, facts: [] })[0].kind).toBe(
      "removed",
    );
    expect(compareSourceSnapshots(snapshot, { ...complete, revision: 2, facts: [] })[0].kind).toBe(
      "unobserved",
    );
  });
  it("rejects scope mixing, reordered observations, and duplicate keys", () => {
    expect(() =>
      compareSourceSnapshots(snapshot, { ...snapshot, projectId: "other", revision: 2 }),
    ).toThrow();
    expect(() => compareSourceSnapshots(snapshot, snapshot)).toThrow();
    expect(() =>
      compareSourceSnapshots(snapshot, {
        ...snapshot,
        revision: 2,
        observedAt: "2026-09-09T08:00:00Z",
      }),
    ).toThrow();
    expect(() => compareSourceSnapshots(undefined, { ...snapshot, facts: [fact, fact] })).toThrow();
  });
});

describe("exact output source dependencies", () => {
  it("keeps a fresh unchanged dependency usable despite unrelated source changes", () => {
    expect(
      checkOutputDependencies({
        ...input,
        snapshots: [
          {
            ...snapshot,
            revision: 2,
            facts: [fact, { ...fact, key: "unrelated", fingerprint: "b".repeat(64) }],
          },
        ],
      }),
    ).toEqual([]);
  });
  it("holds a changed Wednesday price for Thursday without rewriting the article", () => {
    expect(
      checkOutputDependencies({
        ...input,
        snapshots: [
          { ...snapshot, facts: [{ ...fact, value: "125", fingerprint: "b".repeat(64) }] },
        ],
      }),
    ).toMatchObject([{ key: fact.key, reason: "changed", critical: true }]);
  });
  it.each(["variantId", "market", "currency"] as const)(
    "does not accept another %s even with a matching supplied hash",
    (key) => {
      expect(
        checkOutputDependencies({
          ...input,
          snapshots: [
            { ...snapshot, facts: [{ ...fact, [key]: key === "currency" ? "USD" : "other" }] },
          ],
        })[0].reason,
      ).toBe("identity-conflict");
    },
  );
  it("evaluates offer expiry at publication time including the exact boundary", () => {
    expect(
      checkOutputDependencies({
        ...input,
        snapshots: [{ ...snapshot, facts: [{ ...fact, validUntil: input.useAt }] }],
      })[0].reason,
    ).toBe("expired");
  });
  it("does not treat a failed fetch as a fresh observation or deletion", () => {
    expect(checkOutputDependencies({ ...input, unavailableSourceIds: [sourceId] })[0].reason).toBe(
      "unavailable",
    );
    expect(snapshot.facts).toEqual([fact]);
    expect(checkOutputDependencies({ ...input, snapshots: [] })[0].reason).toBe("unavailable");
  });
  it("holds stale and future observations; a fresh check today does not cover distant publication", () => {
    expect(checkOutputDependencies({ ...input, useAt: "2026-09-11T08:15:00Z" })[0].reason).toBe(
      "stale",
    );
    expect(
      checkOutputDependencies({
        ...input,
        snapshots: [{ ...snapshot, observedAt: "2026-09-11T08:00:00Z" }],
      })[0].reason,
    ).toBe("stale");
  });
  it("fails closed for cross-project or duplicate source state and unbounded freshness", () => {
    expect(() =>
      checkOutputDependencies({ ...input, snapshots: [{ ...snapshot, projectId: "other" }] }),
    ).toThrow();
    expect(() =>
      checkOutputDependencies({ ...input, dependencies: [{ ...dependency, projectId: "other" }] }),
    ).toThrow();
    expect(() => checkOutputDependencies({ ...input, snapshots: [snapshot, snapshot] })).toThrow();
    expect(() => checkOutputDependencies({ ...input, maxAgeMs: Infinity })).toThrow();
  });
});
