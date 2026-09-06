-- User blocking, done properly: a block should never be observable by the
-- blocked party. Two gaps closed here, both found while wiring the actual
-- Block button up on the frontend (until now `useBlockUser`/POST+DELETE
-- /public/blocks/{username} existed with zero UI callers):
--
--   1. can_view_user_content (20260811000012) deliberately didn't check
--      blocks, on the documented assumption that GET /users/{username}
--      always 404'd first for a blocked pair. That 404 is going away (see
--      routers/public_profile.py) in favor of a ghost profile — the
--      blocker's real profile shell, zero visible content, same as a
--      private account looks to any other stranger — so this function has
--      to become the actual enforcement point, not a function that relies
--      on its one caller pre-filtering for it. It's also reused by
--      list_followers/list_following and every content RPC (feed, movie
--      pages, log-by-id lookups) — fixing it here closes all of those at
--      once, not just the profile route.
--   2. get_public_profile_by_username's `is_blocked` output is symmetric
--      (true for either party) and was being returned as-is in the
--      GET /users/{username} JSON body — directly visible in a browser's
--      network tab to the blocked party, defeating the entire point.
--      Replaced with `is_blocking`: caller-directional (true only when
--      *the caller* is the one who placed the block), which is exactly
--      the one bit the UI legitimately needs (so the blocker sees
--      "Unblock" instead of "Block" on a profile they've blocked) and is
--      safe to expose because it's always false for the blocked party —
--      they never placed the block themselves.

-- can_view_user_content: add the block check that was previously left to
-- the profile route's 404. auth.uid() = p_target still short-circuits to
-- true first (you can always see your own content), same as before.
create or replace function public.can_view_user_content(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null and auth.uid() = p_target then true
    when exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_target)
         or (b.blocker_id = p_target and b.blocked_id = auth.uid())
    ) then false
    else coalesce((
      select case us.account_visibility
        when 'public' then true
        when 'private' then false
        when 'followers_only' then exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followee_id = p_target
            and f.status = 'accepted'
        )
        else false
      end
      from public.user_settings us
      where us.user_id = p_target
    ), false)
  end;
$$;

-- Return-type change (is_blocked -> is_blocking) — CREATE OR REPLACE can't
-- do that in place, same reasoning as banner_image's own drop-first note.
drop function if exists public.get_public_profile_by_username(text);
create function public.get_public_profile_by_username(p_username text)
returns table (
  user_id uuid, username text, display_name text, bio text,
  account_visibility text, avatar_path text, banner_path text, profile_links jsonb,
  is_blocking boolean, can_view_content boolean
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
    public.can_view_user_content(us.user_id) as can_view_content
  from public.user_settings us
  where lower(us.username) = lower(p_username)
  limit 1;
$$;
revoke all on function public.get_public_profile_by_username(text) from public;
grant execute on function public.get_public_profile_by_username(text) to anon, authenticated;

-- list_my_blocks: the one piece blocking (no pun intended) a "Blocked
-- accounts" settings screen — POST/DELETE /public/blocks/{username}
-- already existed, nothing to list them with. blocks_select_own (RLS,
-- 20260811000012) already scopes reads to the caller's own rows as
-- blocker; security definer here only to join user_settings across users,
-- same reasoning as list_followers/list_following.
create or replace function public.list_my_blocks(p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, username text, display_name text, avatar_path text, blocked_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select bu.user_id, bu.username, bu.display_name, bu.avatar_path, b.created_at
  from public.blocks b
  join public.user_settings bu on bu.user_id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
  limit p_limit offset p_offset;
$$;
revoke all on function public.list_my_blocks(int, int) from public;
grant execute on function public.list_my_blocks(int, int) to authenticated;
