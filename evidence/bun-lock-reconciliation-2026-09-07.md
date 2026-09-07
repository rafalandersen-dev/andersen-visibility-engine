# Reconcile Bun and npm dependency locks

## Observed deployment discrepancy

After #81 deployment0d3a7ef2-3f5e-4686-a636-e8b08d329779, milogrowth.com returned build1788792945297 with revision/modified unknown and full fingerprint9b8cd1dcd8425a92ebffae0a9b409e4abf83f635d6f17188e7018c1e8f52bcdc. Expected clean #81c314f1e6c02ce432299624931e7d17701e2bc61f fingerprint62fcea9d40a1d393fc0bf76f6bc3e3aad856a3b521207d21a4b72557e2c0c1c7.

Every fixed component matched except bun.lock: expected72bde580748abd181efe339d5c7254a503d907eaf8f5f98afaa94a5cb5a2a584, served9f86dba81935bf64347aff84c7d7dcac4f5586a9aad7cb693f76b96b4fbe0db1. Lovable get_project still reported the intended #81 SHA. Reading bun.lock through its file API returned the committed version, not the differing build-time file. No lockfile was excluded from the release comparison and no revision was fabricated.

Local Bun1.4.0 refused the original manifest/lock with frozen installation. bun.lock lacked the explicitly pinned @electric-sql/pglite0.5.8 dev dependency now in package.json and retained a dependency graph different from the security-updated npm lock. The earlier #68 security work updated package-lock.json without reconciling Bun. This was a verification gap: a clean npm audit did not cover Bun's separate graph. Local automatic reconciliation changed the Bun lock, but did not reproduce the exact deployed hash; the precise platform transformation/version remains unobserved. The earlier #72 transient mismatch is not retrospectively explained as proven fact.

## Correction and controls

Regenerated Bun's graph from the existing verified package-lock.json using Bun's documented npm-lock migration. package.json dependency ranges/pins and package-lock.json are unchanged. Both npm audit and the migrated Bun audit report zero findings; the prior Bun graph reported advisories across11 package names. No claim that this is a full application security audit.

bunfig.toml now sets install.frozenLockfile=true. Installation must fail if the manifest/lock disagree instead of silently resolving another graph. The existing24h minimum-release-age rule and its exact exception list are unchanged. An additional read-only-permission CI job checks frozen Bun and npm lock agreement on lock/manifest changes and rejects lock rewrites; it then tests, typechecks and builds the frozen Bun tree on Linux. GitHub action references are pinned to verified commit SHAs; the Bun check uses1.4.0.

Fresh isolated Bun frozen installation with lifecycle scripts disabled succeeded, followed by1553 tests/119 files, TypeScript and production build. A repeated frozen lock-only check succeeds. npm ci dry-run validates its manifest/lock separately. Both audits are zero; diff checks pass. This validates the corrected checkout, not its future publication. The application-source fingerprint still includes both locks.

## Remaining release check

### September 7, 20:10 UTC: host-version failure identified

The owner supplied access to the logged-in Safari Lovable editor. Its History showed #83 synchronized but #81 still marked Published; the preview also remained on c314f1e6 and reported that it was behind. A bounded publication through the UI returned Publishing failed. The More info control exposed the actual build log:

```text
install (--ignore-scripts) failed with exit status 1
error: Unknown lockfile version at bun.lock:2:22
UnknownLockfileVersion: failed to parse lockfile: 'bun.lock'
error: lockfile had changes, but lockfile is frozen
bun install v1.3.3 (274e01c7)
```

This explains why #83 itself could not publish: its Bun 1.4 format version 2 is unreadable by the observed Bun 1.3.3 builder. It does not establish the exact transformation of the earlier #81 lock or the earlier #72 discrepancy. The generic project API status ready/completed was not a successful-publication signal.

The host-compatibility correction changes only lockfileVersion from 2 to 1 in bun.lock. Every package record, resolved version, integrity hash, dependency relationship and manifest entry is byte-for-byte preserved. A separate 1.3.3 npm migration was inspected but not adopted because it would introduce unnecessary metadata differences. The frozen-install guard, 24-hour package-age rule, exception list and release fingerprints remain intact. CI now performs fresh install, tests, types and build on both Bun 1.3.3 (observed host) and 1.4.0.

Before the correction, local Bun 1.3.3+274e01c73 reproduced the exact UnknownLockfileVersion failure. After the one-line format correction, a fresh physical installation with --frozen-lockfile --ignore-scripts passed, followed by 1553 tests in 119 files, TypeScript and production build. Bun 1.3.3 and npm audits both reported zero vulnerabilities. Production equivalence remains a required post-merge check.

Review/merge the correction, require Lovable to synchronize the exact merge, publish, then compare full and all component fingerprints. Report unavailable Git metadata honestly if the build is an archive. Do not claim content mismatch is resolved until the public response matches the corrected source. #82 external Draft-state safety is reviewed/ready but its rollout is held behind this deployment correction. Storage migration220000 is already applied with5MiB JPEG/PNG/WebP bounds, restrictive public-write policies and both existing objects retained; do not repeat it.

Sources: [Bun lockfile migration](https://bun.sh/docs/pm/lockfile), [preserving npm resolved versions](https://bun.com/guides/install/from-npm-install-to-bun-install), [frozen installation](https://bun.com/docs/pm/cli/install), [install.frozenLockfile configuration](https://bun.com/docs/runtime/bunfig).
