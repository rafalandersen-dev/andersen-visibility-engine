/**
 * BM — bounded localization of the known quality/Improve refusals: the map is pinned against the REAL server
 * modules (every authored sentence they can surface maps to a key whose English copy is that exact sentence),
 * unknown text is left alone, the usage-limit template carries its variables, producer outcomes keep
 * precedence, and every key has copy in the four active languages.
 */
import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translate";
import { UI_CATALOGS } from "@/i18n/catalogs";
import { aiRefusalKey, aiRefusalMessage, aiRefusalText } from "./ai-refusal-messages";
import { AiTextBoundaryError } from "./ai-text-bounds.server";
import { aiErrorUserMessage, type AiErrorClass } from "./ai-error-diagnostics.server";
import { AiExpenseUnavailableError } from "./ai-expense.server";
import { AiProviderConfigurationError } from "./ai-provider.server";
import { UsageLimitError, UsageUnavailableError } from "./ai-usage.server";

const en = (k: string, vars?: Record<string, string | number>) => translate("en", k, vars);
const pl = (k: string, vars?: Record<string, string | number>) => translate("pl", k, vars);

describe("exact authored sentences from the real server modules map to keys whose English copy is the same sentence", () => {
  it.each([
    "input_too_large",
    "invalid_limits",
    "timeout",
    "invalid_response",
    "incomplete_output",
  ] as const)("AiTextBoundaryError %s", (reason) => {
    const e = new AiTextBoundaryError(reason);
    const key = aiRefusalKey(e.message);
    expect(key).toMatch(/^quality\.refusal\./);
    expect(en(key!)).toBe(e.message);
    expect(aiRefusalMessage(new Error(e.message), pl)).not.toBe(e.message);
  });
  it.each([
    "rate_limit",
    "quota_billing",
    "auth_rejected",
    "model_unavailable",
    "bad_request",
    "response_format",
    "provider_server_error",
    "network",
    "timeout",
    "malformed_credential",
    "unknown",
  ] as AiErrorClass[])("gateway class %s", (cls) => {
    const message = aiErrorUserMessage(cls);
    const key = aiRefusalKey(message);
    expect(key).toMatch(/^quality\.refusal\./);
    expect(en(key!)).toBe(message);
  });
  it.each(["provider_timeout", "unpriced_provider", "manual_budget_required", "other"])(
    "AiExpenseUnavailableError %s",
    (reason) => {
      const e = new AiExpenseUnavailableError(reason);
      expect(en(aiRefusalKey(e.message)!)).toBe(e.message);
    },
  );
  it("provider configuration and usage-unavailable errors", () => {
    for (const e of [new AiProviderConfigurationError(), new UsageUnavailableError("miloScore")])
      expect(en(aiRefusalKey(e.message)!)).toBe(e.message);
  });
  it("the usage-limit template carries count and bucket; other buckets stay as received", () => {
    const e = new UsageLimitError(
      "improveDraft",
      20,
      20,
      "You have used all 20 draft improvements on your plan this month. They reset on the 1st — or upgrade for more.",
    );
    expect(aiRefusalKey(e.message)).toBe("quality.refusal.usageLimit");
    expect(aiRefusalText(e.message, en)).toBe(e.message);
    expect(aiRefusalText(e.message, pl)).toContain("20");
    expect(aiRefusalText(e.message, pl)).toContain(pl("quality.refusal.bucket.improveDraft"));
    expect(
      aiRefusalKey(
        "You have used all 5 site audits on your plan this month. They reset on the 1st — or upgrade for more.",
      ),
    ).toBeNull();
  });
  it.each([1, 2, 5, 20])(
    "BN: the Polish limit sentence is grammatical for any count (%i) with both buckets, through the real mapper",
    (count) => {
      for (const [label, key] of [
        ["draft improvements", "quality.refusal.bucket.improveDraft"],
        ["Milo Score runs", "quality.refusal.bucket.miloScore"],
      ] as const) {
        const e = new UsageLimitError(
          key === "quality.refusal.bucket.improveDraft" ? "improveDraft" : "miloScore",
          count,
          count,
          `You have used all ${count} ${label} on your plan this month. They reset on the 1st — or upgrade for more.`,
        );
        const text = aiRefusalText(e.message, pl)!;
        // Count-independent construction: the bucket label is a nominative heading and the count follows it,
        // so no inflection of the label is needed ("Ulepszenia szkiców: 1." reads correctly for 1, 2, 5, 20).
        expect(text).toBe(
          `Wykorzystano miesięczny limit Twojego planu. ${pl(key)}: ${count}. Limit odnawia się 1. dnia miesiąca — lub podnieś plan, aby uzyskać więcej.`,
        );
        expect(text).not.toContain("{");
        expect(text).not.toMatch(/wszystkie \d+ (ulepszenia|uruchomienia)/);
        expect(aiRefusalText(e.message, en)).toBe(e.message);
      }
    },
  );
});

describe("safety: only exact sentences match; unknown, partial or provider-shaped text is left untouched", () => {
  it.each([
    "",
    "Something else entirely",
    "There is too much source text for one AI request.", // prefix only
    "PREFIX There is too much source text for one AI request. Reduce the input and try again.",
    'AI generation failed unexpectedly. Please try again. {"provider":"raw"}',
    "Request failed with status 500: x-request-id abc",
  ])("%j", (message) => {
    expect(aiRefusalKey(message)).toBeNull();
    expect(aiRefusalText(message, en)).toBeNull();
  });
  it("non-Error values map to nothing", () => {
    expect(
      aiRefusalMessage(
        "There is too much source text for one AI request. Reduce the input and try again.",
        en,
      ),
    ).toBeNull();
    expect(aiRefusalMessage(null, en)).toBeNull();
  });
});

describe("copy contracts", () => {
  const keys = Object.keys(UI_CATALOGS.en).filter((k) => k.startsWith("quality.refusal."));
  it("24 keys, each with non-empty copy in en/pl/sv/da and the same {vars}", () => {
    expect(keys).toHaveLength(24);
    for (const key of keys)
      for (const lang of ["en", "pl", "sv", "da"] as const) {
        const value = UI_CATALOGS[lang][key];
        expect(value?.trim(), `${lang} ${key}`).toBeTruthy();
        expect([...value.matchAll(/\{[a-zA-Z]\w*\}/g)].map((m) => m[0]).sort()).toEqual(
          [...UI_CATALOGS.en[key].matchAll(/\{[a-zA-Z]\w*\}/g)].map((m) => m[0]).sort(),
        );
      }
  });
  it("the semantics are preserved: input-too-large says to reduce the input (before spend); incomplete and timeouts say Milo did not retry", () => {
    expect(en("quality.refusal.inputTooLarge")).toContain("Reduce the input");
    for (const k of ["incompleteOutput", "timeout", "expenseTimeout", "invalidResponse"])
      expect(en(`quality.refusal.${k}`)).toContain("did not retry");
    expect(en("quality.refusal.incompleteOutput")).toContain("kept the draft unchanged");
  });
});
