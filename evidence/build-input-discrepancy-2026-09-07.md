# Build input discrepancy and diagnostic packet

At 13:24 UTC on September 7, after Lovable publication `fbe74576-44ae-413a-a18d-c53053bc3129`, milogrowth.com returned build `1788787342893`, fingerprint `b995e307dd3d6553e78181c6d3788d9e8ab29a5d2403513b632c433a2d206723`, revision null and modified null. Lovable still reported source `a761cd879860db8fc3449953d6c1e652922e204d`, whose clean checkout and independent Git archive both fingerprint as `42ffc64ec49bcceb862d8aff174a149fc4306187664d72c52e72c82970be89ed`.

The new build is present, but source equivalence is **not verified**. Missing Git metadata in an exported build can explain a null revision; it does not explain away a different source fingerprint. Removing combinations of package-lock.json, bun.lock and bunfig.toml from an isolated archive did not reproduce the observed fingerprint. No source/version identity is fabricated.

This diagnostic packet adds hashes of the existing fixed public input groups to the same build-time identity. It retains the original combined algorithm. Only group names and hashes are emitted; no contents, credentials, environment variables or extra filesystem paths are exposed. Missing groups report null. There is still no per-request filesystem or Git operation.

Validation: 1,415 tests across 109 files, including nine release-identity cases for localized lockfile change and environment exclusion. TypeScript, production build and focused lint pass. Source matching, protected user journeys and runtime configuration are separate acceptance claims.
