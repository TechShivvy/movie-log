-- Phase 2 of plan.md: notifications for follow/request events, with
-- Supabase Realtime so a client can subscribe directly instead of
-- polling. Rows are only ever written by the two triggers below
-- (security definer) -- authenticated gets select/update (mark-read)
-- only, never insert/delete, so a client can't forge a notification for
-- itself or spam someone else's feed.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  -- set null, not cascade: a notification about an actor who has since
  -- deleted their account should still exist (same "anonymized, not
  -- gone" reasoning as public movie_logs -- see 20260813000001) rather
  -- than vanishing retroactively.
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('follow_request', 'follow_accepted', 'new_follower')),
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_notifications_recipient
  on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_id) where read = false;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = recipient_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (auth.uid() is not null and (select auth.uid()) = recipient_id)
with check (auth.uid() is not null and (select auth.uid()) = recipient_id);

-- New tables start with zero grants (default privileges revoked
-- project-wide in 20260710000002) -- explicit grant required, and no
-- insert/delete for authenticated on purpose: rows come only from the
-- triggers below.
revoke all on public.notifications from anon, authenticated;
grant select, update on public.notifications to authenticated;

-- notify_on_follow_change: covers both the initial INSERT (instant-accept
-- on a public account -> new_follower; pending on followers_only/private
-- -> follow_request) and the pending->accepted UPDATE (-> follow_accepted,
-- to the original follower). A block-severed DELETE never reaches this --
-- there's nothing worth notifying about there.
create or replace function public.notify_on_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type)
    values (
      new.followee_id, new.follower_id,
      case new.status when 'accepted' then 'new_follower' else 'follow_request' end
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.follower_id, new.followee_id, 'follow_accepted');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_follows_notify on public.follows;
create trigger trg_follows_notify
after insert or update on public.follows
for each row execute function public.notify_on_follow_change();

-- Realtime: lets a client subscribe directly (RLS-gated the same as any
-- other read, notifications_select_own) instead of polling GET
-- /notifications. Guarded -- ADD TABLE errors if already a member,
-- and this migration may run again against a project that already has it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
