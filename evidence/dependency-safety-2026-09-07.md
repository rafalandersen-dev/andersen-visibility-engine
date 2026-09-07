# Dependency safety refresh — 2026-09-07

Scope R00/R24. Baseline main `41aaf64be9ebb6a6d0f5c37b581acc168990ed6c` after PR #66. Only package-lock resolution changes; package.json ranges and application behavior contracts are unchanged.

The registry audit reported seven high-severity vulnerable packages: brace-expansion, browserslist, fast-uri, js-yaml, nanoid, postcss and socket.io-parser. Resolved compatible fixes, including necessary Browserslist data updates; 14 package entries change in the lockfile. No forced major-version update or new direct dependency.

Verified resolutions: brace-expansion 1.1.18/5.0.9, browserslist 4.28.9, fast-uri 3.1.7, js-yaml 4.3.2, nanoid 3.3.18, postcss 8.5.28, socket.io-parser 4.2.7. Registry audit afterward: zero reported vulnerabilities. This is registry evidence at this date, not a guarantee of absence of all security defects.

Validation: full app suite 1,303 tests/100 files, TypeScript and production build pass on this exact lockfile. Suppliers are mocked. No migration, account/credential/flag change, paid AI or customer communication. The separate draft expense-ledger PR #67 is not part of this branch.

Rollback: restore the prior lockfile and rebuild the same application, recognizing that this reintroduces the known dependency advisories. Application release through Lovable is a separate step and requires verifying the synchronized revision first.
