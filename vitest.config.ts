// Standalone Vitest config — deliberately does NOT load vite.config.ts (the
// TanStack Start / Lovable plugins are irrelevant to unit tests and slow to
// boot). Tests cover pure server helpers only; environment is node.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
