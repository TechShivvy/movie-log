-- Completes Phase 2 of plan.md: a read view joining commenter usernames
-- (movie_log_comments.user_id has no direct FK to user_settings for
-- PostgREST to auto-embed through, both instead relate via auth.users —
-- a real join is needed, not resource embedding).
--
-- Views run with the *view owner's* rights on the underlying table, not
-- the querying role's (the same gotcha public_movie_log_entries/
-- feed_entries already have comments about) -- movie_log_comments'
-- own RLS (movie_log_comments_select_visible) would be silently
-- bypassed by this view if its condition weren't repeated here
-- explicitly, so it is, verbatim.
create or replace view public.movie_log_comments_view as
select
  c.id, c.movie_log_id, c.user_id, us.username, c.parent_comment_id,
  c.text, c.like_count, c.edited_at, c.deleted_at, c.created_at, c.updated_at
from public.movie_log_comments c
left join public.user_settings us on us.user_id = c.user_id
join public.movie_logs ml on ml.id = c.movie_log_id
where (ml.visibility in ('public', 'anonymous') and not ml.is_archived) or ml.user_id = auth.uid();

revoke all on public.movie_log_comments_view from anon, authenticated;
grant select on public.movie_log_comments_view to anon, authenticated;
