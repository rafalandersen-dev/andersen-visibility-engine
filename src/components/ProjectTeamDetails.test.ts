import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ProjectTeamDetails } from "./ProjectTeamDetails";
it("does not mount settings/history consumers in closed roster rows", () => {
  const consumer = vi.fn(() => createElement("p", null, "private details"));
  const html = renderToStaticMarkup(
    createElement(
      "section",
      null,
      ...Array.from({ length: 1000 }, (_, index) =>
        createElement(ProjectTeamDetails, {
          key: index,
          label: "Notifications",
          children: createElement(consumer),
        }),
      ),
    ),
  );
  expect(consumer).not.toHaveBeenCalled();
  expect(html).not.toContain("private details");
  expect(html.match(/<summary/g)).toHaveLength(1000);
});
