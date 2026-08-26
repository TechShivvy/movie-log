-- Movie pages: "see logs/reviews of ours or other users linked to a
-- movie" needs movie_id to actually flow through the two views that
-- already carry everything else a review needs (public_movie_log_entries,
-- feed_entries) -- neither exposed it before this. Appended at the very
-- end of each select list, not next to the other columns where it'd
-- logically belong -- CREATE OR REPLACE VIEW rejects inserting a column
-- mid-list (same restriction already documented in 20260811000008).

create or replace view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public');

create or replace view public.feed_entries as
select
  ml.id, ml.user_id, us.username, us.display_name, us.avatar_path,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility = 'public'
  and auth.uid() is not null
  and ml.user_id <> auth.uid()
  and public.can_view_user_content(ml.user_id);

-- movie_rating_stats: unlike theatre/screen stats, this is a plain view,
-- not a trigger-maintained table -- one column (rating) aggregated over
-- an already-indexed FK, not four separate visit_venue_ratings columns
-- recomputed on every write. public_movie_log_entries already applies
-- the right visibility filter (anonymous/public only), so a private
-- log's rating never counts here, same as it never counts toward a
-- theatre's stats either.
create or replace view public.movie_rating_stats as
select
  movie_id,
  avg(rating) as avg_rating,
  count(rating) as rating_count
from public.public_movie_log_entries
where movie_id is not null and rating is not null
group by movie_id;

revoke all on public.movie_rating_stats from anon, authenticated;
grant select on public.movie_rating_stats to anon, authenticated;
