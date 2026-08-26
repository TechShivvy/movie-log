-- movie_log_comments_view only ever joined `username` from user_settings
-- -- display_name/avatar_path were never selected here at all, unlike
-- every other author-facing view in this codebase
-- (public_movie_log_entries, feed_entries, likes_lists's two views —
-- e.g. 20260820000003_likes_lists.sql), which all already select
-- username/display_name/avatar_path together. Genuine SQL-level gap, not
-- a response_model-stripping issue like 20260824000001's fix for
-- MovieLog: the data was never joined into the view in the first place,
-- so comments always fell back to a bare username.
--
-- Unlike public_movie_log_entries's author fields (case when
-- ml.visibility = 'public' then ... else null end, to protect an
-- anonymous log's author), a commenter's own identity isn't subject to
-- that anonymity rule -- username is already selected unconditionally
-- here (a comment itself has no visibility tier of its own, only the
-- gate on which rows are visible at all, applied in the WHERE clause
-- below), so display_name/avatar_path are added the same unconditional
-- way, matching username's own treatment exactly.
--
-- Column list otherwise matches the live view exactly (confirmed via
-- pg_get_viewdef against the linked project, not reconstructed from
-- migration history -- liked_by_caller was added by a later migration
-- (20260813000021) than this view's original definition
-- (20260813000018), easy to miss by only reading the one file).
--
-- display_name/avatar_path are appended at the very end rather than
-- placed right after username -- CREATE OR REPLACE VIEW can only add
-- columns after the existing set, it can't insert into or reorder the
-- middle of one (confirmed live: doing it the "next to username" way
-- first failed with "cannot change name of view column
-- \"parent_comment_id\" to \"display_name\""). Column order is purely
-- positional in Postgres and irrelevant to PostgREST's JSON output either
-- way, so this has no effect on the API response shape.
create or replace view public.movie_log_comments_view as
select
  c.id, c.movie_log_id, c.user_id, us.username,
  c.parent_comment_id, c.text, c.like_count, c.edited_at, c.deleted_at, c.created_at, c.updated_at,
  exists (
    select 1 from public.comment_likes cl
    where cl.comment_id = c.id and cl.user_id = auth.uid()
  ) as liked_by_caller,
  us.display_name, us.avatar_path
from public.movie_log_comments c
left join public.user_settings us on us.user_id = c.user_id
join public.movie_logs ml on ml.id = c.movie_log_id
where (ml.visibility in ('public', 'anonymous') and not ml.is_archived) or ml.user_id = auth.uid();

revoke all on public.movie_log_comments_view from anon, authenticated;
grant select on public.movie_log_comments_view to anon, authenticated;
