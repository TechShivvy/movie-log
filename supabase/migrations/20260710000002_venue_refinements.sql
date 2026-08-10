-- Migration 004 (venue_refinements): the parts of the venues/ratings feature
-- that were actually never finished.
--
-- theatres, screens, visit_venue_ratings, theatre_rating_stats and
-- screen_rating_stats were all created with RLS *enabled* but zero
-- policies attached — in Postgres that means every one of those tables is
-- currently completely inaccessible (not "insecure by default", the
-- opposite: nobody, including authenticated users, can read or write them
-- right now). This migration adds the policies the app actually needs,
-- fixes two smaller gaps found alongside them (missing updated_at triggers
-- on theatres/screens, and a rating-stats pipeline that had nowhere writing
-- to it), and tightens the grants those tables were created with.

-- ── updated_at triggers (theatres/screens had the column but no trigger) ─

drop trigger if exists trg_theatres_updated_at on public.theatres;
create trigger trg_theatres_updated_at
before update on public.theatres
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_screens_updated_at on public.screens;
create trigger trg_screens_updated_at
before update on public.screens
for each row
execute function public.set_updated_at_timestamp();

-- ── Theatres / screens: public directory. Read for everyone; insert for
--    authenticated users, tied to their own created_by (routers/venues.py
--    never exposes update/delete, so no policies for those) ────────────

drop policy if exists "theatres_select_all" on public.theatres;
create policy "theatres_select_all"
on public.theatres
for select
to anon, authenticated
using (true);

drop policy if exists "theatres_insert_own" on public.theatres;
create policy "theatres_insert_own"
on public.theatres
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = created_by);

drop policy if exists "screens_select_all" on public.screens;
create policy "screens_select_all"
on public.screens
for select
to anon, authenticated
using (true);

drop policy if exists "screens_insert_own" on public.screens;
create policy "screens_insert_own"
on public.screens
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = created_by);

-- ── visit_venue_ratings: own-row only. The router already confirms the
--    parent movie_log belongs to the caller before writing here; this is
--    defense in depth for anyone hitting PostgREST directly with a valid
--    token, bypassing the FastAPI layer entirely. ───────────────────────

drop policy if exists "visit_venue_ratings_select_own" on public.visit_venue_ratings;
create policy "visit_venue_ratings_select_own"
on public.visit_venue_ratings
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "visit_venue_ratings_insert_own" on public.visit_venue_ratings;
create policy "visit_venue_ratings_insert_own"
on public.visit_venue_ratings
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "visit_venue_ratings_update_own" on public.visit_venue_ratings;
create policy "visit_venue_ratings_update_own"
on public.visit_venue_ratings
for update
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id)
with check (auth.uid() is not null and (select auth.uid()) = user_id);

-- ── Rating stats: read-only to everyone. No user-facing writes — the
--    trigger below maintains them under its own security-definer rights. ─

drop policy if exists "theatre_rating_stats_select_all" on public.theatre_rating_stats;
create policy "theatre_rating_stats_select_all"
on public.theatre_rating_stats
for select
to anon, authenticated
using (true);

drop policy if exists "screen_rating_stats_select_all" on public.screen_rating_stats;
create policy "screen_rating_stats_select_all"
on public.screen_rating_stats
for select
to anon, authenticated
using (true);

-- ── Tighten grants. These tables were created with a blanket "GRANT ALL ...
--    TO anon/authenticated" (whatever created them defaulted to that,
--    same as the project-wide ALTER DEFAULT PRIVILEGES below) — combined
--    with zero policies, that's exactly how they ended up totally locked
--    out rather than just "not writable by anon". RLS above is the real
--    enforcement; this only stops anon/authenticated holding raw
--    UPDATE/DELETE/TRUNCATE grants they have no policy-backed use for. ──

revoke all on public.theatres, public.screens, public.theatre_rating_stats, public.screen_rating_stats, public.visit_venue_ratings
  from anon, authenticated;

grant select on public.theatres, public.screens to anon, authenticated;
grant insert on public.theatres, public.screens to authenticated;
grant select on public.theatre_rating_stats, public.screen_rating_stats to anon, authenticated;
grant select, insert, update on public.visit_venue_ratings to authenticated;

-- Fix the default too, so a *future* table doesn't repeat the same mistake:
-- new tables should start with no anon/authenticated access at all until a
-- migration explicitly grants + policies them.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;

-- ── Stats compute pipeline: recompute the affected theatre's and screen's
--    aggregate stats whenever a visit_venue_ratings row changes. Security
--    definer so it can write to *_rating_stats regardless of the caller's
--    own (now read-only) grant on those tables. ─────────────────────────

create or replace function public.recompute_venue_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movie_log_id uuid := coalesce(new.movie_log_id, old.movie_log_id);
  v_theatre_id uuid;
  v_screen_id uuid;
begin
  select theatre_id, screen_id into v_theatre_id, v_screen_id
  from public.movie_logs
  where id = v_movie_log_id;

  if v_screen_id is not null then
    insert into public.screen_rating_stats (screen_id, categories, computed_at)
    select
      v_screen_id,
      jsonb_build_object(
        'screen_rating', jsonb_build_object('avg', avg(vvr.screen_rating), 'count', count(vvr.screen_rating)),
        'speaker_rating', jsonb_build_object('avg', avg(vvr.speaker_rating), 'count', count(vvr.speaker_rating)),
        'ac_rating', jsonb_build_object('avg', avg(vvr.ac_rating), 'count', count(vvr.ac_rating)),
        'seat_rating', jsonb_build_object('avg', avg(vvr.seat_rating), 'count', count(vvr.seat_rating))
      ),
      timezone('utc', now())
    from public.visit_venue_ratings vvr
    join public.movie_logs ml on ml.id = vvr.movie_log_id
    where ml.screen_id = v_screen_id
    on conflict (screen_id) do update
      set categories = excluded.categories, computed_at = excluded.computed_at;

    update public.screens set stats_dirty = false where id = v_screen_id;
  end if;

  if v_theatre_id is not null then
    insert into public.theatre_rating_stats (theatre_id, overall, computed_at)
    select
      v_theatre_id,
      jsonb_build_object(
        'screen_rating', jsonb_build_object('avg', avg(vvr.screen_rating), 'count', count(vvr.screen_rating)),
        'speaker_rating', jsonb_build_object('avg', avg(vvr.speaker_rating), 'count', count(vvr.speaker_rating)),
        'ac_rating', jsonb_build_object('avg', avg(vvr.ac_rating), 'count', count(vvr.ac_rating)),
        'seat_rating', jsonb_build_object('avg', avg(vvr.seat_rating), 'count', count(vvr.seat_rating))
      ),
      timezone('utc', now())
    from public.visit_venue_ratings vvr
    join public.movie_logs ml on ml.id = vvr.movie_log_id
    where ml.theatre_id = v_theatre_id
    on conflict (theatre_id) do update
      set overall = excluded.overall, computed_at = excluded.computed_at;

    update public.theatres set stats_dirty = false where id = v_theatre_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recompute_venue_stats on public.visit_venue_ratings;
create trigger trg_recompute_venue_stats
after insert or update or delete on public.visit_venue_ratings
for each row
execute function public.recompute_venue_stats();
