import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DiscoverySelectionToggle } from "./DiscoverySelectionToggle";

const render = (props: { checked: boolean; disabled: boolean }) =>
  renderToStaticMarkup(
    createElement(DiscoverySelectionToggle, {
      ...props,
      label: "Select Fixture title",
      onToggle: vi.fn(),
    }),
  );

describe("DiscoverySelectionToggle (AM)", () => {
  it("a selected suggestion is an enabled toggle button in the pressed state", () => {
    const html = render({ checked: true, disabled: false });
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toMatch(/\sdisabled=""/); // the attribute, not the Tailwind disabled: variants
    expect(html).toContain('aria-label="Select Fixture title"');
    expect(html).toContain("<svg"); // visible check mark, hidden from AT
    expect(html).toContain('aria-hidden="true"');
  });
  it("an unselected suggestion is an enabled toggle button in the not-pressed state", () => {
    const html = render({ checked: false, disabled: false });
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toMatch(/\sdisabled=""/); // the attribute, not the Tailwind disabled: variants
    expect(html).not.toContain("<svg");
  });
  it("an accepted (in plan) row is disabled and never pressed", () => {
    const html = render({ checked: false, disabled: true });
    expect(html).toContain('aria-pressed="false"');
    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
  });
  it("never carries form-submit attributes", () => {
    for (const html of [
      render({ checked: true, disabled: false }),
      render({ checked: false, disabled: true }),
    ]) {
      expect(html).not.toMatch(/type="submit"|\sform=|formaction=/);
    }
  });
});
