# Dependency lock discipline

The application is installed through both npm and Bun. A change to package.json or package-lock.json is incomplete until bun.lock reflects the same intended dependency versions. An npm-only security audit does not establish Bun's graph is safe.

For an intentional dependency change, update the npm lock and regenerate/reconcile the Bun lock using Bun's documented lockfile migration in an isolated checkout. Review the resulting versions, run both audits and validate a fresh frozen install, types, tests and build. Keep the24h minimum-release-age guard and its existing exception list. Do not add exceptions as a shortcut.

Normal installation is frozen by bunfig.toml. A frozen-install failure means the lock needs an intentional reviewed update; do not disable the production guard to make a deployment pass. The Dependency lock consistency workflow checks both manifests/locks and rejects rewritten inputs. Its permissions are read-only and its actions are pinned.

Before publication, require exact Lovable source synchronization. After publication, compare every component and the full source fingerprint returned by /api/app-version, including both package locks. Vercel success or matching application files alone do not prove matching dependencies. Git metadata may be absent from an archive build; preserve null rather than inventing a revision.
