/**
 * Stable section identity + reconciliation (Article Studio 3.0 / P1.2C).
 *
 * The safety property under test: a persisted section id re-maps onto an edited body
 * deterministically, survives heading renames / content edits / moves / safe
 * regeneration, and FAILS SAFE (ambiguous/missing) rather than jumping to a wrong or
 * duplicate-heading section. Identity is never heading-text alone.
 */
import { describe, it, expect } from "vitest";
import {
  parseSections,
  reconcileSectionIndex,
  matchSections,
  resolveSectionPositions,
} from "./section-index";
import type { SectionRef } from "./types";

const freshAlloc = () => {
  let c = 0;
  return () => `sec_${(c++).toString().padStart(4, "0")}`;
};
const index = (body: string): SectionRef[] => reconcileSectionIndex(undefined, body, freshAlloc());
const idOf = (idx: SectionRef[], heading: string) => idx.find((s) => s.heading === heading)?.id;

describe("parseSections", () => {
  it("ignores headings inside fenced code blocks (test 3)", () => {
    const md = "## Real\n\ntext\n\n```\n## Not a heading\n```\n\n## Also real";
    const { sections } = parseSections(md);
    expect(sections.map((s) => s.heading)).toEqual(["Real", "Also real"]);
  });
  it("computes the subtree end past nested subsections (for after-section, test 4)", () => {
    const md = "## Parent\n\np\n\n### Child\n\nc\n\n## Next";
    const { sections } = parseSections(md);
    const parent = sections.find((s) => s.heading === "Parent")!;
    const next = sections.find((s) => s.heading === "Next")!;
    // Parent's subtree ends at the "## Next" heading (it includes the ### Child).
    expect(parent.subtreeEndLineIdx).toBe(next.headingLineIdx);
  });
});

describe("identity survives ordinary edits", () => {
  it("survives a heading rename (content fingerprint carries it)", () => {
    const body = "## Deep tissue\n\nHelps athletes recover from tension quickly.";
    const idx = index(body);
    const renamed = "## Sports massage\n\nHelps athletes recover from tension quickly.";
    const next = reconcileSectionIndex(idx, renamed, freshAlloc());
    expect(next[0].id).toBe(idx[0].id); // same id, new heading
    expect(next[0].heading).toBe("Sports massage");
  });
  it("survives a content edit (heading carries it)", () => {
    const body = "## Pricing\n\nOur sessions start at a fair price.";
    const idx = index(body);
    const edited = "## Pricing\n\nSessions are competitively priced with packages.";
    const next = reconcileSectionIndex(idx, edited, freshAlloc());
    expect(next[0].id).toBe(idx[0].id);
  });
  it("survives a section move (order is only a weak signal)", () => {
    const body = "## Alpha\n\naaa apples\n\n## Beta\n\nbbb bananas";
    const idx = index(body);
    const moved = "## Beta\n\nbbb bananas\n\n## Alpha\n\naaa apples";
    const next = reconcileSectionIndex(idx, moved, freshAlloc());
    expect(idOf(next, "Alpha")).toBe(idOf(idx, "Alpha"));
    expect(idOf(next, "Beta")).toBe(idOf(idx, "Beta"));
  });
  it("survives safe regeneration (heading + wording change, same topic)", () => {
    const body =
      "## Recovery benefits\n\nDeep tissue massage improves athlete recovery and reduces muscle tension.";
    const idx = index(body);
    const regen =
      "## Benefits for recovery\n\nDeep tissue massage boosts athlete recovery while reducing muscle tension greatly.";
    const next = reconcileSectionIndex(idx, regen, freshAlloc());
    expect(next[0].id).toBe(idx[0].id); // excerpt similarity keeps the identity
  });
  it("a deleted section drops out (its id is missing)", () => {
    const body = "## Keep\n\nkeep this content\n\n## Drop\n\ndelete this section entirely";
    const idx = index(body);
    const after = "## Keep\n\nkeep this content";
    const matches = matchSections(idx, parseSections(after).sections);
    expect(matches.find((m) => m.ref.id === idOf(idx, "Drop"))!.status).toBe("missing");
    expect(matches.find((m) => m.ref.id === idOf(idx, "Keep"))!.status).toBe("resolved");
  });
});

describe("duplicate & renamed headings fail safe", () => {
  it("two identical headings get distinct ids and never swap (test 1)", () => {
    const body =
      "## FAQ\n\nHow long is a session? About an hour.\n\n## FAQ\n\nDo you offer packages? Yes we do.";
    const idx = index(body);
    expect(idx).toHaveLength(2);
    expect(idx[0].id).not.toBe(idx[1].id);
    // Reorder the two FAQ blocks — each id must stay with ITS content, not jump.
    const swapped =
      "## FAQ\n\nDo you offer packages? Yes we do.\n\n## FAQ\n\nHow long is a session? About an hour.";
    const matches = matchSections(idx, parseSections(swapped).sections);
    const first = matches.find((m) => m.ref.id === idx[0].id)!;
    // idx[0] was "How long…"; after swap that content is the 2nd parsed section.
    expect(first.status).toBe("resolved");
    expect(first.section!.order).toBe(1);
  });

  it("a heading renamed onto a duplicate with indistinguishable content is AMBIGUOUS, not wrongly attached (test 2)", () => {
    const body =
      "## Section A\n\nshared identical body text here\n\n## Section B\n\nshared identical body text here";
    const idx = index(body);
    // Rename A → "Section B": now two "## Section B" with identical content.
    const renamed =
      "## Section B\n\nshared identical body text here\n\n## Section B\n\nshared identical body text here";
    const matches = matchSections(idx, parseSections(renamed).sections);
    // Both prior ids now see two equally-scoring candidates → ambiguous (never a guess).
    expect(matches.every((m) => m.status === "ambiguous")).toBe(true);
  });
});

describe("merge / split require manual resolution", () => {
  it("a merge where both prior sections plausibly continue is ambiguous for both (test 5)", () => {
    const body =
      "## One\n\nidentical merged body content\n\n## Two\n\nidentical merged body content";
    const idx = index(body);
    // Merge into a single section carrying that same content.
    const merged = "## Combined\n\nidentical merged body content";
    const matches = matchSections(idx, parseSections(merged).sections);
    expect(matches.every((m) => m.status === "ambiguous")).toBe(true);
  });
  it("a split keeps the original id on the clear match and mints a new id for the other (test 6)", () => {
    // One continuing allocator across both reconciles (production uses crypto.randomUUID,
    // which never collides; a per-call counter would reuse "sec_0000").
    const alloc = freshAlloc();
    const body = "## Guide\n\nplanting seeds and watering routines for a healthy garden";
    const idx = reconcileSectionIndex(undefined, body, alloc);
    const splitBody =
      "## Guide\n\nplanting seeds and watering routines for a healthy garden\n\n## Extra tips\n\ncompletely different pruning advice for shrubs";
    const next = reconcileSectionIndex(idx, splitBody, alloc);
    expect(idOf(next, "Guide")).toBe(idOf(idx, "Guide")); // original id stays with the clear match
    expect(idOf(next, "Extra tips")).not.toBe(idOf(idx, "Guide")); // the new part gets a new id
    expect(idOf(next, "Extra tips")).toBeTruthy();
  });
});

describe("determinism & idempotence", () => {
  it("is deterministic — identical inputs give identical output", () => {
    const body = "## A\n\naaa\n\n## B\n\nbbb";
    const a = reconcileSectionIndex(undefined, body, freshAlloc());
    const b = reconcileSectionIndex(undefined, body, freshAlloc());
    expect(a).toEqual(b);
  });
  it("re-reconciling an unchanged body keeps every id (repeated Save adds nothing — test 12)", () => {
    const body = "## A\n\naaa apples\n\n## B\n\nbbb bananas";
    const idx = index(body);
    const again = reconcileSectionIndex(idx, body, freshAlloc());
    expect(again.map((s) => s.id)).toEqual(idx.map((s) => s.id));
  });
  it("empty-immediate-content sections don't cross-match — a valid id survives an unrelated delete (review #1)", () => {
    // Alpha & Beta have EMPTY immediate content (heading immediately followed by a
    // subheading) — a common shape. Before the fix they shared the FNV basis and
    // cross-matched, churning Beta's id when Alpha was deleted.
    const body = "## Alpha\n\n### A1\n\nalpha sub\n\n## Beta\n\n### B1\n\nbeta sub";
    const idx = index(body);
    const betaId = idOf(idx, "Beta");
    const after = "## Beta\n\n### B1\n\nbeta sub"; // Alpha (unrelated) deleted
    const beta = matchSections(idx, parseSections(after).sections).find(
      (m) => m.ref.id === betaId,
    )!;
    expect(beta.status).toBe("resolved"); // matched on heading, not the shared empty hash
    expect(beta.section!.heading).toBe("Beta");
  });

  it("folds diacritics so a localized heading is stable identity (å/ø/ę)", () => {
    const body = "## Vanliga frågor\n\nsvar här om produkten";
    const idx = index(body);
    const renamed = "## Vanliga Frågor\n\nsvar här om produkten"; // case only
    const next = reconcileSectionIndex(idx, renamed, freshAlloc());
    expect(next[0].id).toBe(idx[0].id);
  });

  it("resolveSectionPositions maps a persisted id to its current section", () => {
    const body = "## A\n\naaa apples\n\n## B\n\nbbb bananas";
    const idx = index(body);
    const pos = resolveSectionPositions(idx, parseSections(body).sections);
    expect(pos.get(idx[0].id)!.status).toBe("resolved");
    expect(pos.get(idx[0].id)!.section!.heading).toBe("A");
  });
});
