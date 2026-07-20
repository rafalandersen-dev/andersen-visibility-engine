/**
 * P0.1 — the honest read-state for the On-page Review.
 *
 * The bug this pins: a CSR/JS site returns HTTP 200 with an empty shell, so the
 * old `fetchedWebsite: site.ok` was TRUE for a site we never actually read — and
 * the UI then showed confident "measured" scores. A failed OR partial (empty
 * shell) fetch must resolve to read=false so the UI shows indicative scores, not
 * a measurement. Verified conceptually against the Synergy Massage case (a known
 * CSR SPA with no SSR): 200 OK, but ~no readable server-side text.
 */
import { describe, it, expect } from "vitest";
import { auditSiteReadState, MIN_AUDIT_CONTENT_CHARS } from "./ai.functions";

const text = (n: number) => "a".repeat(n);

describe("auditSiteReadState", () => {
  it("reads a real SSR site with enough visible text", () => {
    const r = auditSiteReadState({ ok: true, text: text(MIN_AUDIT_CONTENT_CHARS) });
    expect(r.read).toBe(true);
    expect(r.note).toBe("");
  });

  it("treats a 200-OK empty-shell SPA as NOT read (the Synergy case)", () => {
    // HTTP ok, but the JS app renders in the browser so server-side text is ~empty.
    const r = auditSiteReadState({ ok: true, text: "" });
    expect(r.read).toBe(false);
    expect(r.note).toMatch(/JavaScript app|readable/i);
  });

  it("treats whitespace-only content as NOT read", () => {
    const r = auditSiteReadState({ ok: true, text: "   \n  \t " });
    expect(r.read).toBe(false);
  });

  it("treats an unreachable site as NOT read, with a distinct note", () => {
    const r = auditSiteReadState({ ok: false, text: "" });
    expect(r.read).toBe(false);
    expect(r.note).toMatch(/couldn't reach/i);
  });

  it("is exact at the content-length boundary", () => {
    expect(auditSiteReadState({ ok: true, text: text(MIN_AUDIT_CONTENT_CHARS) }).read).toBe(true);
    expect(auditSiteReadState({ ok: true, text: text(MIN_AUDIT_CONTENT_CHARS - 1) }).read).toBe(
      false,
    );
  });

  it("never returns read=true without ok", () => {
    expect(auditSiteReadState({ ok: false, text: text(5000) }).read).toBe(false);
  });
});
