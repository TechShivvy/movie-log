-- Phase 4 of plan.md: make the profile lookup and search block-aware, and
-- add followers/following list RPCs, now that follows/blocks/
-- can_view_user_content exist (migration 20260811000012).

-- get_public_profile_by_username: adds is_blocked (either direction) and
-- can_view_content (via can_view_user_content) to what Phase 1's version
-- returned. The router (routers/public_profile.py) 404s on is_blocked
-- before ever looking at can_view_content, and uses can_view_content
-- (not account_visibility == 'public') to decide whether to fetch logs -
-- replacing the Phase 1 placeholder that treated followers_only the same
-- as private. Return shape changed, so drop+create.
drop function if exists public.get_public_profile_by_username(text);
create function public.get_public_profile_by_username(p_username text)
returns table (
  user_id uuid, username text, display_name text, bio text,
  account_visibility text, avatar_path text, profile_links jsonb,
  is_blocked boolean, can_view_content boolean
)
language sql stable security definer
set search_path = public
as $$
  select
    us.user_id, us.username, us.display_name, us.bio,
    us.account_visibility, us.avatar_path, us.profile_links,
    exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = us.user_id)
         or (b.blocker_id = us.user_id and b.blocked_id = auth.uid())
    ) as is_blocked,
    public.can_view_user_content(us.user_id) as can_view_content
  from public.user_settings us
  where lower(us.username) = lower(p_username)
  limit 1;
$$;
revoke all on function public.get_public_profile_by_username(text) from public;
grant execute on function public.get_public_profile_by_username(text) to anon, authenticated;

-- search_public_users: excludes any user in a block relationship with the
-- caller, either direction. When auth.uid() is null (anonymous caller),
-- the exists(...) never matches anything (both sides compare against
-- null), so this is a no-op filter for anonymous search -- unchanged
-- behavior there, matching the confirmed "regression check" requirement.
drop function if exists public.search_public_users(text, int);
create function public.search_public_users(p_query text, p_limit int default 20)
returns table (
  user_id uuid, username text, display_name text, bio text,
  account_visibility text, avatar_path text
)
language sql stable security definer
set search_path = public
as $$
  select us.user_id, us.username, us.display_name, us.bio, us.account_visibility, us.avatar_path
  from public.user_settings us
  where (us.username ilike '%' || p_query || '%' or us.display_name ilike '%' || p_query || '%')
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = us.user_id)
         or (b.blocker_id = us.user_id and b.blocked_id = auth.uid())
    )
  order by case when us.username ilike p_query || '%' then 0 else 1 end, us.username
  limit p_limit;
$$;
revoke all on function public.search_public_users(text, int) from public;
grant execute on function public.search_public_users(text, int) to anon, authenticated;

-- list_followers / list_following: gated by can_view_user_content, same as
-- the profile's own logs -- an outsider can't see who follows a private
-- account any more than they can see its logs.
create or replace function public.list_followers(p_username text, p_limit int default 20, p_offset int default 0)
returns table (user_id uuid, username text, display_name text, avatar_path text, followed_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select f_user.user_id, f_user.username, f_user.display_name, f_user.avatar_path, f.created_at
  from public.user_settings target
  join public.follows f on f.followee_id = target.user_id and f.status = 'accepted'
  join public.user_settings f_user on f_user.user_id = f.follower_id
  where lower(target.username) = lower(p_username)
    and public.can_view_user_content(target.user_id)
  order by f.created_at desc
  limit p_limit offset p_offset;
$$;

create or replace function public.list_following(p_username text, p_limit int default 20, p_offset int default 0)
returns table (user_id uuid, username text, display_name text, avatar_path text, followed_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select f_user.user_id, f_user.username, f_user.display_name, f_user.avatar_path, f.created_at
  from public.user_settings target
  join public.follows f on f.follower_id = target.user_id and f.status = 'accepted'
  join public.user_settings f_user on f_user.user_id = f.followee_id
  where lower(target.username) = lower(p_username)
    and public.can_view_user_content(target.user_id)
  order by f.created_at desc
  limit p_limit offset p_offset;
$$;

revoke all on function public.list_followers(text, int, int) from public;
revoke all on function public.list_following(text, int, int) from public;
grant execute on function public.list_followers(text, int, int) to anon, authenticated;
grant execute on function public.list_following(text, int, int) to anon, authenticated;
