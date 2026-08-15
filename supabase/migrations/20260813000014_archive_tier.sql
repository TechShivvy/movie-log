-- Phase 1 of plan.md: archive as a real third tier, distinct from
-- `private`. `private` content still counts toward theatre/screen/movie
-- aggregates today (deliberate -- "venue signal, not review content") --
-- archive is the opposite: hidden from everyone including the owner's
-- own public presence, and excluded from every aggregate it currently
-- feeds. Orthogonal to visibility, not a fourth visibility value --
-- visibility still governs who could see it if it weren't archived,
-- archive is a separate "don't count this anymore" switch.

alter table public.movie_logs
  add column if not exists is_archived boolean not null default false;

-- ── public_movie_log_entries / feed_entries: exclude archived rows ──────
-- Same append-only column-order constraint every prior view change has
-- had to work around, except here nothing is appended -- the WHERE
-- clause gains one more condition, no new selected column.

create or replace view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at, ml.favorite_position,
  public.time_of_day_bucket(ml.watched_time) as time_of_day
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public') and not ml.is_archived;

create or replace view public.feed_entries as
select
  ml.id, ml.user_id, us.username, us.display_name, us.avatar_path,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at, ml.favorite_position,
  public.time_of_day_bucket(ml.watched_time) as time_of_day
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility = 'public'
  and not ml.is_archived
  and auth.uid() is not null
  and ml.user_id <> auth.uid()
  and public.can_view_user_content(ml.user_id);

-- ── movie_rating_stats / theatre_punctuality_stats / screen_punctuality_stats:
--    plain views, a one-line "and not is_archived" addition each. ───────

create or replace view public.movie_rating_stats as
select
  movie_id,
  avg(rating) as avg_rating,
  count(rating) as rating_count
from public.movie_logs
where movie_id is not null and rating is not null and not is_archived
group by movie_id;

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
where theatre_id is not null and screening_start_status is not null and not is_archived
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
where screen_id is not null and screening_start_status is not null and not is_archived
group by screen_id;

-- ── theatre_rating_stats / screen_rating_stats: trigger-maintained, not a
--    view -- and the existing trigger only fires on writes to
--    visit_venue_ratings itself. Archiving a log with an *existing*
--    rating touches movie_logs, not visit_venue_ratings, so a naive fix
--    would leave those two tables stale until some unrelated rating
--    write happened to recompute them. Extracted the core aggregation
--    into a shared function both the existing trigger and a new one
--    (on movie_logs) call, each with "and not ml.is_archived" added to
--    both aggregation queries.

create or replace function public.recompute_theatre_and_screen_stats(p_theatre_id uuid, p_screen_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_screen_avg numeric; v_screen_cnt bigint;
  v_speaker_avg numeric; v_speaker_cnt bigint;
  v_ac_avg numeric; v_ac_cnt bigint;
  v_seat_avg numeric; v_seat_cnt bigint;
  v_overall_avg numeric;
  v_screens_avg numeric;
begin
  if p_screen_id is not null then
    select avg(vvr.screen_rating), count(vvr.screen_rating),
           avg(vvr.speaker_rating), count(vvr.speaker_rating),
           avg(vvr.ac_rating), count(vvr.ac_rating),
           avg(vvr.seat_rating), count(vvr.seat_rating)
      into v_screen_avg, v_screen_cnt, v_speaker_avg, v_speaker_cnt,
           v_ac_avg, v_ac_cnt, v_seat_avg, v_seat_cnt
    from public.visit_venue_ratings vvr
    join public.movie_logs ml on ml.id = vvr.movie_log_id
    where ml.screen_id = p_screen_id and not ml.is_archived;

    select avg(x) into v_overall_avg
    from unnest(array[v_screen_avg, v_speaker_avg, v_ac_avg, v_seat_avg]) as x
    where x is not null;

    insert into public.screen_rating_stats (screen_id, categories, overall_avg, computed_at)
    values (
      p_screen_id,
      jsonb_build_object(
        'screen_rating', jsonb_build_object('avg', v_screen_avg, 'count', v_screen_cnt),
        'speaker_rating', jsonb_build_object('avg', v_speaker_avg, 'count', v_speaker_cnt),
        'ac_rating', jsonb_build_object('avg', v_ac_avg, 'count', v_ac_cnt),
        'seat_rating', jsonb_build_object('avg', v_seat_avg, 'count', v_seat_cnt)
      ),
      v_overall_avg,
      timezone('utc', now())
    )
    on conflict (screen_id) do update
      set categories = excluded.categories,
          overall_avg = excluded.overall_avg,
          computed_at = excluded.computed_at;

    update public.screens set stats_dirty = false where id = p_screen_id;
  end if;

  if p_theatre_id is not null then
    select avg(vvr.screen_rating), count(vvr.screen_rating),
           avg(vvr.speaker_rating), count(vvr.speaker_rating),
           avg(vvr.ac_rating), count(vvr.ac_rating),
           avg(vvr.seat_rating), count(vvr.seat_rating)
      into v_screen_avg, v_screen_cnt, v_speaker_avg, v_speaker_cnt,
           v_ac_avg, v_ac_cnt, v_seat_avg, v_seat_cnt
    from public.visit_venue_ratings vvr
    join public.movie_logs ml on ml.id = vvr.movie_log_id
    where ml.theatre_id = p_theatre_id and not ml.is_archived;

    select avg(x) into v_overall_avg
    from unnest(array[v_screen_avg, v_speaker_avg, v_ac_avg, v_seat_avg]) as x
    where x is not null;

    select avg(srs.overall_avg) into v_screens_avg
    from public.screen_rating_stats srs
    join public.screens s on s.id = srs.screen_id
    where s.theatre_id = p_theatre_id and srs.overall_avg is not null;

    insert into public.theatre_rating_stats (theatre_id, overall, overall_avg, screens_avg, computed_at)
    values (
      p_theatre_id,
      jsonb_build_object(
        'screen_rating', jsonb_build_object('avg', v_screen_avg, 'count', v_screen_cnt),
        'speaker_rating', jsonb_build_object('avg', v_speaker_avg, 'count', v_speaker_cnt),
        'ac_rating', jsonb_build_object('avg', v_ac_avg, 'count', v_ac_cnt),
        'seat_rating', jsonb_build_object('avg', v_seat_avg, 'count', v_seat_cnt)
      ),
      v_overall_avg,
      v_screens_avg,
      timezone('utc', now())
    )
    on conflict (theatre_id) do update
      set overall = excluded.overall,
          overall_avg = excluded.overall_avg,
          screens_avg = excluded.screens_avg,
          computed_at = excluded.computed_at;

    update public.theatres set stats_dirty = false where id = p_theatre_id;
  end if;
end;
$$;

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

  perform public.recompute_theatre_and_screen_stats(v_theatre_id, v_screen_id);

  return coalesce(new, old);
end;
$$;

-- New trigger: recomputes when a log's is_archived (or, on the rarer
-- edit that moves a log to a different venue, theatre_id/screen_id)
-- changes -- covers both the OLD and NEW venue in case it moved, not
-- just the current one.
create or replace function public.movie_logs_recompute_venue_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_theatre_and_screen_stats(old.theatre_id, old.screen_id);
  if new.theatre_id is distinct from old.theatre_id or new.screen_id is distinct from old.screen_id then
    perform public.recompute_theatre_and_screen_stats(new.theatre_id, new.screen_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_logs_recompute_venue_stats on public.movie_logs;
create trigger trg_movie_logs_recompute_venue_stats
after update of is_archived, theatre_id, screen_id on public.movie_logs
for each row
when (
  old.is_archived is distinct from new.is_archived
  or old.theatre_id is distinct from new.theatre_id
  or old.screen_id is distinct from new.screen_id
)
execute function public.movie_logs_recompute_venue_stats();
