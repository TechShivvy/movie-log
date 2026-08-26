-- Migration 007 (venue_overall_ratings_and_prefill_pref): two independent
-- additions.
--
-- 1. A single headline "overall" star number for both a theatre and a
--    screen (today theatre_rating_stats/screen_rating_stats only ever
--    stored the 4 separate category averages — screen/speaker/ac/seat —
--    with no blended scalar), plus a second theatre-level number:
--      - overall_avg:  mean of whichever category averages have data,
--                       computed from every visit tied to the
--                       theatre/screen (visit-weighted — a screen with 50
--                       visits pulls harder than one with 2).
--      - screens_avg (theatre only): mean of the theatre's own screens'
--                       own overall_avg, one vote per screen regardless
--                       of visit count. Deliberately a different number
--                       from overall_avg — lets a theatre page show both
--                       "how do visits here feel overall" and "are the
--                       screens themselves consistent with each other".
--    Neither is a new user input — both are computed from the same 4
--    category ratings visit_venue_ratings already collects, same as the
--    per-category averages always were. No schema change to
--    visit_venue_ratings itself.
--
-- 2. user_settings.prefill_repeat_visit: a client-side behavior toggle
--    for revisiting a theatre/screen already logged before. Off
--    (default): client should only *suggest* reusing the previous visit's
--    venue rating (tap to accept). On: client may fill the new log's
--    venue-rating fields from the most recent matching visit
--    automatically. The actual previous-visit data behind either mode
--    comes from GET /movie-logs?theatre_id=/screen_id=/movie= (see
--    routers/movie_logs.py), not from anything added here — this column
--    is only the user's stored preference between the two client
--    behaviors.

alter table public.theatre_rating_stats
  add column if not exists overall_avg numeric(2,1),
  add column if not exists screens_avg numeric(2,1);

alter table public.screen_rating_stats
  add column if not exists overall_avg numeric(2,1);

alter table public.user_settings
  add column if not exists prefill_repeat_visit boolean not null default false;

-- ── Extend the stats-compute trigger to also populate the two new columns.
--    Same trigger (fires after insert/update/delete on visit_venue_ratings),
--    just computing two more numbers alongside the existing per-category
--    jsonb. security definer / search_path unchanged from migration 004.

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
  v_screen_avg numeric; v_screen_cnt bigint;
  v_speaker_avg numeric; v_speaker_cnt bigint;
  v_ac_avg numeric; v_ac_cnt bigint;
  v_seat_avg numeric; v_seat_cnt bigint;
  v_overall_avg numeric;
  v_screens_avg numeric;
begin
  select theatre_id, screen_id into v_theatre_id, v_screen_id
  from public.movie_logs
  where id = v_movie_log_id;

  if v_screen_id is not null then
    select avg(vvr.screen_rating), count(vvr.screen_rating),
           avg(vvr.speaker_rating), count(vvr.speaker_rating),
           avg(vvr.ac_rating), count(vvr.ac_rating),
           avg(vvr.seat_rating), count(vvr.seat_rating)
      into v_screen_avg, v_screen_cnt, v_speaker_avg, v_speaker_cnt,
           v_ac_avg, v_ac_cnt, v_seat_avg, v_seat_cnt
    from public.visit_venue_ratings vvr
    join public.movie_logs ml on ml.id = vvr.movie_log_id
    where ml.screen_id = v_screen_id;

    -- Mean of whichever category averages actually have data — nulls
    -- excluded, not treated as 0 (a screen with only a seat_rating on
    -- file shouldn't have that dragged down by three phantom zeros).
    select avg(x) into v_overall_avg
    from unnest(array[v_screen_avg, v_speaker_avg, v_ac_avg, v_seat_avg]) as x
    where x is not null;

    insert into public.screen_rating_stats (screen_id, categories, overall_avg, computed_at)
    values (
      v_screen_id,
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

    update public.screens set stats_dirty = false where id = v_screen_id;
  end if;

  if v_theatre_id is not null then
    select avg(vvr.screen_rating), count(vvr.screen_rating),
           avg(vvr.speaker_rating), count(vvr.speaker_rating),
           avg(vvr.ac_rating), count(vvr.ac_rating),
           avg(vvr.seat_rating), count(vvr.seat_rating)
      into v_screen_avg, v_screen_cnt, v_speaker_avg, v_speaker_cnt,
           v_ac_avg, v_ac_cnt, v_seat_avg, v_seat_cnt
    from public.visit_venue_ratings vvr
    join public.movie_logs ml on ml.id = vvr.movie_log_id
    where ml.theatre_id = v_theatre_id;

    select avg(x) into v_overall_avg
    from unnest(array[v_screen_avg, v_speaker_avg, v_ac_avg, v_seat_avg]) as x
    where x is not null;

    -- Unweighted average of this theatre's own screens' own overall_avg.
    -- Reads screen_rating_stats, including the row this same function call
    -- may have just inserted/updated above (own writes are visible within
    -- the same transaction), so a rating change on one screen correctly
    -- shifts the theatre's screens_avg too, not just that screen's number.
    select avg(srs.overall_avg) into v_screens_avg
    from public.screen_rating_stats srs
    join public.screens s on s.id = srs.screen_id
    where s.theatre_id = v_theatre_id and srs.overall_avg is not null;

    insert into public.theatre_rating_stats (theatre_id, overall, overall_avg, screens_avg, computed_at)
    values (
      v_theatre_id,
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

    update public.theatres set stats_dirty = false where id = v_theatre_id;
  end if;

  return coalesce(new, old);
end;
$$;

-- ── Backfill: re-run the trigger above for every existing
--    visit_venue_ratings row, so any stats rows computed before this
--    migration get overall_avg/screens_avg filled in too, without
--    duplicating the aggregation logic in a second place. A bare
--    "set updated_at = updated_at" still fires trg_recompute_venue_stats
--    (AFTER UPDATE, no WHEN clause — runs regardless of whether any
--    column value actually changed); harmless no-op if the table is
--    still empty on a fresh project. ─────────────────────────────────
update public.visit_venue_ratings set updated_at = updated_at;
