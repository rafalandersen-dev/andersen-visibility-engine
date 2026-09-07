# Runtime source identity

September 7, 2026. R00/R24 application release verification; no public-audit Worker changes.

The existing `/api/app-version` exposed only a build timestamp. That helped detect a stale browser bundle but could not compare the deployed application with source. It now preserves `buildId` and adds `source` with:

- `fingerprint`: deterministic SHA-256 of sorted named application inputs, using the versioned `milo-source-v1` framing. Paths, lengths and bytes are included, so renamed files and dependency lock changes affect identity.
- `revision`: the actual checkout's 40-character Git HEAD when Git metadata is available, otherwise null. No commit is guessed from an unrelated environment variable or previous release record.
- `modified`: whether selected application inputs differ from that checkout, or null without Git metadata. A commit plus modified=true does not prove a clean source release.

Inputs cover src (including tests/declarations), public, build helpers, Vite/TypeScript config, package metadata and both existing lockfile formats. Runtime secrets/environment files, node_modules, Git internals, evidence and documentation are excluded. Symlinks and incomplete trees produce unknown identity rather than reading external paths or fabricating a fingerprint. This is a source-input identity, not an attestation of environment configuration, installed dependencies, external resources or database state.

The existing browser stale-bundle guard still compares buildId. Public response remains no-store. No filesystem or Git command runs on a production request: identity is baked during the build.

Validation on #69 baseline: 1,347 tests across 105 files, TypeScript, production build, focused lint and diff checks. Eight new tests cover source edits, renames, lock changes, secret/dependency/document exclusions, missing Git metadata, unsupported symlinks/incomplete sources and real clean/modified Git checkouts. Production comparison remains pending until this change is merged and published.

To compute the expected identity with Node 22+ on a verified checkout, run:

```sh
node --experimental-strip-types --input-type=module -e 'import {releaseIdentity} from "./build/release-identity.ts"; console.log(JSON.stringify(releaseIdentity()))'
```

After deployment, compare fingerprint and algorithm to the custom-domain response. Compare revision too when available, and reject a clean-release claim if modified=true. A null or mismatched fingerprint is unresolved evidence, not success. This check supplements authenticated journey, migration/configuration and provider acceptance; it cannot replace them.

## Adjacent release state

PR #69 is live: verified Lovable merge `2738d14495e26e31dba1282764f2ad3eda95607d`, deployment `f6936938-a888-494a-89ce-53113f9d3ffe`, domain build `1788784740863`. Its 15-minute private in-app scan is cron job 150; request 14400 scanned five accounts without failure. Four active alerts were observed; no email or publishing occurred.

PR #70 email migration `20260907170000` is now applied and recorded. A real SQL queue/dedupe/lease/prepare/unknown-outcome test was fully rolled back. Afterwards: zero opted-in accounts, zero queued digests, synthetic fixture absent; anon/authenticated cannot claim deliveries. This does not activate customer email. User authorized one test to rafi@anderseninnovations.com, but that address has no Milo auth account. Clarification about account-address migration versus transport-only acceptance is pending; no mail has been sent and the original verified-account condition has not been bypassed.
