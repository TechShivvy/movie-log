-- Extends public_movie_log_entries with the two columns GET
-- /movie-logs/{id} needs when serving a non-owner viewing a currently
-- public/anonymous log through this view (services/supabase_rest.py's
-- get_visible_movie_log) — its response_model (schemas/movie_logs.MovieLog)
-- requires `updated_at` (no default; every other view consumer of this
-- table uses -> Any, not that response_model, so this gap never surfaced
-- before) and needs `visibility`'s real value rather than silently
-- falling back to the schema's own 'private' default, which would
-- misreport a genuinely public/anonymous row.
--
-- Column list matches the live view definition exactly (confirmed via
-- pg_get_viewdef against the linked project, not reconstructed from
-- migration history — the extraction_provider/model/edited columns were
-- added by 20260813000027 after this view's last full redefinition here,
-- easy to miss by only reading migration files). Appended at the very
-- end -- CREATE OR REPLACE VIEW can only add columns, never reorder or
-- remove existing ones.
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
  ml.visibility, ml.updated_at
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public') and not ml.is_archived;

grant select on public.public_movie_log_entries to anon, authenticated;
