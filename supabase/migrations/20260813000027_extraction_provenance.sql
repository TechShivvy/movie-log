-- Prompted directly: does a movie_log remember whether it was AI-extracted
-- (and via which model), vs entered fully manually, vs extracted then
-- edited before saving? Not previously tracked at all — POST /movie-
-- metadata/extract and POST /movie-logs were entirely separate calls with
-- no link between them. These three columns are client-asserted
-- provenance (same trust model as is_fdfs/arrival_status — the backend
-- doesn't independently verify them), set from the extract response's own
-- used_provider/used_model when the client chooses to.

alter table public.movie_logs
  add column if not exists extraction_provider text
    check (extraction_provider in ('openrouter', 'openai', 'gemini')),
  add column if not exists extraction_model text,
  add column if not exists extraction_edited boolean,
  add constraint movie_logs_extraction_pair_check
    check ((extraction_provider is null) = (extraction_model is null));

-- Surfaced on the public/feed views too, not just the owner's own GET
-- /movie-logs (which already gets these for free via select=* under RLS,
-- no view involved there) — this is meant to be visible small-text
-- attribution ("Extracted with Gemini"), not private metadata.
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
  ml.extraction_provider, ml.extraction_model, ml.extraction_edited
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
  public.time_of_day_bucket(ml.watched_time) as time_of_day,
  ml.like_count,
  exists (
    select 1 from public.movie_log_likes mll
    where mll.movie_log_id = ml.id and mll.user_id = auth.uid()
  ) as liked_by_caller,
  ml.extraction_provider, ml.extraction_model, ml.extraction_edited
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility = 'public'
  and not ml.is_archived
  and auth.uid() is not null
  and ml.user_id <> auth.uid()
  and public.can_view_user_content(ml.user_id);
