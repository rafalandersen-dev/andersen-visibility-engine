## Goal
Recover the live app by restarting the Lovable Cloud backend so the PostgREST API service reloads its schema cache and stops returning `PGRST002` 503s. No application code, schema, or migration changes.

## Current state
- `supabase--cloud_status` reports the backend as healthy from the control plane, but you're observing PGRST002 on every REST request — classic wedged API layer with a healthy Postgres underneath.
- `NOTIFY pgrst, 'reload schema'` did not recover it, so an in-place reload is not enough — the API service itself needs to be bounced.

## Action
1. Run `supabase--restart` to reboot the backend API (PostgREST + gateway). Expect a few minutes of unavailability during the reboot.
2. Poll `supabase--cloud_status` until it returns `ACTIVE_HEALTHY` again.
3. Verify recovery with a single lightweight `supabase--read_query` (e.g. `select 1`) plus one real table read (e.g. `select count(*) from public.user_roles`) to confirm the schema cache repopulated and PGRST002 is gone.
4. Report back exactly what was done and the post-restart status. If the restart doesn't clear PGRST002, escalate to Supabase support for project `fguokeheqoqunadhdbsz` — we won't try code-level workarounds.

## Explicitly not doing
- No edits to application code, RLS, policies, grants, or migrations.
- No schema changes, no `NOTIFY` retries, no auth config changes.

Approve to proceed with the restart.