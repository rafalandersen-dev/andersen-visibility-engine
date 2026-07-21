/**
 * Image presentation compiler (Article Studio 3.0 / P1.2D).
 *
 * The compiler is the security boundary: it must emit ONLY the allow-listed figure
 * from trusted enums, escape alt/caption, clamp focal to a numeric object-position,
 * and coerce corrupt/injected values to safe defaults so output is never unsafe.
 */
import { describe, it, expect } from "vitest";
import {
  compileFigureHtml,
  presentationMarkdown,
  normalizePresentation,
  resolveMobilePresentation,
  clampFocal,
  validatePresentation,
  presentationCapability,
  ASPECT_RATIO,
  DEFAULT_PRESENTATION,
} from "./presentation-compiler";
import type { ContentImage, ImagePresentation } from "./types";

const img = (over: Partial<ContentImage> = {}): ContentImage =>
  ({
    id: "i1",
    concept: "c",
    url: "https://site.com/a.png",
    alt: "A cat",
    placement: "inline",
    status: "accepted",
    ...over,
  }) as ContentImage;

const pres = (over: Partial<ImagePresentation> = {}): ImagePresentation => ({
  ...DEFAULT_PRESENTATION,
  ...over,
});

describe("figure compilation — allow-list & determinism", () => {
  it("emits an exact allow-listed figure with deterministic class + attribute order (test 6)", () => {
    const html = compileFigureHtml(
      img(),
      pres({
        size: "large",
        alignment: "center",
        aspectRatio: "wide",
        fit: "cover",
        visualStyle: "card",
      }),
    );
    expect(html).toBe(
      '<figure class="milo-image milo-size-large milo-align-center milo-aspect-wide milo-fit-cover milo-style-card">' +
        '<img src="https://site.com/a.png" alt="A cat" loading="lazy" /></figure>',
    );
  });

  it("adds a caption only when captionVisible !== false and caption text exists (test 12)", () => {
    const withCap = compileFigureHtml(img({ caption: "A tabby" }), pres());
    expect(withCap).toContain("<figcaption>A tabby</figcaption>");
    const hidden = compileFigureHtml(img({ caption: "A tabby" }), pres({ captionVisible: false }));
    expect(hidden).not.toContain("figcaption");
  });

  it("object-position is emitted only for fit=cover + focal, from clamped integers (test 11)", () => {
    const cover = compileFigureHtml(
      img(),
      pres({ fit: "cover", focalPoint: { x: 0.25, y: 0.75 } }),
    );
    expect(cover).toContain('style="object-position:25% 75%"');
    const contain = compileFigureHtml(
      img(),
      pres({ fit: "contain", focalPoint: { x: 0.25, y: 0.75 } }),
    );
    expect(contain).not.toContain("object-position"); // focal inactive under contain
  });

  it("repeated compile is byte-identical (test 16)", () => {
    const a = compileFigureHtml(img({ caption: "c" }), pres({ focalPoint: { x: 0.4, y: 0.6 } }));
    const b = compileFigureHtml(img({ caption: "c" }), pres({ focalPoint: { x: 0.4, y: 0.6 } }));
    expect(a).toBe(b);
  });
});

describe("safety — nothing user-authored reaches output unescaped (tests 5, 7, 8)", () => {
  it("escapes malicious alt and caption (test 7)", () => {
    const html = compileFigureHtml(
      img({ alt: '"><script>alert(1)</script>', caption: "<img onerror=x>" }),
      pres(),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=x>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img onerror=x&gt;");
  });

  it("coerces injected/out-of-enum preset values to safe defaults — no class/style injection (tests 5, 8)", () => {
    const evil = {
      size: 'large" onload="alert(1)',
      alignment: "left; }malicious{",
      aspectRatio: "<script>",
      fit: "cover)",
      visualStyle: "card style=evil",
      focalPoint: { x: 5, y: -3 }, // clamped
    } as unknown as ImagePresentation;
    const html = compileFigureHtml(img(), evil);
    // Only allow-listed classes appear; the injected strings never reach output.
    expect(html).toContain(
      'class="milo-image milo-size-large milo-align-center milo-aspect-original milo-fit-cover milo-style-plain"',
    );
    expect(html).not.toContain("onload");
    expect(html).not.toContain("malicious");
    expect(html).not.toContain("<script>");
    expect(html).toContain("object-position:100% 0%"); // {5,-3} clamped to {1,0}
  });

  it("clampFocal clamps to 0..1 and drops malformed values", () => {
    expect(clampFocal({ x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
    expect(clampFocal({ x: NaN, y: 0.5 })).toBeUndefined();
    expect(clampFocal(undefined)).toBeUndefined();
  });
});

describe("normalization, mobile inheritance, ratios", () => {
  it("normalizePresentation replaces unknown enums with defaults; `full` is rejected as alignment (test 14)", () => {
    const n = normalizePresentation({ ...pres(), alignment: "full" as never });
    expect(n.alignment).toBe(DEFAULT_PRESENTATION.alignment); // "full" is not a valid alignment
  });

  it("mobile override inherits unset base fields deterministically (test 9)", () => {
    const base = pres({ size: "large", alignment: "left", visualStyle: "card" });
    const mobile = resolveMobilePresentation(base, { size: "full" });
    expect(mobile).toMatchObject({ size: "full", alignment: "left", visualStyle: "card" }); // size overridden, rest inherited
    // deterministic
    expect(resolveMobilePresentation(base, { size: "full" })).toEqual(mobile);
  });

  it("an incomplete focal override is not applied as a partial coordinate (test 10)", () => {
    const base = pres({ focalPoint: { x: 0.3, y: 0.3 } });
    // A malformed override focal (missing y) is dropped by clampFocal → inherits base.
    const mobile = resolveMobilePresentation(base, { focalPoint: { x: 0.9 } as never });
    expect(mobile.focalPoint).toEqual({ x: 0.3, y: 0.3 });
  });

  it("aspect-ratio mapping is explicit and correct (test 13)", () => {
    expect(ASPECT_RATIO).toEqual({
      original: "auto",
      square: "1 / 1",
      portrait: "4 / 5",
      landscape: "4 / 3",
      wide: "16 / 9",
    });
  });

  it("presentationMarkdown degrades to real-URL markdown (+ caption per captionVisible)", () => {
    expect(presentationMarkdown(img({ caption: "cap" }), pres())).toBe(
      "![A cat](https://site.com/a.png)\n\n*cap*",
    );
    expect(presentationMarkdown(img({ caption: "cap" }), pres({ captionVisible: false }))).toBe(
      "![A cat](https://site.com/a.png)",
    );
  });
});

describe("validation (checklist-facing)", () => {
  it("no presentation → no findings", () => {
    expect(validatePresentation(img())).toEqual([]);
  });
  it("out-of-enum persisted preset → blocker; `full` alignment → blocker (test 14)", () => {
    const bad = validatePresentation(
      img({ presentation: { ...pres(), alignment: "full" as never } }),
    );
    expect(bad.some((f) => f.code === "invalid-preset" && f.blocking)).toBe(true);
  });
  it("focal outside 0..1 → blocker", () => {
    const bad = validatePresentation(img({ presentation: pres({ focalPoint: { x: 1.5, y: 0 } }) }));
    expect(bad.some((f) => f.code === "focal-out-of-range" && f.blocking)).toBe(true);
  });
  it("featured image must be wide/full + center — else incompatible blocker", () => {
    const left = validatePresentation(
      img({ placement: "featured", presentation: pres({ size: "full", alignment: "left" }) }),
    );
    expect(left.some((f) => f.code === "incompatible-placement" && f.blocking)).toBe(true);
    const small = validatePresentation(
      img({ placement: "featured", presentation: pres({ size: "small", alignment: "center" }) }),
    );
    expect(small.some((f) => f.code === "incompatible-placement" && f.blocking)).toBe(true);
    const ok = validatePresentation(
      img({ placement: "featured", presentation: pres({ size: "full", alignment: "center" }) }),
    );
    expect(ok.filter((f) => f.blocking)).toEqual([]);
  });
  it("focal under fit=contain → non-blocking advisory (test 11)", () => {
    const findings = validatePresentation(
      img({ presentation: pres({ fit: "contain", focalPoint: { x: 0.5, y: 0.5 } }) }),
    );
    expect(findings.some((f) => f.code === "focal-inactive-contain" && !f.blocking)).toBe(true);
    expect(findings.some((f) => f.blocking)).toBe(false);
  });
});

describe("connector capability (four-state honesty, tests 19, 20)", () => {
  it("Milo preview is fully retained + verified", () => {
    expect(presentationCapability("preview")).toEqual({
      generated: "yes",
      included: "yes",
      retained: "yes",
      destinationVerified: "yes",
    });
  });
  it("a real connector distinguishes included from retained and is NOT verified (tests 19, 20)", () => {
    for (const dest of ["wordpress", "shopify", "custom", null] as const) {
      const cap = presentationCapability(dest);
      expect(cap.included).toBe("yes");
      expect(cap.retained).toBe("unknown"); // included !== retained
      expect(cap.destinationVerified).toBe("no"); // classes in HTML are not "verified"
    }
  });
});

describe("mobile presentation rendering (P1.2D)", () => {
  const classesOf = (html: string): string[] => {
    const m = html.match(/^<figure class="([^"]*)"/);
    return m ? m[1].split(" ") : [];
  };

  it("no mobilePresentation → NO milo-m-* classes (byte-identical to base)", () => {
    const html = compileFigureHtml(img(), pres({ size: "large", alignment: "center" }));
    expect(html).not.toContain("milo-m-");
  });

  it("a mobile override emits milo-m-* ONLY for dimensions that differ from base", () => {
    const html = compileFigureHtml(
      img({ mobilePresentation: { size: "small" } }),
      pres({ size: "large", alignment: "center", visualStyle: "card" }),
    );
    const cls = classesOf(html);
    expect(cls).toContain("milo-m-size-small"); // size differs (large → small)
    expect(cls).not.toContain("milo-m-align-center"); // alignment inherited → no class
    expect(cls).not.toContain("milo-m-style-card"); // style inherited → no class
    // base classes are untouched
    expect(cls).toContain("milo-size-large");
    expect(cls).toContain("milo-style-card");
  });

  it("a mobile override equal to the base emits NO milo-m-* class (diff-only)", () => {
    const html = compileFigureHtml(
      img({ mobilePresentation: { size: "large", alignment: "center" } }),
      pres({ size: "large", alignment: "center" }),
    );
    expect(html).not.toContain("milo-m-");
  });

  it("mobile classes follow the base in deterministic order (size, align, aspect, fit, style)", () => {
    const html = compileFigureHtml(
      img({
        mobilePresentation: { size: "full", alignment: "left", visualStyle: "rounded" },
      }),
      pres({ size: "small", alignment: "center", visualStyle: "plain" }),
    );
    const cls = classesOf(html);
    // every base class precedes every mobile class; mobile order is size→align→style
    expect(cls.indexOf("milo-style-plain")).toBeLessThan(cls.indexOf("milo-m-size-full"));
    expect(cls.indexOf("milo-m-size-full")).toBeLessThan(cls.indexOf("milo-m-align-left"));
    expect(cls.indexOf("milo-m-align-left")).toBeLessThan(cls.indexOf("milo-m-style-rounded"));
  });

  it("an unknown mobile override value is coerced (never a raw class) and inherits when unset", () => {
    const html = compileFigureHtml(
      img({ mobilePresentation: { size: "huge" as never } }),
      pres({ size: "large" }),
    );
    // 'huge' coerces to the base size → equals base → no mobile size class, no raw 'huge'
    expect(html).not.toContain("huge");
    expect(html).not.toContain("milo-m-size");
  });
});
