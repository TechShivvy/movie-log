-- Phase 2 of plan.md: one-directional follow relationships (follower/
-- followee, Instagram/Twitter-style, not a mutual "friends" model) and
-- blocking.
--
-- follows' RLS is genuinely new for this schema: every prior relationship
-- table (visit_venue_ratings, reports) has exactly one owner column, so one
-- "auth.uid() = owner_id" predicate covered select/insert/update/delete
-- alike. follows has two different-privilege columns instead -- the
-- follower creates the row, but only the followee may accept it -- so each
-- policy below grants a different subset of (follower, followee) than the
-- last, spelled out per-policy rather than reused.
--
-- blocks' RLS is deliberately asymmetric in a different way: only the
-- blocker gets any access to the row at all. The blocked party never reads
-- a block row directly (no "am I blocked" query is exposed) -- they only
-- ever observe a block's effects (404 on the blocker's profile, absence
-- from search, a rejected follow attempt), matching how blocking works on
-- every mainstream social app.

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (follower_id, followee_id),
  constraint follows_no_self_follow check (follower_id <> followee_id)
);

create index if not exists idx_follows_followee_status on public.follows (followee_id, status);
create index if not exists idx_follows_follower_status on public.follows (follower_id, status);

drop trigger if exists trg_follows_updated_at on public.follows;
create trigger trg_follows_updated_at
before update on public.follows
for each row execute function public.set_updated_at_timestamp();

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

create index if not exists idx_blocks_blocked on public.blocks (blocked_id);

alter table public.follows enable row level security;
alter table public.blocks enable row level security;

-- Both parties can see a relationship they're part of (the followee needs
-- to see incoming pending requests; the follower needs to see their own
-- outgoing ones, pending or accepted).
drop policy if exists "follows_select_own_relationships" on public.follows;
create policy "follows_select_own_relationships"
on public.follows for select to authenticated
using (
  auth.uid() is not null
  and ((select auth.uid()) = follower_id or (select auth.uid()) = followee_id)
);

-- Only the follower may create the row -- you can only follow *as yourself*.
-- Whether it lands pending or accepted is decided by the API layer
-- (routers/follows.py, reading the target's account_visibility first), not
-- by this policy -- RLS only gates *who* may insert, not *which* status.
drop policy if exists "follows_insert_as_follower" on public.follows;
create policy "follows_insert_as_follower"
on public.follows for insert to authenticated
with check (auth.uid() is not null and (select auth.uid()) = follower_id);

-- Only the followee may transition pending -> accepted. Same division of
-- labor as the insert policy: RLS gates who, the router's own
-- status=eq.pending filter in the update call gates which transition.
drop policy if exists "follows_update_as_followee" on public.follows;
create policy "follows_update_as_followee"
on public.follows for update to authenticated
using (auth.uid() is not null and (select auth.uid()) = followee_id)
with check (auth.uid() is not null and (select auth.uid()) = followee_id);

-- Either party may delete: the follower unfollows, the followee removes a
-- follower or rejects a pending request -- same operation either way.
drop policy if exists "follows_delete_either_party" on public.follows;
create policy "follows_delete_either_party"
on public.follows for delete to authenticated
using (
  auth.uid() is not null
  and ((select auth.uid()) = follower_id or (select auth.uid()) = followee_id)
);

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own"
on public.blocks for select to authenticated
using (auth.uid() is not null and (select auth.uid()) = blocker_id);

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
on public.blocks for insert to authenticated
with check (auth.uid() is not null and (select auth.uid()) = blocker_id);

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own"
on public.blocks for delete to authenticated
using (auth.uid() is not null and (select auth.uid()) = blocker_id);

-- New tables start with zero grants (default privileges were revoked
-- project-wide in 20260710000002) -- explicit grant required.
revoke all on public.follows, public.blocks from anon, authenticated;
grant select, insert, update, delete on public.follows to authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- Block side effect: severs any existing follow relationship in either
-- direction. Security definer because it must delete rows regardless of
-- which side of the follow the two parties are on -- the same reason
-- recompute_venue_stats (migration 003) needs it, applied here for a
-- trigger instead of a stats aggregate.
create or replace function public.enforce_block_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists trg_blocks_sever_follows on public.blocks;
create trigger trg_blocks_sever_follows
after insert on public.blocks
for each row execute function public.enforce_block_side_effects();

-- Follow-vs-block guard: defense in depth behind the router's own
-- pre-check (which resolves the target and checks is_blocked before ever
-- attempting the insert) -- this only matters for direct PostgREST access
-- bypassing the API layer.
create or replace function public.check_no_block_before_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.follower_id and b.blocked_id = new.followee_id)
       or (b.blocker_id = new.followee_id and b.blocked_id = new.follower_id)
  ) then
    raise exception 'cannot follow: a block exists between these users';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_follows_check_block on public.follows;
create trigger trg_follows_check_block
before insert on public.follows
for each row execute function public.check_no_block_before_follow();

-- can_view_user_content: the one piece with no prior precedent in this
-- schema -- every later phase's content-gating (feed, followers/following
-- lists, the profile route itself) reuses this rather than re-deriving the
-- visibility logic. security definer because it must read follows/
-- user_settings across users, past follows' own "own relationships only"
-- select policy. Takes only the target -- the viewer comes from auth.uid()
-- itself, a session-level JWT claim unaffected by security-definer
-- nesting (same fact that already makes search_public_users/
-- get_public_profile_by_username work correctly as security definer).
-- Deliberately does not check blocks: followers_only/private content is
-- already unreachable by a blocked pair (a block deletes any accepted
-- follow row and the trigger above prevents a new one), and public content
-- being visible to a blocked pair is harmless because GET /users/{username}
-- 404s on is_blocked before ever consulting this function (Phase 4).
create or replace function public.can_view_user_content(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null and auth.uid() = p_target then true
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

revoke all on function public.can_view_user_content(uuid) from public;
grant execute on function public.can_view_user_content(uuid) to anon, authenticated;
