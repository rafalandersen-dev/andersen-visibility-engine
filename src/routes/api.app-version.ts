import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Stale-bundle guard: returns the SERVER bundle's baked build id. A client
// whose own baked id differs is running an old cached bundle.
export const Route = createFileRoute("/api/app-version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { buildId: __MILO_BUILD_ID__ },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
