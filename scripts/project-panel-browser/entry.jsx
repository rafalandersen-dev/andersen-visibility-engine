import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

function Panel({ kind, project }) {
  const [draft] = useState(() => project.id + " private draft");
  return (
    <section data-kind={kind} data-project={project.id} data-draft={draft}>
      {kind}: {draft}
    </section>
  );
}
function WeeklyPreparationPanel({ project }) {
  return <Panel kind="weekly" project={project} />;
}
function BrandIntelligenceCard({ project }) {
  return <Panel kind="brand" project={project} />;
}
function PublishingCard({ project }) {
  return <Panel kind="publishing" project={project} />;
}
function ProjectPanels({ active }) {
  return <div>{/* ACTUAL_PANEL_CALL_SITES */}</div>;
}

const root = createRoot(document.getElementById("root"));
const errors = [];
const originalError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(" "));
  originalError(...args);
};
window.addEventListener("error", (event) => errors.push(event.message));
document.getElementById("run").onclick = () => {
  document.getElementById("run").disabled = true;
  const checks = [];
  for (const id of ["project-a", "project-b", "project-a", "project-b"]) {
    flushSync(() => root.render(<ProjectPanels active={{ id }} />));
    const panels = [...document.querySelectorAll("section[data-kind]")];
    const pass =
      panels.length === 3 &&
      ["weekly", "brand", "publishing"].every(
        (kind) =>
          panels.filter(
            (p) =>
              p.dataset.kind === kind &&
              p.dataset.project === id &&
              p.dataset.draft === id + " private draft",
          ).length === 1,
      );
    checks.push({ project: id, pass, panels: panels.map((p) => ({ ...p.dataset })) });
  }
  flushSync(() => root.unmount());
  checks.push({
    unmount: true,
    pass: document.querySelectorAll("section[data-kind]").length === 0,
  });
  document.getElementById("result").textContent = JSON.stringify(
    {
      completed: true,
      allPass: checks.every((c) => c.pass) && errors.length === 0,
      checks,
      errors,
    },
    null,
    2,
  );
};
