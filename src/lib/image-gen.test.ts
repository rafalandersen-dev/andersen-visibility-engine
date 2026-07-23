/**
 * Image generation v1 — prompt/alt purity + provider seam parsing.
 * The provider response is untrusted input: bytes must round-trip the data-URL
 * parse and the caller re-validates with the upload path's magic-byte check.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildImagePrompt, draftAltText } from "./image-gen";
import { activeImageProvider, generateImageBytes, ImageGenError } from "./image-gen.server";

const project = {
  businessName: "Synergy Massage",
  businessType: "Recovery studio",
  toneOfVoice: "calm, premium",
};

describe("buildImagePrompt", () => {
  it("is deterministic, brand-toned and forbids text-in-image", () => {
    const p = buildImagePrompt({ concept: "a quiet massage room", articleTitle: "Guide", project });
    expect(p).toContain("a quiet massage room");
    expect(p).toContain("Synergy Massage — Recovery studio");
    expect(p).toContain("calm, premium");
    expect(p).toContain("No text, no words");
    expect(
      buildImagePrompt({ concept: "a quiet massage room", articleTitle: "Guide", project }),
    ).toBe(p);
  });

  it("omits empty brand fields cleanly", () => {
    const p = buildImagePrompt({
      concept: "x y z",
      project: { businessName: "", businessType: "", toneOfVoice: "" },
    });
    expect(p).not.toContain("Business:");
    expect(p).not.toContain("Visual mood:");
  });
});

describe("draftAltText", () => {
  it("brands and caps without mid-word cuts", () => {
    expect(draftAltText("a therapist preparing a room", "Synergy Massage")).toBe(
      "a therapist preparing a room at Synergy Massage",
    );
    const long = draftAltText("word ".repeat(60), "Synergy Massage");
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith("word") || long.endsWith("word ")).toBe(true);
  });
});

describe("provider seam", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("defaults to lovable; env flips to openai", () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "");
    expect(activeImageProvider()).toBe("lovable");
    vi.stubEnv("IMAGE_GEN_PROVIDER", "openai");
    expect(activeImageProvider()).toBe("openai");
  });

  it("lovable branch parses the gateway data-URL image into bytes", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                { message: { images: [{ image_url: { url: `data:image/png;base64,${png}` } }] } },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const bytes = await generateImageBytes("prompt");
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain("ai.gateway.lovable.dev");
    const sent = JSON.parse((call[1] as RequestInit).body as string);
    expect(sent.modalities).toEqual(["image", "text"]);
  });

  it("maps out-of-credits and empty-image responses to friendly errors", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 402 })),
    );
    await expect(generateImageBytes("p")).rejects.toThrow(/out of credits/);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }),
      ),
    );
    await expect(generateImageBytes("p")).rejects.toThrow(ImageGenError);
  });

  it("refuses to run unconfigured (no key) instead of calling out", async () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "");
    vi.stubEnv("LOVABLE_API_KEY", "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(generateImageBytes("p")).rejects.toThrow(/not configured/);
    expect(spy).not.toHaveBeenCalled();
  });
});
