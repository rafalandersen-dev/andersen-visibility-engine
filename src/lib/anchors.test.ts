/**
 * Typed placement anchors (Article Studio 3.0 / P1.2C).
 * Parsing is the single trusted boundary between the serialized JSONB string and
 * the typed model; malformed anchors must be rejected, not coerced.
 */
import { describe, it, expect } from "vitest";
import { parseAnchor, serializeAnchor, anchorSectionId, isSectionId } from "./anchors";

describe("anchor parse / serialize round-trips", () => {
  it("round-trips every valid anchor", () => {
    const anchors = [
      { kind: "before-hook" },
      { kind: "after-hook" },
      { kind: "before-faq" },
      { kind: "before-cta" },
      { kind: "article-end" },
      { kind: "before-section", sectionId: "sec_abcd12" },
      { kind: "after-section", sectionId: "sec_abcd12" },
    ] as const;
    for (const a of anchors) {
      expect(parseAnchor(serializeAnchor(a))).toEqual(a);
    }
  });

  it("rejects malformed anchors (null, never coerced)", () => {
    expect(parseAnchor("")).toBeNull();
    expect(parseAnchor("nonsense")).toBeNull();
    expect(parseAnchor("before-section")).toBeNull(); // section kind without an id
    expect(parseAnchor("before-section:not-a-section-id")).toBeNull();
    expect(parseAnchor("before-hook:sec_abcd12")).toBeNull(); // simple kind with a stray colon
    expect(parseAnchor("before-section:sec_ab")).toBeNull(); // id too short
    expect(parseAnchor(42 as never)).toBeNull();
  });

  it("anchorSectionId returns the id only for section anchors", () => {
    expect(anchorSectionId({ kind: "after-section", sectionId: "sec_abcd12" })).toBe("sec_abcd12");
    expect(anchorSectionId({ kind: "article-end" })).toBeNull();
  });

  it("validates section-id shape", () => {
    expect(isSectionId("sec_abcd12")).toBe(true);
    expect(isSectionId("abc")).toBe(false);
    expect(isSectionId("sec_ab")).toBe(false);
  });
});
