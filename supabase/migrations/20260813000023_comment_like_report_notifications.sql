-- Phase 5 of plan.md: comments/likes existed with no notification at all
-- — the notifications.type check only ever had the three follow-related
-- values, and no trigger existed for movie_log_comments/movie_log_likes/
-- comment_likes. Closes that gap the same way follows already do it:
-- DB triggers only (see 20260813000003_notifications.sql for the
-- established pattern), no new RLS (notifications_select_own/_update_own
-- already cover these rows, table-level grants already cover the new
-- columns), no Realtime beyond the existing notifications publication —
-- comment threads refresh on re-fetch, not live-push; likes are
-- high-volume/low-value to push live and stay out of Realtime entirely.
--
-- A fifth type, report_resolved, is unrelated to comments/likes but was
-- flagged as the one other genuine "nothing pings the user today" gap
-- while auditing this: a report's own status flipping open -> reviewed/
-- dismissed never notified the reporter who filed it.

-- Real per-type FK target columns, not one generic (entity_type, entity_id)
-- pair -- gives the frontend a real deep-link id with no extra lookup,
-- and lets Postgres enforce a notification never outlives the thing it
-- points at (on delete cascade each). At most one is set per row,
-- depending on type; all three stay null for the pre-existing
-- follow_request/follow_accepted/new_follower types.
alter table public.notifications
  add column if not exists movie_log_id uuid references public.movie_logs(id) on delete cascade,
  add column if not exists comment_id uuid references public.movie_log_comments(id) on delete cascade,
  add column if not exists report_id uuid references public.reports(id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow_request', 'follow_accepted', 'new_follower',
    'new_comment', 'comment_reply', 'log_like', 'comment_like', 'report_resolved'
  ));

-- notify_on_comment_insert: a top-level comment notifies the log's
-- owner (new_comment); a reply notifies the parent comment's own author
-- (comment_reply), not the log owner again -- avoids double-notifying
-- the log owner once for the top-level thread and again for every reply
-- underneath it. Skips a null recipient (author already anonymized via
-- account deletion) and self-notification (commenting on your own log,
-- or replying to your own comment) either way.
create or replace function public.notify_on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
begin
  if new.parent_comment_id is null then
    select ml.user_id into v_recipient from public.movie_logs ml where ml.id = new.movie_log_id;
    if v_recipient is not null and v_recipient <> new.user_id then
      insert into public.notifications (recipient_id, actor_id, type, movie_log_id, comment_id)
      values (v_recipient, new.user_id, 'new_comment', new.movie_log_id, new.id);
    end if;
  else
    select c.user_id into v_recipient from public.movie_log_comments c where c.id = new.parent_comment_id;
    if v_recipient is not null and v_recipient <> new.user_id then
      insert into public.notifications (recipient_id, actor_id, type, movie_log_id, comment_id)
      values (v_recipient, new.user_id, 'comment_reply', new.movie_log_id, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_log_comments_notify on public.movie_log_comments;
create trigger trg_movie_log_comments_notify
after insert on public.movie_log_comments
for each row execute function public.notify_on_comment_insert();

create or replace function public.notify_on_log_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
begin
  select ml.user_id into v_recipient from public.movie_logs ml where ml.id = new.movie_log_id;
  if v_recipient is not null and v_recipient <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, movie_log_id)
    values (v_recipient, new.user_id, 'log_like', new.movie_log_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_log_likes_notify on public.movie_log_likes;
create trigger trg_movie_log_likes_notify
after insert on public.movie_log_likes
for each row execute function public.notify_on_log_like();

create or replace function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_log_id uuid;
begin
  select c.user_id, c.movie_log_id into v_recipient, v_log_id
  from public.movie_log_comments c where c.id = new.comment_id;
  if v_recipient is not null and v_recipient <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, movie_log_id, comment_id)
    values (v_recipient, new.user_id, 'comment_like', v_log_id, new.comment_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comment_likes_notify on public.comment_likes;
create trigger trg_comment_likes_notify
after insert on public.comment_likes
for each row execute function public.notify_on_comment_like();

-- report_resolved: fires on the existing admin-triage UPDATE (see
-- routers/reports.py's PATCH, which sets status/reviewed_by/reviewed_at
-- together). actor_id is deliberately left null -- an admin action isn't
-- attributed to a specific admin identity in the reporter-facing
-- notification, same "institutional, not personal" reasoning report
-- triage already keeps internal.
create or replace function public.notify_on_report_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, report_id)
  values (new.reporter_user_id, null, 'report_resolved', new.id);
  return new;
end;
$$;

drop trigger if exists trg_reports_notify_resolved on public.reports;
create trigger trg_reports_notify_resolved
after update on public.reports
for each row
when (old.status = 'open' and new.status in ('reviewed', 'dismissed'))
execute function public.notify_on_report_resolved();
