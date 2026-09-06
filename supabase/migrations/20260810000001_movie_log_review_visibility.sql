-- Migration 006 (movie_log_review_visibility): replace movie_logs.is_public
-- (binary) with a 3-state `visibility` column — private / anonymous / public
-- — matching the pattern already used for verified_source (a text column
-- with a check constraint standing in for an enum).
--
-- Design: the numeric venue ratings (visit_venue_ratings -> theatre/screen
-- rating_stats) already aggregate regardless of a log's visibility — that
-- part needed no change, the trigger from migration 004 never filtered on
-- is_public. This migration is only about the qualitative review (movie,
-- notes, rating, watched_date, etc. on movie_logs itself):
--   - private:   not visible to anyone but the owner (previous is_public=false)
--   - anonymous: visible, but not attributed to the writer
--   - public:    visible and attributed (previous is_public=true)

alter table public.movie_logs
  add column if not exists visibility text;

update public.movie_logs
  set visibility = case when is_public then 'public' else 'private' end
  where visibility is null;

alter table public.movie_logs
  alter column visibility set not null,
  alter column visibility set default 'private';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movie_logs_visibility_check') then
    alter table public.movie_logs
      add constraint movie_logs_visibility_check
      check (visibility in ('private', 'anonymous', 'public'));
  end if;
end $$;

-- Old index was on the boolean; replace with one on the new column, same
-- partial-index shape (only rows that are actually readable by anyone else).
drop index if exists idx_movie_logs_public;
create index if not exists idx_movie_logs_visibility
  on public.movie_logs (visibility) where visibility <> 'private';

-- ── public_movie_log_entries: redefined *before* dropping is_public below
--    — the existing view still reads from is_public, and Postgres won't
--    drop a column another object depends on. Now includes anonymous rows too, and
--    conditionally drops attribution (user_id, username) for them. The
--    NULL user_id on anonymous rows isn't just for display — it's also
--    what keeps list_public_logs_for_user (a specific user's own profile
--    page, filtered by `user_id=eq.<theirs>`) from ever matching an
--    anonymous row: NULL never equals anything in SQL, so anonymous
--    entries are automatically excluded from a person's own profile
--    without any extra filtering logic. They're only reachable through
--    the new theatre/screen review listings (routers/venues.py).
--
--    username is looked up here (not left to the API layer) so it's a
--    single PostgREST call for callers like the theatre/screen review
--    listings — same reasoning as the other aggregate views in this
--    project. It's shown for `public` rows regardless of is_discoverable:
--    that setting controls whether someone's *profile* is browsable/
--    searchable at all, which is a broader, separate choice from marking
--    one specific review public (an explicit, per-review act of
--    attribution). A public review with no username set just shows null,
--    same as it already does for other unset profile fields.
--
--    DROP + CREATE, not CREATE OR REPLACE: the new `username` column sits
--    between user_id and movie, and Postgres's CREATE OR REPLACE VIEW
--    refuses to change the position/name of existing output columns (it
--    can only append new ones at the end) — confirmed by actually trying
--    it: "cannot change name of view column \"movie\" to \"username\"".
drop view if exists public.public_movie_log_entries;
create view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public');

grant select on public.public_movie_log_entries to anon, authenticated;

-- Now safe to drop — nothing depends on it anymore.
alter table public.movie_logs drop column if exists is_public;
