-- Phase A of plan.md: screening punctuality wasn't aggregated anywhere
-- (added on movie_logs last iteration, never rolled up) -- this closes
-- that gap the same way visit_venue_ratings already rolls up to
-- theatre/screen_rating_stats: a plain view, not a trigger-maintained
-- table (single-column-ish aggregation over an already-indexed FK,
-- same reasoning already applied to movie_rating_stats), and counted
-- regardless of a log's visibility ("venue quality signal, not review
-- content" -- the same principle already governs venue ratings).

-- 'cancelled': a screening that never started -- "how early/late" is a
-- non-question for it. The existing delta CHECK constraint
-- (movie_logs_screening_start_delta_check) already requires delta to be
-- null for any status outside ('early','delayed'), so widening the
-- allowed-values set to include 'cancelled' correctly forces a null
-- delta for it with zero additional constraint logic.
alter table public.movie_logs
  drop constraint if exists movie_logs_screening_start_status_check;

alter table public.movie_logs
  add constraint movie_logs_screening_start_status_check
  check (screening_start_status in ('early', 'on_time', 'delayed', 'cancelled'));

create or replace view public.theatre_punctuality_stats as
select
  theatre_id,
  count(*) filter (where screening_start_status = 'on_time') as on_time_count,
  count(*) filter (where screening_start_status = 'early') as early_count,
  count(*) filter (where screening_start_status = 'delayed') as delayed_count,
  count(*) filter (where screening_start_status = 'cancelled') as cancelled_count,
  avg(screening_start_delta_minutes) filter (where screening_start_status = 'delayed') as avg_delay_minutes,
  count(*) as total_count
from public.movie_logs
where theatre_id is not null and screening_start_status is not null
group by theatre_id;

create or replace view public.screen_punctuality_stats as
select
  screen_id,
  count(*) filter (where screening_start_status = 'on_time') as on_time_count,
  count(*) filter (where screening_start_status = 'early') as early_count,
  count(*) filter (where screening_start_status = 'delayed') as delayed_count,
  count(*) filter (where screening_start_status = 'cancelled') as cancelled_count,
  avg(screening_start_delta_minutes) filter (where screening_start_status = 'delayed') as avg_delay_minutes,
  count(*) as total_count
from public.movie_logs
where screen_id is not null and screening_start_status is not null
group by screen_id;

revoke all on public.theatre_punctuality_stats, public.screen_punctuality_stats from anon, authenticated;
grant select on public.theatre_punctuality_stats, public.screen_punctuality_stats to anon, authenticated;
