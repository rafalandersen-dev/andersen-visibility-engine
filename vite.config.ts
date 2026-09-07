// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "milo-local-responsive-qa",
        apply: "serve",
        configureServer(server) {
          server.middlewares.use("/__visual-qa", (_request, response, next) => {
            if (server.config.env.VITE_MILO_VISUAL_QA !== "true") return next();
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(
              readFileSync(resolve(server.config.root, "preview/responsive.html"), "utf8"),
            );
          });
        },
      },
    ],
    server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
    define: {
      // Stale-bundle guard (2026-07-25): one id baked into BOTH the client and
      // the server bundle at build time. The client compares its baked id with
      // /api/app-version (served by the freshly deployed server) and offers a
      // reload when they differ — users were seeing the PRE-REDESIGN app from
      // cached bundles after deploys.
      __MILO_BUILD_ID__: JSON.stringify(String(Date.now())),
    },
  },
});
