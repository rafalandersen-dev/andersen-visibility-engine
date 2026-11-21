import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { handleMiloRequest } from "@/lib/milo/receiver";

// Server-to-server endpoint for Milo Growth, authenticated by the
// x-milo-publish-secret header against MILO_PUBLISH_SECRET (fails closed).
const handler = ({ request }: { request: Request }) =>
  handleMiloRequest("live", request, {
    secret: process.env.MILO_PUBLISH_SECRET,
    store: async () => (await import("@/lib/milo/store.server")).createMiloStore(),
  });

export const Route = createFileRoute("/api/milo/live")({
  server: {
    handlers: { POST: handler, GET: handler, PUT: handler, PATCH: handler, DELETE: handler },
  },
});
