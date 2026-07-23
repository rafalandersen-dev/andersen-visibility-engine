/**
 * draftPayloadFor — the ONE draft-payload builder shared by the manual
 * publish-live flow and the scheduled runner (the live instruction carries no
 * body, so this payload is the only thing that ever transmits content). Pinned
 * after the "Re-publish live reported success but wrote nothing" incident: a
 * re-publish must carry the CURRENT assembled body, keyed to the same identity
 * the receiving endpoint upserts on.
 */
import { describe, it, expect } from "vitest";
import { draftPayloadFor } from "./publish.functions";
import { assembleContentAsset } from "./content-assembler";
import type { ContentAsset, Project } from "./types";

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "N",
    businessName: "Biz",
    websiteUrl: "https://synergymassage.se",
    defaultDestinationType: "blogPost",
    ...over,
  }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "nekg26q0",
    projectId: "p1",
    title: "Red Light Therapy vs. Sauna",
    slug: "red-light-therapy-vs-sauna",
    status: "Approved",
    markdown: "## Body\n\nText with a [link](/signature).",
    tldr: "Short summary.",
    ...over,
  }) as ContentAsset;

describe("draftPayloadFor", () => {
  it("carries the CURRENT canonical assembled body, not the raw stored markdown", () => {
    const a = asset();
    const p = project();
    const payload = draftPayloadFor(a, p);
    expect(payload.markdown).toBe(assembleContentAsset(a, p).markdown);
    // The assembled body includes composed sections (TL;DR here) — proof this is
    // the assembler output, not a stale copy or the bare body.
    expect(payload.markdown).toContain("TL;DR");
  });

  it("keys the payload to the identity the receiver upserts on (assetId + slug)", () => {
    const payload = draftPayloadFor(asset({ publishSlug: "custom-live-slug" }), project());
    expect(payload.assetId).toBe("nekg26q0");
    expect(payload.slug).toBe("custom-live-slug"); // publishSlug wins over slug
  });

  it("preserves the destination the page was originally filed under", () => {
    // Red Light was stored with destination_type 'faq' (renders at /guides/*);
    // a re-publish must keep addressing that page, not drift to the default.
    expect(
      draftPayloadFor(asset({ publishDestinationType: "faq" }), project()).destinationType,
    ).toBe("faq");
    expect(draftPayloadFor(asset(), project()).destinationType).toBe("blogPost"); // fallback chain
  });
});
