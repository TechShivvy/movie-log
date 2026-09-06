-- Two real gaps in GET /public/users/{username}, both found live during
-- frontend follow-request work, not guessed:
--
--   1. No caller_follow_status. The frontend had no backend signal for
--      "does the caller already have a pending/accepted relationship
--      with this account" — only is_blocking exists for the analogous
--      block-state question. It approximated one client-side (derived
--      from GET .../followers' own list — an accepted follow means the
--      caller's own id shows up in it), which looked fine on a public
--      account but is fundamentally broken on a private one: list_followers
--      gates the WHOLE list to nobody-but-the-owner for a private
--      account, confirmed live — a real, accepted follower still got
--      back `[]`, indistinguishable from never having followed at all.
--      A follower who gets accepted from the other side's own session
--      has no way to ever learn that on a fresh visit; worse, a stale
--      client-side guess can flip back to showing "Follow" on an
--      already-accepted relationship. Real backend support, same
--      is_blocking pattern (a plain scalar next to it, not a second
--      request), closes this for good.
--
--   2. No follower/following counts independent of the full list's own
--      privacy gate. Every mainstream social app (Instagram included)
--      shows follower/following COUNTS on a private account you don't
--      follow — it's the full LIST that stays hidden, not the count.
--      This app had no equivalent: the frontend was deriving a "count"
--      from the same privacy-gated list, so a private account's stat
--      row read "0 · 0" to anyone who wasn't already an accepted
--      follower, regardless of the real numbers. follower_count/
--      following_count are plain counts, gated by nothing — list_followers/
--      list_following's own existing gating on the full list is
--      untouched by this migration.
drop function if exists public.get_public_profile_by_username(text);
create function public.get_public_profile_by_username(p_username text)
returns table (
  user_id uuid, username text, display_name text, bio text,
  account_visibility text, avatar_path text, banner_path text, profile_links jsonb,
  is_blocking boolean, can_view_content boolean,
  follower_count bigint, following_count bigint,
  caller_follow_status text
)
language sql stable security definer
set search_path = public
as $$
  select
    us.user_id, us.username, us.display_name, us.bio,
    us.account_visibility, us.avatar_path, us.banner_path, us.profile_links,
    exists (
      select 1 from public.blocks b
      where b.blocker_id = auth.uid() and b.blocked_id = us.user_id
    ) as is_blocking,
    public.can_view_user_content(us.user_id) as can_view_content,
    (
      select count(*) from public.follows f
      where f.followee_id = us.user_id and f.status = 'accepted'
    ) as follower_count,
    (
      select count(*) from public.follows f
      where f.follower_id = us.user_id and f.status = 'accepted'
    ) as following_count,
    -- 'none' covers both a genuinely nonexistent row and an anonymous
    -- caller (auth.uid() is null there, which never equality-matches a
    -- real follower_id) — same "no separate anonymous branch" shape
    -- is_blocking already uses just above.
    coalesce((
      select f.status from public.follows f
      where f.follower_id = auth.uid() and f.followee_id = us.user_id
    ), 'none') as caller_follow_status
  from public.user_settings us
  where lower(us.username) = lower(p_username)
  limit 1;
$$;
revoke all on function public.get_public_profile_by_username(text) from public;
grant execute on function public.get_public_profile_by_username(text) to anon, authenticated;
