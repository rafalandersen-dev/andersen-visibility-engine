import { describe, expect, it } from "vitest";
import { manualCaptureCopy } from "./manual-capture";
import { UI_LANGUAGE_CODES } from "./catalogs";
import { translate } from "./translate";
import {
  MANUAL_CAPTURE_DEVIATION_CODES,
  MANUAL_CAPTURE_METHOD,
  issueStep,
  type ManualCaptureIssue,
  type SlotState,
} from "@/lib/manual-capture-ui";

const keys = Object.keys(manualCaptureCopy.en).sort();
const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();
const copyOf = (locale: string) => manualCaptureCopy[locale as "en"] as Record<string, string>;

describe("manualCapture copy", () => {
  it("is its own namespace of the CG-03C messages", () => {
    expect(keys).toHaveLength(217);
    for (const key of keys) expect(key.startsWith("manualCapture.")).toBe(true);
  });

  it.each(UI_LANGUAGE_CODES)("%s is complete, non-empty and keeps placeholders", (locale) => {
    const copy = copyOf(locale);
    expect(Object.keys(copy).sort()).toEqual(keys);
    for (const key of keys) {
      expect(copy[key].trim(), `${locale}:${key}`).not.toBe("");
      expect(placeholders(copy[key]), `${locale}:${key}`).toEqual(placeholders(copyOf("en")[key]));
    }
  });

  it.each(["pl", "sv", "da"])("%s is authored, not copied English", (locale) => {
    expect(keys.filter((key) => copyOf(locale)[key] === copyOf("en")[key])).toEqual([]);
  });

  it.each(UI_LANGUAGE_CODES)("%s is served by the central translator", (locale) => {
    for (const key of keys) expect(translate(locale, key)).toBe(copyOf(locale)[key]);
  });

  it("never claims an unconfirmed save was not saved or that a sent request was cancelled", () => {
    const en = copyOf("en");
    for (const key of keys.filter(
      (k) => k.includes("unconfirmed") || k.startsWith("manualCapture.leave."),
    ))
      expect(en[key], key).not.toMatch(/not saved|was cancelled|has been cancelled|undone/i);
    expect(en["manualCapture.leave.sending"]).toMatch(/cannot be cancelled/);
    expect(en["manualCapture.leave.unconfirmed"]).toMatch(/does not undo/);
  });

  it("keeps the entry method out of translated copy (a fixed, non-localized literal)", () => {
    for (const locale of UI_LANGUAGE_CODES)
      for (const key of keys) expect(copyOf(locale)[key]).not.toContain(MANUAL_CAPTURE_METHOD);
    for (const locale of UI_LANGUAGE_CODES)
      expect(copyOf(locale)["manualCapture.reviewMethod"]).toContain("{method}");
  });
  it("labels every slot state, issue and known deviation code in plain language", () => {
    const states: SlotState[] = [
      "available",
      "notDue",
      "occupied",
      "erased",
      "occupancyUnknown",
      "promptMissing",
      "readsUnavailable",
    ];
    const issues = keys
      .filter((k) => k.startsWith("manualCapture.issue."))
      .map((k) => k.slice("manualCapture.issue.".length) as ManualCaptureIssue);
    for (const locale of UI_LANGUAGE_CODES) {
      const copy = copyOf(locale);
      for (const s of states)
        expect(copy[`manualCapture.slot.${s}`], `${locale}:${s}`).toBeTruthy();
      for (const code of MANUAL_CAPTURE_DEVIATION_CODES) {
        const label = copy[`manualCapture.deviation.${code}`];
        expect(label, `${locale}:${code}`).toBeTruthy();
        expect(label).not.toContain(code); // a label, not the internal code
      }
    }
    // Every issue the helper can raise has copy and a step.
    expect(issues).toEqual(
      expect.arrayContaining(["readsUnavailable", "promptMissing", "occupancyUnknown"]),
    );
    for (const i of issues) expect([1, 2, 3]).toContain(issueStep(i));
    // Question choices and the review never lead with an identifier.
    expect(copyOf("en")["manualCapture.questionOption"]).toBe("Question {n}: {text}");
    expect(copyOf("en")["manualCapture.savedRecord"]).toMatch(/^Record ID: \{id\}$/);
  });
  it("never states that an unknown or unrecorded setting actually differed", () => {
    // Codes the resolver also emits when the observed value is unknown against a planned value.
    const gapCodes = [
      "personalisation_differs",
      "signed_in_differs",
      "memory_differs",
      "custom_instructions_differ",
      "connected_tools_differ",
      "surface_or_mode_differs",
      "model_label_differs",
      "web_search_evidence_differs",
      "collection_country_differs",
      "collection_city_differs",
      "device_location_differs",
      "vpn_differs",
      "interface_language_differs",
    ];
    const en = copyOf("en");
    for (const code of gapCodes)
      expect(en[`manualCapture.deviation.${code}`], code).toMatch(/recorded details.*not recorded/);
    for (const code of MANUAL_CAPTURE_DEVIATION_CODES)
      expect(en[`manualCapture.deviation.${code}`], code).not.toMatch(/\bdiffered\b/);
    expect(en["manualCapture.noDeviations"]).toMatch(/found in the recorded details/);
  });
});
