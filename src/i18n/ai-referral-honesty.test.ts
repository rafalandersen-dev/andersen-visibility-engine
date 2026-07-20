/**
 * P0.6 — the AI-signal metric is labelled specifically as AI referral traffic,
 * is NOT represented as AI mentions or citations, and states its attribution
 * limitation. Guards the honest wording against regression, across all locales.
 */
import { describe, it, expect } from "vitest";
import { en } from "./en";
import { pl } from "./pl";
import { sv } from "./sv";
import { da } from "./da";

const dicts = { en, pl, sv, da } as const;

describe("AI referral wording (P0.6)", () => {
  it.each(Object.keys(dicts))("%s heading names it referral, not mentions/citations", (lang) => {
    const d = dicts[lang as keyof typeof dicts] as Record<string, string>;
    const heading = d["analytics.ai.heading"].toLowerCase();
    // Names referral/visits (referral in en, hänvisning/henvisning/wejście elsewhere).
    expect(/referr|hänvis|henvis|wejśc/i.test(heading)).toBe(true);
    // Must NOT frame the metric itself as mentions or citations.
    expect(/mention|citation|cytowan|wzmiank/i.test(heading)).toBe(false);
  });

  it.each(Object.keys(dicts))("%s copy disclaims mentions/citations and states a limitation", (lang) => {
    const d = dicts[lang as keyof typeof dicts] as Record<string, string>;
    const copy = d["analytics.ai.copy"];
    // Explicitly says it is NOT mentions/citations.
    expect(/not .*mention|nie .*wzmiank|inte .*omnämn|ikke .*omtal/i.test(copy)).toBe(true);
    // States the under-count / hidden-referrer limitation.
    expect(/under-?count|hide|hidden|zaniż|ukrywa|underskatt|döljer|undervurder|skjuler/i.test(copy)).toBe(
      true,
    );
  });
});
