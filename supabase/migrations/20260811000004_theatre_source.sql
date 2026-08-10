-- Migration 010 (theatre_source): tracks whether a theatre's data came
-- from Google Places (authoritative — name/address/lat-lng fetched
-- server-side from a real place_id, see routers/venues.py) or was
-- free-typed by a user with no place_id to back it (routers/venues.py
-- still allows this — some real theatres genuinely aren't on Google
-- Places, e.g. small/regional/pop-up screens — but it's the lower-trust
-- path and now visibly marked as such instead of looking identical to a
-- verified one).
--
-- Existing rows predate this column entirely (place_id was accepted but
-- never actually resolved against Google — nothing in the codebase has
-- called the Places API yet) — backfilled from whether they happen to
-- have a place_id on file, the best available signal, not a real
-- guarantee those were ever validated.

alter table public.theatres
  add column if not exists source text;

update public.theatres
  set source = case when place_id is not null then 'google_places' else 'user_submitted' end
  where source is null;

alter table public.theatres
  alter column source set not null,
  alter column source set default 'user_submitted';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'theatres_source_check') then
    alter table public.theatres
      add constraint theatres_source_check
      check (source in ('google_places', 'user_submitted'));
  end if;
end $$;

create index if not exists idx_theatres_source on public.theatres (source);
