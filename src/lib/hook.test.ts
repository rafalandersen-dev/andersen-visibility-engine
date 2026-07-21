/**
 * Hook model & workflow (Article Studio 3.0 / P1.2A).
 *
 * Proves the deterministic, conservative validation (evidence-gated blockers vs
 * warnings), the generated → user-edited → approved lifecycle with provenance and
 * approval kept separate, regeneration survival, and the legacy-only duplicate
 * report. Content is never labelled "fabricated".
 */
import { describe, it, expect } from "vitest";
import {
  HOOK_TYPES,
  composeHookMarkdown,
  validateHook,
  hookPublishGate,
  detectPossibleHookDuplicate,
  newHookFromProposal,
  applyHookEdit,
  approveHook,
  reconcileHookOnRegeneration,
} from "./hook";
import type { ArticleHook, ContentAsset, HookProposal } from "./types";

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Deep tissue massage benefits",
    slug: "deep-tissue",
    markdown: "Deep tissue massage helps recovery and reduces muscle tension for athletes.",
    ...over,
  }) as ContentAsset;

const hook = (over: Partial<ArticleHook> = {}): ArticleHook =>
  ({
    id: "h1",
    text: "Sore muscles slowing you down?",
    type: "question",
    provenance: "generated",
    approval: "draft",
    ...over,
  }) as ArticleHook;

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("model + composition", () => {
  it("exposes exactly the seven supported hook types", () => {
    expect([...HOOK_TYPES]).toEqual([
      "question",
      "problem-to-solution",
      "surprising-fact",
      "contrarian",
      "story",
      "result",
      "promise",
    ]);
  });
  it("composeHookMarkdown trims text, and is empty for a missing/blank hook", () => {
    expect(composeHookMarkdown(hook({ text: "  Lead line.  " }))).toBe("Lead line.");
    expect(composeHookMarkdown(undefined)).toBe("");
    expect(composeHookMarkdown(hook({ text: "   " }))).toBe("");
  });
});

describe("validation — blockers (conservative, evidence-gated)", () => {
  it("evidence-backed statistic passes (T11)", () => {
    const a = asset({
      hook: hook({ text: "Studies show a 40% faster recovery." }),
      sources: [{ url: "https://example.com/study", status: "verified" }] as never,
    });
    expect(codes(validateHook(a).blockers)).not.toContain("unsupported-statistic");
  });
  it("unsupported statistic blocks (T12)", () => {
    const a = asset({ hook: hook({ text: "Studies show a 40% faster recovery." }) });
    expect(codes(validateHook(a).blockers)).toContain("unsupported-statistic");
  });
  it("hook.evidence also counts as support", () => {
    const a = asset({
      hook: hook({ text: "Recovery improves 2x.", evidence: [{ url: "https://ex.com/e" }] }),
    });
    expect(codes(validateHook(a).blockers)).not.toContain("unsupported-statistic");
  });
  it("an explicit guarantee blocks regardless of evidence (T13)", () => {
    const a = asset({
      hook: hook({ text: "We guarantee you'll rank #1 in a week." }),
      sources: [{ url: "https://ex.com/x", status: "verified" }] as never,
    });
    expect(codes(validateHook(a).blockers)).toContain("explicit-guarantee");
  });
  it("hook TYPE 'promise' with benign text does NOT trigger the guarantee blocker", () => {
    const a = asset({
      hook: hook({ type: "promise", text: "Here is a calmer way to recover after training." }),
    });
    expect(codes(validateHook(a).blockers)).not.toContain("explicit-guarantee");
  });
  it("unsupported YMYL claim blocks", () => {
    const a = asset({ hook: hook({ text: "This massage cures chronic back pain." }) });
    expect(codes(validateHook(a).blockers)).toContain("ymyl-unsupported");
  });
  it("testimonial-as-fact without evidence blocks; with evidence it does not (T14)", () => {
    const strong = "Our clients achieved 30 fewer sick days, said one manager.";
    const noEvidence = asset({ hook: hook({ text: strong }) });
    expect(codes(validateHook(noEvidence).blockers)).toContain("unsupported-testimonial");
    const withEvidence = asset({
      hook: hook({ text: strong, evidence: [{ url: "https://ex.com/case" }] }),
    });
    expect(codes(validateHook(withEvidence).blockers)).not.toContain("unsupported-testimonial");
  });
  it("never labels content 'fabricated'", () => {
    const a = asset({ hook: hook({ text: "We guarantee a 200% boost." }) });
    const all = [...validateHook(a).blockers, ...validateHook(a).warnings];
    for (const f of all) expect(f.message.toLowerCase()).not.toContain("fabricat");
  });
});

describe("validation — warnings (T14 weak / T15 / T16 / T17)", () => {
  it("weak testimonial-like phrasing warns (not blocks) (T14)", () => {
    const a = asset({ hook: hook({ text: "Customers love our calm studio." }) });
    expect(codes(validateHook(a).warnings)).toContain("testimonial-like");
    expect(codes(validateHook(a).blockers)).not.toContain("unsupported-testimonial");
  });
  it("title repetition warns (T15)", () => {
    const a = asset({ hook: hook({ text: "Deep tissue massage benefits" }) });
    expect(codes(validateHook(a).warnings)).toContain("title-repetition");
  });
  it("off-topic hook warns weak-relevance (T16)", () => {
    const a = asset({ hook: hook({ text: "Bicycle chains require regular lubrication." }) });
    expect(codes(validateHook(a).warnings)).toContain("weak-relevance");
  });
  it("excessive length warns (T17)", () => {
    const long = "This is a very long opening hook that keeps going ".repeat(8);
    const a = asset({ hook: hook({ text: long }) });
    expect(codes(validateHook(a).warnings)).toContain("excessive-length");
  });
  it("generic filler warns", () => {
    const a = asset({ hook: hook({ text: "In today's world, massage matters for recovery." }) });
    expect(codes(validateHook(a).warnings)).toContain("generic-filler");
  });
  it("no hook → no findings", () => {
    expect(validateHook(asset())).toEqual({ warnings: [], blockers: [] });
  });
});

describe("lifecycle — provenance and approval are separate", () => {
  const proposal: HookProposal = {
    text: "Sore after training?",
    type: "question",
    purpose: "empathy",
  };

  it("selecting a proposal is generated/draft (T6)", () => {
    const h = newHookFromProposal(proposal, "h9");
    expect(h.provenance).toBe("generated");
    expect(h.approval).toBe("draft");
    expect(h.id).toBe("h9");
    expect(h.text).toBe("Sore after training?");
    expect(h.purpose).toBe("empathy");
  });
  it("editing changes provenance to user-edited and re-drafts (T7, T8)", () => {
    const approved = approveHook(newHookFromProposal(proposal, "h9"));
    expect(approved.approval).toBe("approved");
    const edited = applyHookEdit(approved, { text: "New angle on recovery." });
    expect(edited.provenance).toBe("user-edited");
    expect(edited.approval).toBe("draft"); // approval is never carried past an edit
  });
  it("approval is always explicit and leaves provenance intact (T8)", () => {
    const gen = newHookFromProposal(proposal, "h9");
    expect(gen.approval).toBe("draft"); // never auto-approved
    const ok = approveHook(gen);
    expect(ok.approval).toBe("approved");
    expect(ok.provenance).toBe("generated"); // a generated hook stays generated when approved
    // cannot approve an empty hook
    expect(approveHook({ ...gen, text: "" }).approval).toBe("draft");
  });
  it("approved / user-edited hooks survive regeneration (T9)", () => {
    const approved = approveHook(newHookFromProposal(proposal, "h9"));
    const fresh: HookProposal = { text: "A different generated hook.", type: "story" };
    expect(reconcileHookOnRegeneration(approved, fresh, "h10")).toBe(approved);
    const edited = applyHookEdit(newHookFromProposal(proposal, "h9"), { text: "Human words." });
    expect(reconcileHookOnRegeneration(edited, fresh, "h10")).toBe(edited);
  });
  it("an empty / absent hook may be replaced during regeneration (T10)", () => {
    const fresh: HookProposal = { text: "A brand new hook.", type: "surprising-fact" };
    expect(reconcileHookOnRegeneration(undefined, fresh, "h10")?.text).toBe("A brand new hook.");
    const emptyGen: ArticleHook = {
      id: "h9",
      text: "",
      type: "question",
      provenance: "generated",
      approval: "draft",
    };
    expect(reconcileHookOnRegeneration(emptyGen, fresh, "h10")?.text).toBe("A brand new hook.");
  });
});

describe("publish gate", () => {
  it("legacy asset never gates on the hook", () => {
    expect(hookPublishGate(asset()).applies).toBe(false);
    expect(hookPublishGate(asset({ hook: hook() })).applies).toBe(false);
  });
  it("v3 no hook → missing", () => {
    const g = hookPublishGate(asset({ visualModelVersion: 3 }));
    expect(g).toMatchObject({ applies: true, missing: true, unapproved: false, blocked: false });
  });
  it("v3 draft hook → unapproved", () => {
    const g = hookPublishGate(asset({ visualModelVersion: 3, hook: hook() }));
    expect(g).toMatchObject({ applies: true, missing: false, unapproved: true });
  });
  it("v3 approved clean hook → all clear", () => {
    const g = hookPublishGate(
      asset({ visualModelVersion: 3, hook: hook({ approval: "approved" }) }),
    );
    expect(g).toMatchObject({ applies: true, missing: false, unapproved: false, blocked: false });
  });
  it("v3 approved hook with an unsupported claim → blocked", () => {
    const g = hookPublishGate(
      asset({
        visualModelVersion: 3,
        hook: hook({ approval: "approved", text: "We saw a 90% boost." }),
      }),
    );
    expect(g.blocked).toBe(true);
    expect(g.blockers.length).toBeGreaterThan(0);
  });
});

describe("legacy-upgrade duplicate detection (report only, no mutation)", () => {
  it("reports an exact first-paragraph duplicate", () => {
    const a = asset({
      markdown: "Sore muscles slowing you down?\n\nBody continues here.",
      hook: hook({ text: "Sore muscles slowing you down?" }),
    });
    expect(detectPossibleHookDuplicate(a)).toEqual({ duplicate: true, confidence: "exact" });
  });
  it("does not fuzzily match a merely similar opening", () => {
    const a = asset({
      markdown: "Are your sore muscles slowing you down today?\n\nBody.",
      hook: hook({ text: "Sore muscles slowing you down?" }),
    });
    expect(detectPossibleHookDuplicate(a)).toEqual({ duplicate: false, confidence: "none" });
  });
  it("no hook → no duplicate", () => {
    expect(detectPossibleHookDuplicate(asset())).toEqual({ duplicate: false, confidence: "none" });
  });
});
