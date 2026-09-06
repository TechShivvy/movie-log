-- Fixes a real bug in 20260813000016's RLS policies, found live: both
-- movie_log_comments_select_visible and _insert_visible queried
-- movie_logs directly inside their USING/WITH CHECK clauses, which runs
-- as the CALLING role -- scoped by that caller's own, much narrower
-- movie_logs RLS access (their own rows, plus rows from accounts they
-- follow with can_view_user_content). A `public`-visibility log's own
-- author's *account* can still be `private` (account_visibility and a
-- single log's visibility are independent) -- public_movie_log_entries
-- correctly shows the log anyway (that's the whole point of the anon-
-- readable view), but a raw movie_logs query under the commenter's own
-- RLS could not see that same row at all, so the policy silently failed
-- for a case the app layer's own pre-check (is_movie_log_reportable,
-- via that same view) had already confirmed should work — a genuine
-- caller commenting on a genuinely public log got rejected.
--
-- Fixed with a security-definer helper, same shape as
-- can_view_user_content: bypasses the caller's own RLS restriction on
-- movie_logs, checking only the log's own visibility/archive state,
-- which is the only thing that should matter here.

create or replace function public.is_log_commentable(p_movie_log_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.movie_logs ml
    where ml.id = p_movie_log_id
      and ml.visibility in ('public', 'anonymous')
      and not ml.is_archived
  );
$$;

revoke all on function public.is_log_commentable(uuid) from public;
grant execute on function public.is_log_commentable(uuid) to anon, authenticated;

-- Same reasoning for the block check: needs the log's real author
-- (public visibility only), independent of the caller's own RLS access
-- to that row.
create or replace function public.commentable_log_is_blocked(p_movie_log_id uuid, p_caller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select ml.visibility = 'public' and public.is_blocked_pair(p_caller, ml.user_id)
    from public.movie_logs ml
    where ml.id = p_movie_log_id
  ), false);
$$;

revoke all on function public.commentable_log_is_blocked(uuid, uuid) from public;
grant execute on function public.commentable_log_is_blocked(uuid, uuid) to authenticated;

drop policy if exists "movie_log_comments_select_visible" on public.movie_log_comments;
create policy "movie_log_comments_select_visible"
on public.movie_log_comments
for select
to anon, authenticated
using (
  public.is_log_commentable(movie_log_id)
  or exists (
    select 1 from public.movie_logs ml
    where ml.id = movie_log_comments.movie_log_id and ml.user_id = auth.uid()
  )
);

drop policy if exists "movie_log_comments_insert_visible" on public.movie_log_comments;
create policy "movie_log_comments_insert_visible"
on public.movie_log_comments
for insert
to authenticated
with check (
  auth.uid() is not null and (select auth.uid()) = user_id
  and public.is_log_commentable(movie_log_id)
  and not public.commentable_log_is_blocked(movie_log_id, auth.uid())
);
