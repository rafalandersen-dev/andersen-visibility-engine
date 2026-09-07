import { createFileRoute } from "@tanstack/react-router";
import {
  receiveStripeSandboxWebhook,
  recordStripeSandboxReceipt,
} from "@/lib/stripe-sandbox.server";

export const Route = createFileRoute("/api/public/webhooks/stripe-sandbox")({
  server: {
    handlers: {
      POST: ({ request }) => receiveStripeSandboxWebhook(request, recordStripeSandboxReceipt),
    },
  },
});
