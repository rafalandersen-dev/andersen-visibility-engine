import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/milo/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMiloDispatch } = await import("@/lib/milo-dispatch.server");
        return handleMiloDispatch(request);
      },
    },
  },
});
