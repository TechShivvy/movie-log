-- Completes Phase 3 of plan.md: like_count everywhere a log/comment
-- appears, liked_by_caller only where someone *else's* content shows up
-- (public_movie_log_entries, feed_entries, movie_log_comments_view) —
-- the caller's own GET /movie-logs is always their own rows only, so
-- "did I like my own log" is a low-value edge case not worth the extra
-- column there. A scalar EXISTS subquery, not a table embed: auth.uid()
-- resolves correctly inside a view regardless of the view-owner-rights
-- gotcha (it's a session-level read, not a table permission check), but
-- embedding movie_log_likes as a *related table* would bypass its own
-- RLS the same way and leak the full liker list to anyone, not just
-- "did the viewer like it" — likes were designed to be readable only by
-- the liker themselves.

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
  ) as liked_by_caller
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
  ) as liked_by_caller
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility = 'public'
  and not ml.is_archived
  and auth.uid() is not null
  and ml.user_id <> auth.uid()
  and public.can_view_user_content(ml.user_id);

create or replace view public.movie_log_comments_view as
select
  c.id, c.movie_log_id, c.user_id, us.username, c.parent_comment_id,
  c.text, c.like_count, c.edited_at, c.deleted_at, c.created_at, c.updated_at,
  exists (
    select 1 from public.comment_likes cl
    where cl.comment_id = c.id and cl.user_id = auth.uid()
  ) as liked_by_caller
from public.movie_log_comments c
left join public.user_settings us on us.user_id = c.user_id
join public.movie_logs ml on ml.id = c.movie_log_id
where (ml.visibility in ('public', 'anonymous') and not ml.is_archived) or ml.user_id = auth.uid();
