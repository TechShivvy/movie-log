-- Migration 005 (movie_rating_half_star): switch movie_logs.rating from a
-- 1-10 integer to the same half-star scale (0.5-5.0) visit_venue_ratings
-- already uses, and finish the "public profile" read paths that
-- schemas/public_profile.py + services/supabase_rest.py already assume
-- exist: discoverable user_settings rows, and a narrow public projection
-- of movie_logs (deliberately excluding booking_ref/ticket_image_path/seats
-- — "share my rating" was never meant to mean "share my raw booking ref").

-- Old scale was 1-10 whole numbers; new scale is 0.5-5.0 half-star steps —
-- dividing by 2 preserves every existing value's relative position
-- (1->0.5, 2->1.0, ..., 10->5.0) with no lost precision either way.
alter table public.movie_logs
  alter column rating type numeric(2,1) using (rating::numeric / 2);

alter table public.movie_logs drop constraint if exists movie_logs_rating_check;
alter table public.movie_logs
  add constraint movie_logs_rating_check
  check (rating is null or (rating between 0.5 and 5 and mod(rating * 2, 1) = 0));

-- ── Public movie-log entries: a *view*, not a table-level policy, because
--    the public projection has to exclude columns that "is_public = true"
--    was never meant to expose. Owned by the migration role (same as
--    movie_logs itself), so it reads the base table using the owner's
--    privileges — anon/authenticated need a grant on the view only, not on
--    movie_logs directly. ────────────────────────────────────────────────

create or replace view public.public_movie_log_entries as
select
  id, user_id, movie, watched_date, watched_time, timezone_abbrv,
  theater, theatre_id, language, screen, screen_id, certificate, notes,
  rating, created_at
from public.movie_logs
where is_public = true;

grant select on public.public_movie_log_entries to anon, authenticated;

-- anon never needs direct movie_logs access — public reads go through the
-- view above, which does not depend on this grant (see comment there).
revoke all on public.movie_logs from anon;

-- ── user_settings: public profile read. No column exclusion needed here —
--    every column on this table (auto_fill, preferred_model, username,
--    display_name, bio, is_discoverable, timestamps) is already meant to
--    be readable once a user opts into is_discoverable, so a plain RLS
--    policy is enough (unlike movie_logs above, nothing to hide behind a
--    view). This policy is additive alongside the existing
--    "user_settings_select_own" policy — Postgres OR's permissive
--    policies together, so authenticated users keep seeing their own row
--    *and* any discoverable one. ────────────────────────────────────────

drop policy if exists "user_settings_select_discoverable" on public.user_settings;
create policy "user_settings_select_discoverable"
on public.user_settings
for select
to anon, authenticated
using (is_discoverable = true);

revoke all on public.user_settings from anon;
grant select on public.user_settings to anon;
