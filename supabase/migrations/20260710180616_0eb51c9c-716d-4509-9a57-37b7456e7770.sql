CREATE OR REPLACE FUNCTION public.enforce_workspace_rev()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if new.rev is distinct from old.rev then
    raise exception 'workspace_conflict' using errcode = '40001';
  end if;
  new.rev := old.rev + 1;
  return new;
end;
$function$;