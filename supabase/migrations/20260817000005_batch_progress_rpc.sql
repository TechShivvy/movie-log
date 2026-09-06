-- Real bug caught live while testing: services/extraction_batches.py's
-- run_batch processes items under bounded concurrency (asyncio.Semaphore,
-- see _PACING_BY_PROVIDER) -- multiple items can finish at nearly the
-- same instant. A plain "read completed_items, add 1, PATCH it back" from
-- Python is not safe under that concurrency (two items finishing together
-- can race and clobber each other's increment, undercounting). Needs a
-- single atomic UPDATE statement instead, same reasoning
-- increment_daily_usage (services/quota.py) already established for
-- concurrent quota increments -- Postgres's own row-level locking makes
-- `column = column + 1` atomic per statement, which a Python read-modify-
-- write round trip can never guarantee.

create or replace function public.increment_batch_progress(p_batch_id uuid, p_success boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.extraction_batches
  set
    completed_items = completed_items + (case when p_success then 1 else 0 end),
    failed_items = failed_items + (case when p_success then 0 else 1 end)
  where id = p_batch_id;
$$;

revoke all on function public.increment_batch_progress(uuid, boolean) from public;
grant execute on function public.increment_batch_progress(uuid, boolean) to service_role;
