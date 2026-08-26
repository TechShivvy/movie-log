-- Phase C of plan.md: theatre/screen lifecycle status (open/closed/
-- renovation). Admin-only to set, deliberately -- this is shared
-- directory data referenced by many users' history, the same reasoning
-- that's kept theatre/screen editing out of scope until now applies
-- just as much to marking one closed: a false claim misleads everyone
-- who sees that theatre afterward, so it needs the same governance gate
-- report triage already uses (ADMIN_USER_IDS), not a crowd-sourced write.
--
-- No RLS UPDATE policy is added for this -- ADMIN_USER_IDS lives in the
-- backend's own settings, not the database, so there's nothing for a
-- Postgres policy to check. The actual write goes through the
-- service-role key (services/supabase_admin.py), same as reports
-- triage; get_current_admin is what gates who can reach that code path
-- at all.

alter table public.theatres
  add column if not exists status text not null default 'open';

alter table public.screens
  add column if not exists status text not null default 'open';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'theatres_status_check') then
    alter table public.theatres
      add constraint theatres_status_check
      check (status in ('open', 'closed', 'renovation'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'screens_status_check') then
    alter table public.screens
      add constraint screens_status_check
      check (status in ('open', 'closed', 'renovation'));
  end if;
end $$;
