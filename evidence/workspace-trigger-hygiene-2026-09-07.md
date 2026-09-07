# Workspace trigger privilege hygiene

Safari's Lovable security panel reported public security-definer execution and a mutable search path. Live catalog inspection identified workspace_entities_project_cap() as a security-definer trigger function with ordinary execute privileges, and tg_workspace_meta_updated_at() as an invoker trigger without a configured search path. Neither is a normal data-returning RPC. The inspected internal token/secret tables separately have RLS with no ordinary-user policies; no permissive policies are added to silence the scanner.

Migration20260907233000 sets an empty search_path on these two existing trigger functions, removes PUBLIC/anon/authenticated execute privileges and preserves explicit service-role maintenance access. Function bodies, ownership and installed trigger bindings are untouched. Existing project caps and metadata timestamp semantics remain unchanged. It does not alter any data row, entitlement, credential, RLS policy or browser-facing workspace RPC.

Four PGlite acceptance cases use the original committed function definitions and the exact new migration: role privileges/search paths, authenticated five-project cap and sixth-project rejection, non-project writes, and metadata timestamp refresh under an unrelated caller search path. Before combining with #84, 1581 tests/121 files, TypeScript and production build passed.

Live PostgreSQL acceptance temporarily applied the exact ALTER/REVOKE/GRANT statements inside a transaction, bound the existing metadata trigger to a temporary fixture, and verified an authenticated UPDATE with a different search path plus catalog privilege assertions. Everything rolled back. A subsequent read confirmed original function settings/privileges and all13 projects unchanged. No persistent migration was applied at this stage. Apply/register only after review and record completion below.

Sources: [PostgreSQL ALTER FUNCTION](https://www.postgresql.org/docs/current/sql-alterfunction.html), [PostgreSQL CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html). This scoped hygiene check is not a complete application security audit.

Combined with reviewed/merged #84, 1614 tests in123 files, TypeScript, production build, focused lint and diff checks pass. Migration233000 remains unapplied pending this packet's review.
