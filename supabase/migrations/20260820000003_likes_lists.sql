-- GET .../likes for both movie_logs and comments: neither existed before
-- (only POST/DELETE .../like, and an aggregate like_count). Both
-- movie_log_likes and comment_likes' own RLS only lets a caller read
-- their *own* like rows (movie_log_likes_select_own /
-- comment_likes_select_own, migration 20260813000020) — enough for
-- liked_by_caller, not enough to list who liked something. Same fix
-- shape as public_movie_log_entries/movie_log_comments_view: a security-
-- definer view that repeats the target's own visibility gate explicitly,
-- rather than a raw RLS-scoped select.
--
-- Gate is copied verbatim from movie_log_comments_view (migration
-- 20260813000018): (log is currently public/anonymous and not archived)
-- or (the log belongs to the caller) — same "whoever can see the log can
-- see its own comments" reasoning applies identically to "whoever can
-- see the log can see its likers". Deliberately does NOT anonymize a
-- liker's own identity even on an anonymous-visibility log — anonymous
-- hides who *wrote* the log, not who liked someone else's content.
create or replace view public.movie_log_likes_view as
select
  mll.movie_log_id, mll.user_id, us.username, us.display_name, us.avatar_path,
  mll.created_at as liked_at
from public.movie_log_likes mll
join public.movie_logs ml on ml.id = mll.movie_log_id
left join public.user_settings us on us.user_id = mll.user_id
where (ml.visibility in ('public', 'anonymous') and not ml.is_archived) or ml.user_id = auth.uid();

revoke all on public.movie_log_likes_view from anon, authenticated;
grant select on public.movie_log_likes_view to anon, authenticated;

-- Same gate, one hop further: a comment's own visibility is entirely
-- inherited from its parent log (movie_log_comments has no visibility
-- column of its own), same join movie_log_comments_view already does.
create or replace view public.comment_likes_view as
select
  cl.comment_id, cl.user_id, us.username, us.display_name, us.avatar_path,
  cl.created_at as liked_at
from public.comment_likes cl
join public.movie_log_comments c on c.id = cl.comment_id
join public.movie_logs ml on ml.id = c.movie_log_id
left join public.user_settings us on us.user_id = cl.user_id
where (ml.visibility in ('public', 'anonymous') and not ml.is_archived) or ml.user_id = auth.uid();

revoke all on public.comment_likes_view from anon, authenticated;
grant select on public.comment_likes_view to anon, authenticated;
