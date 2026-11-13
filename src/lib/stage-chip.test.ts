import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { StageChip } from "@/components/StageChip";

describe("publication stage date", () => {
  const date = "17 Nov 2026 · 09:00";

  it("keeps an update's future date out of the already-published label and tooltip", () => {
    const html = renderToStaticMarkup(createElement(StageChip, { stage: "live", detail: date }));
    expect(html).toContain("pipeline.stage.live");
    expect(html).not.toContain(date);
    expect(html).not.toContain("title=");
  });

  it("still shows the scheduled date for a first publication", () => {
    const html = renderToStaticMarkup(createElement(StageChip, { stage: "armed", detail: date }));
    expect(html).toContain("pipeline.stage.armed");
    expect(html).toContain(date);
  });
});
