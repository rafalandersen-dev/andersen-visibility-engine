# TanStack security update — local verification, 7 October 2026

Vercel blocked the optional transport candidate because the existing react-start1.168.26 is affected by CVE-2026-102989. The same resolution exists on main. This separate change updates react-start to1.168.60, server-core1.169.39 and the compatible router/plugin family. No security bypass or transport provisioning is included.

Primary references: https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989 and https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8 . A new production build and deployment are required to patch live code; this record does not claim deployment.

Claude authored the manifest and Bun/npm lock update in a private dependency tree. Its permission service then repeatedly returned no verdict, including on read-only commands. The same-session continuation stopped after one further error. Codex completed a necessary security integration exception: ErrorComponent's argument type changes from Error to unknown, matching the patched router. The existing reporter already accepts unknown; runtime UI and reporting behavior are unchanged. No source behavioral rewrite or new error serialization was added.

Independent local validation:
-125 critical auth, security and knowledge tests across11 suites passed.
-TypeScript passed after the one-line annotation adjustment.
-Production Vite/Nitro Cloudflare-module build passed.
-Bun1.4.0 frozen installation, npm lock dry-run and entities4.5.0 compatibility check passed. Hashes confirmed no lock rewrites. Bun1.3.3 remains a CI gate.
-Changed npm transitive versions trace to updated TanStack dependencies (serializer, store, router build tooling, Babel, lightningcss and associated utilities). React/application feature dependencies were not mass-upgraded.
-Actual built worker served app-version200, homepageSSR200 and missingroute404; browser rendered the homepage. A serialized unauthenticated read-server-function request returned an Error with no result, decoded using the updated Seroval/router plugins, and was refused by the auth middleware. All worker outbound requests were intercepted locally; no production credentials, DB, AI or capture was used.

Local runtime limitation: the already installed workerd1.20260903.1 accepted a September10 compatibility date, while the build emits October7. This scoped smoke is not proof of the exact hosted runtime. Standard vite preview also encountered the new TanStack preview plugin expecting dist/server/server.js, whereas Nitro emits .output/server/index.mjs. Direct built-worker verification succeeded; no application workaround was added merely for this preview mismatch. Hosted preview/deployment remains a required gate.

The broad prior Milo acceptance obligations and production-no-replay rules remain. This does not accept the optional transport, real knowledge intake or pilot. No provider call, migration, new service, credential, purchase or production action occurred during these checks.
