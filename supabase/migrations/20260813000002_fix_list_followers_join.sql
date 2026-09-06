-- Bug fix, found while setting up account-deletion test data (unrelated to
-- that feature): list_followers/list_following (migration 20260811000014)
-- INNER JOIN user_settings for the follower/followee side, which silently
-- drops anyone who has never set a username/display_name/bio/etc — a real,
-- reachable state (any newly signed-up user who follows someone before
-- ever touching their own profile), not an edge case. `f_user` becomes a
-- LEFT JOIN so a real accepted follow is never invisible just because the
-- other party hasn't set up their profile yet; FollowUser.username/etc are
-- already Optional (schemas/follows.py) so no API-shape change either.

create or replace function public.list_followers(p_username text, p_limit int default 20, p_offset int default 0)
returns table (user_id uuid, username text, display_name text, avatar_path text, followed_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select f.follower_id, f_user.username, f_user.display_name, f_user.avatar_path, f.created_at
  from public.user_settings target
  join public.follows f on f.followee_id = target.user_id and f.status = 'accepted'
  left join public.user_settings f_user on f_user.user_id = f.follower_id
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
  select f.followee_id, f_user.username, f_user.display_name, f_user.avatar_path, f.created_at
  from public.user_settings target
  join public.follows f on f.follower_id = target.user_id and f.status = 'accepted'
  left join public.user_settings f_user on f_user.user_id = f.followee_id
  where lower(target.username) = lower(p_username)
    and public.can_view_user_content(target.user_id)
  order by f.created_at desc
  limit p_limit offset p_offset;
$$;
