import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: ReactNode; to: string }) =>
    createElement("a", { href: to }, children),
}));
vi.mock("@/components/RegionSuggestionBanner", () => ({
  RegionSuggestionBanner: () => null,
}));
// A non-production limit detects hard-coded copy in visible and crawler surfaces.
vi.mock("@/lib/billing", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing")>();
  return {
    ...original,
    PLAN_LIMITS: {
      ...original.PLAN_LIMITS,
      agency: { ...original.PLAN_LIMITS.agency, maxProjects: 17 },
    },
  };
});
import { Route as Home } from "@/routes/index";
import { Route as Pricing } from "@/routes/pricing";

it("uses canonical Agency capacity in home copy, metadata and structured FAQ", () => {
  const html = renderToStaticMarkup(createElement(Home.options.component as ComponentType));
  const text = html.replace(/<[^>]*>/g, "");
  expect(text.match(/17 projects on Agency/g)).toHaveLength(4);
  expect(text).toContain("up to 17 on Agency");
  const head = (
    Home.options.head as () => {
      meta: Array<{ name?: string; content?: string }>;
      scripts: Array<{ children: string }>;
    }
  )();
  expect(head.meta.find((item) => item.name === "description")?.content).toContain(
    "17 projects on Agency",
  );
  const faq = JSON.parse(head.scripts[0].children).mainEntity as Array<{
    name: string;
    acceptedAnswer: { text: string };
  }>;
  expect(
    faq.find((item) => item.name === "How many projects can I manage?")?.acceptedAnswer.text,
  ).toContain("up to 17 on Agency");
});

it("uses the same canonical capacity in pricing introduction and plan comparison", () => {
  const html = renderToStaticMarkup(createElement(Pricing.options.component as ComponentType));
  const text = html.replace(/<[^>]*>/g, "");
  expect(text).toContain("Scale to 17 on Agency");
  expect(text).toContain("Up to 17 projects");
  expect(text).toContain("Up to 17");
});
