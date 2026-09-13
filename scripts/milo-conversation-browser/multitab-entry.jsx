import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MiloConversationWorkspace } from "./src/components/MiloConversationWorkspace";
const actorId = "00000000-0000-4000-8000-000000000002";
const projects = [
  {
    ownerId: "00000000-0000-4000-8000-000000000001",
    projectId: "p",
    name: "First client — SQL fixture",
  },
  {
    ownerId: "00000000-0000-4000-8000-000000000003",
    projectId: "p",
    name: "Second client — SQL fixture",
  },
];
function Fixture() {
  const [project, setProject] = useState(projects[0]),
    [stats, setStats] = useState({});
  useEffect(() => {
    const refresh = () =>
      fetch("/api/stats")
        .then((r) => r.json())
        .then(setStats);
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="milo-app p-5">
      <h1 className="text-xl mb-3">
        Two-tab SQL check — synthetic accounts and simulated execution
      </h1>
      <label>
        Fixture client{" "}
        <select
          value={project.ownerId}
          onChange={(e) => setProject(projects.find((p) => p.ownerId === e.target.value))}
        >
          {projects.map((p) => (
            <option key={p.ownerId} value={p.ownerId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <details className="my-4">
        <summary>Fixture controls</summary>
        <div className="flex flex-wrap gap-3">
          {["release", "pending", "expire", "revoke"].map((action) => (
            <button
              key={action}
              className="border p-2"
              onClick={() => void fetch(`/control/${action}`, { method: "POST" })}
            >
              {action}
            </button>
          ))}
        </div>
        <pre id="fixture-stats">{JSON.stringify(stats, null, 2)}</pre>
      </details>
      <MiloConversationWorkspace
        key={project.ownerId}
        actorId={actorId}
        project={project}
        onOpenResult={() => {
          throw Error("No result navigation in this fixture");
        }}
      />
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Fixture />
  </QueryClientProvider>,
);
document.getElementById("results").textContent =
  "Interactive multi-tab SQL fixture. No live authentication or provider calls.";
