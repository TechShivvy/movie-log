-- Completes Phase 2 of plan.md: a blocked pair shouldn't be able to
-- comment on each other's logs. Checking "have they blocked me" (not
-- just "have I blocked them") needs to run with elevated rights, same
-- reason can_view_user_content/get_public_profile_by_username already
-- do -- blocks RLS only lets the blocker read their own rows
-- (blocks_select_own), so a caller's own token structurally can't see
-- whether someone else has blocked *them*.
--
-- Only checked for `public` (attributed) logs -- for `anonymous` ones
-- the real author is unreadable to the caller by design (the whole
-- point of that visibility tier), so there's no author identity to
-- check a block against without breaking that guarantee. A deliberate
-- boundary, same shape as "block doesn't reach venue review lists"
-- already documented elsewhere in this project, not an oversight.
create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

revoke all on function public.is_blocked_pair(uuid, uuid) from public;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

drop policy if exists "movie_log_comments_insert_visible" on public.movie_log_comments;
create policy "movie_log_comments_insert_visible"
on public.movie_log_comments
for insert
to authenticated
with check (
  auth.uid() is not null and (select auth.uid()) = user_id
  and exists (
    select 1 from public.movie_logs ml
    where ml.id = movie_log_comments.movie_log_id
      and ml.visibility in ('public', 'anonymous') and not ml.is_archived
      and (
        ml.visibility = 'anonymous'
        or not public.is_blocked_pair(auth.uid(), ml.user_id)
      )
  )
);
