/**
 * milo-image.css mobile-override completeness (Article Studio 3.0 / P1.2D).
 *
 * The compiler emits a `milo-m-*` class only for a dimension whose mobile value
 * DIFFERS from the base. For that to actually take effect at the phone breakpoint,
 * each mobile class must fully OVERRIDE the base — including resetting base
 * properties it does not want (removing card/rounded chrome, resetting the base
 * `full` width). A missing reset silently drops the author's mobile choice. This
 * test guards against that regression class without needing a browser.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  IMAGE_SIZES,
  IMAGE_STYLES,
  IMAGE_ALIGNMENTS,
  IMAGE_ASPECTS,
  IMAGE_FITS,
} from "./presentation-compiler";

const css = readFileSync(
  fileURLToPath(new URL("../styles/milo-image.css", import.meta.url)),
  "utf8",
);
// The mobile rules are the trailing @media block.
const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));

describe("milo-image.css mobile-override completeness", () => {
  it("declares a mobile class for every compiler-emittable preset value", () => {
    for (const s of IMAGE_SIZES) expect(mobile).toContain(`.milo-m-size-${s}`);
    for (const a of IMAGE_ALIGNMENTS) expect(mobile).toContain(`.milo-m-align-${a}`);
    for (const a of IMAGE_ASPECTS) expect(mobile).toContain(`.milo-m-aspect-${a}`);
    for (const f of IMAGE_FITS) expect(mobile).toContain(`.milo-m-fit-${f}`);
    for (const v of IMAGE_STYLES) expect(mobile).toContain(`.milo-m-style-${v}`);
  });

  it("mobile 'plain'/'rounded' reset the base figure card chrome (card→plain/rounded does not linger)", () => {
    // figure-level reset of padding/border/background so a base card is neutralised
    expect(mobile).toMatch(/\.milo-m-style-plain[\s\S]*?\{[^}]*padding:\s*0/);
    expect(mobile).toMatch(/\.milo-m-style-plain[\s\S]*?\{[^}]*border:\s*0/);
    expect(mobile).toMatch(/\.milo-m-style-plain[\s\S]*?\{[^}]*background:\s*none/);
    // img-level reset of base rounded corners for plain AND card
    expect(mobile).toMatch(/\.milo-m-style-plain img[\s\S]*?\{[^}]*border-radius:\s*0/);
    expect(mobile).toMatch(/\.milo-m-style-card img[\s\S]*?\{[^}]*border-radius:\s*0/);
  });

  it("mobile sizes reset the base 'full' width so a full→small override is not stretched", () => {
    for (const size of ["small", "medium", "large", "wide"]) {
      expect(mobile).toMatch(new RegExp(`\\.milo-m-size-${size} img\\s*\\{[^}]*width:\\s*auto`));
    }
  });
});
