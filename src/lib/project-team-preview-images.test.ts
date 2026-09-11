import { expect, it } from "vitest";
import { substituteTeamPreviewImages } from "./project-team-preview-images";
it("changes only generated image src attributes, preserving literal text and other attributes", () => {
  const html =
    '<p>milo-review-image:content_im</p><code>milo-review-image:example</code><a href="milo-review-image:content_im">Link</a><img data-src="milo-review-image:content_im" title="milo-review-image:content_im" src="milo-review-image:content_im" />';
  expect(substituteTeamPreviewImages(html, { content_im: "blob:rendered" })).toBe(
    html.replace(' src="milo-review-image:content_im"', ' src="blob:rendered"'),
  );
});
it("supports encoded legacy keys and does not inject markup from replacement values", () => {
  const key = "content_~" + "a".repeat(64);
  expect(
    substituteTeamPreviewImages('<img src="milo-review-image:' + key + '" />', {
      [key]: 'blob:"<unsafe>&',
    }),
  ).toBe('<img src="blob:&quot;&lt;unsafe&gt;&amp;" />');
});
it("does not leave a fetchable placeholder for a missing image", () => {
  expect(substituteTeamPreviewImages('<img src="milo-review-image:unknown" />', {})).toBe(
    '<img src="" />',
  );
});
