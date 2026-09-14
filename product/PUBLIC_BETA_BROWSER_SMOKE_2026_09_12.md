# Supplemental public beta/demo browser smoke — 12 September 2026

Read-only browser verification of the public beta delivery at clean source/documentation HEAD `a503506dc3bbd9615a5d3ac3f5ba0d932dbb2254`. No application source changed. This supplements the static/local validation in `UI_PUBLIC_BETA_LOCALIZATION_2026_09_12.md`; it does not establish fluent-user, production, authenticated or real-provider acceptance. Overall approximately60%, implementation75%; paid launch NO-GO.

## Built-page observations

The existing passing build targets Cloudflare and emits `.output/server/index.mjs` plus `.output/public`. A temporary local GET-only HTTP harness `/tmp/milo-public-built-preview.mjs` served that unmodified worker with a local static ASSETS binding on127.0.0.1:4189. It used no production account, credentials or environment mutation. The harness itself is not a Cloudflare runtime/release test.

CUA browser observations on the built application:

- `/beta` initially rendered English. Selecting Polish updated the title, body, pricing descriptions, language label, header and footer. Selecting Swedish and Danish also updated the rendered headings. Catalog/runtime choices were the four expected languages.
- Reloading with Danish selected retained Danish body text; visiting `/demo-script` carried Danish into that route and its selector. This verifies actual device persistence rather than a mocked language hook.
- Demo selection then changed Danish → Polish → Swedish → English. Each rendered main `lang`, selected option and h1 agreed. Titles were respectively `Demonstracja Milo — 8–10 minut`, `Milo-demo — 8–10 minuter`, and `Milo demo — 8–10 minutes`.
- At an explicit390×844 viewport, beta in Danish and demo in Polish/Swedish/English each had document scrollWidth390 and window.innerWidth390. There was no horizontal overflow in these sampled states. Visual screenshots were inspected for beta header/hero and demo list; this is scoped layout evidence, not a full-device/assistive-technology audit.
- The viewport override was reset, local interface preference restored to English, temporary tab closed and preview process stopped. No audit/generation/signup/contact/payment/real email action was triggered.

## Development-mode gap, distinct from the built result

`vite preview` failed because the TanStack preview plugin expected `dist/server/server.js`, while the configured Nitro target produced Cloudflare `.output`. This is preview-tool configuration behavior, not evidence that the build was absent.

`vite dev` rendered SSR but browser startup failed with `Module "node:crypto" has been externalized for browser compatibility. Cannot access "node:crypto.randomUUID" in client code`, pointing to `src/lib/generation-usage.server.ts:1:27`. A native selector could visually choose Polish, but application text remained English because client hydration had failed.

Read-only source trace: generation-usage.server.ts imports randomUUID at top level. ai.functions.ts:37 and image-gen.functions.ts:20 import withGenerationUsage at top level and export server core functions alongside createServerFn proxies. This is a suspected eager development-module dependency leak; the full transitive root/import chain was not proven. A text inventory found neither generation-usage nor node:crypto in built public assets, and the built pages demonstrably hydrated. Do not describe this observation as a proven production bug, nor hide it with a browser crypto shim or weaken metering/auth/server boundaries.

The active successor `01a094a8-59ac-7e22-a456-ba96e6e2778b` received the exact observations and owns investigation/fixes plus remaining public localization. Predecessor implementation remains stopped. Prior successor `01a094a3-e89e-7ee1-9534-ae3a57b1e14e` also received the built/development distinction. No application fix, repeat release check, PR, deployment or provider operation was performed here.
