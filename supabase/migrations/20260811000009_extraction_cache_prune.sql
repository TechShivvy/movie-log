-- Prunes extraction_cache rows whose prompt_version no longer matches
-- the caller's current one. services/extraction_cache.py now derives
-- PROMPT_VERSION from a hash of the live prompt content (see that
-- file's comment) rather than a hand-maintained string, so a version
-- change stops matching old rows automatically — but those rows still
-- physically remain in the table forever, unreachable but unswept,
-- unless something actually deletes them. Not run automatically (no
-- pg_cron here): the "current" version is app-level knowledge the
-- database has no way to know on its own, so this is called on demand
-- from the app side (scripts/prune_extraction_cache.py), passing in
-- whatever PROMPT_VERSION that script computes the same way the app
-- does — never hardcoded here.
--
-- Same access pattern as the other extraction_cache RPCs (migration
-- 20260811000006): security definer, service_role only, never reachable
-- via a caller's own token.

create or replace function public.prune_extraction_cache(p_current_version text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  delete from public.extraction_cache
  where prompt_version <> p_current_version;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_extraction_cache(text) from public;
grant execute on function public.prune_extraction_cache(text) to service_role;
