-- Completes the GET /movie-logs/{id} author-row fix: schemas/movie_logs.py's
-- MovieLog gained username/display_name/avatar_path fields, but
-- public_movie_log_entries (the view get_visible_movie_log falls back to
-- for a non-owner) only ever joined `username` — display_name/avatar_path
-- were never selected here at all, confirmed live via pg_get_viewdef
-- before writing this (feed_entries already has all three; this view was
-- the one left behind when it picked up `username` alone, likely written
-- before display_name/avatar_path existed as profile fields).
--
-- Same masking as username: null unless the log is currently `public` —
-- an `anonymous` log must keep the real author's identity fully
-- unreadable, not just their id/username, same guarantee liked_by_caller
-- and every other consumer of this view already relies on. Appended at
-- the end -- CREATE OR REPLACE VIEW can only add columns, never reorder
-- or remove existing ones.
create or replace view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at, ml.favorite_position,
  public.time_of_day_bucket(ml.watched_time) as time_of_day,
  ml.like_count,
  exists (
    select 1 from public.movie_log_likes mll
    where mll.movie_log_id = ml.id and mll.user_id = auth.uid()
  ) as liked_by_caller,
  ml.extraction_provider, ml.extraction_model, ml.extraction_edited,
  ml.visibility, ml.updated_at,
  case when ml.visibility = 'public' then us.display_name else null end as display_name,
  case when ml.visibility = 'public' then us.avatar_path else null end as avatar_path
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public') and not ml.is_archived;

grant select on public.public_movie_log_entries to anon, authenticated;
