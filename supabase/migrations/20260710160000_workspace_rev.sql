-- Phase 1 commit 1: workspace optimistic-concurrency foundation.
-- Adds workspaces.rev and a BEFORE UPDATE guard: every writer must ECHO the
-- rev it read; the trigger performs the increment. A mismatched echo raises
-- 'workspace_conflict' (errcode 40001, serialization_failure) so both the
-- client save path (commit 2) and the server write layer can detect races.
--
-- Legacy safety: a client that omits rev from its upsert leaves NEW.rev equal
-- to OLD.rev on the UPDATE path (PostgREST keeps omitted columns), so the
-- check passes and the row still bumps — old deployed tabs keep working with
-- today's last-writer-wins semantics until they pick up the new client code.
--
-- Additive only. No OAuth tables touched. Existing workspaces RLS/policies
-- and the project-cap trigger are unchanged.

alter table public.workspaces add column if not exists rev integer not null default 0;

create or replace function public.enforce_workspace_rev()
returns trigger
language plpgsql
as $$
begin
  if new.rev is distinct from old.rev then
    raise exception 'workspace_conflict' using errcode = '40001';
  end if;
  new.rev := old.rev + 1;
  return new;
end;
$$;

drop trigger if exists workspaces_rev_guard on public.workspaces;
create trigger workspaces_rev_guard
  before update on public.workspaces
  for each row
  execute function public.enforce_workspace_rev();
