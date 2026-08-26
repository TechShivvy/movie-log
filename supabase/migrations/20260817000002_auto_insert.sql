-- Auto-insert after extraction: a profile-level default (skip review,
-- extraction goes straight into movie_logs), overridable per-request on
-- both single-item extraction and batch, and separately overridable by
-- bot integrations (Discord/Telegram have no UI to review/edit).

alter table public.user_settings
  add column if not exists auto_insert_extractions boolean not null default false;

-- Backend-only markers -- deliberately never added to movie_logs.
-- WRITABLE_FIELDS / MovieLogInput / MovieLogUpdate (schemas/movie_logs.py),
-- same server-managed, mass-assignment-proof posture as id/user_id/
-- created_at. extraction_batch_id is null for a single-/extract auto-
-- insert and for every ordinary manual log; it's set only when a batch
-- item auto-inserted -- see notify_on_movie_log_auto_insert below for why
-- that distinction matters for notifications specifically.
alter table public.movie_logs
  add column if not exists auto_inserted boolean not null default false,
  add column if not exists extraction_batch_id uuid references public.extraction_batches(id) on delete set null;

alter table public.notifications
  add column if not exists extraction_batch_id uuid references public.extraction_batches(id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow_request', 'follow_accepted', 'new_follower',
    'new_comment', 'comment_reply', 'log_like', 'comment_like', 'report_resolved',
    'auto_insert_complete', 'batch_extraction_complete'
  ));

-- auto_insert_complete: fires only for a *single*-extract auto-insert
-- (extraction_batch_id is null) -- a batch item's auto-insert is already
-- covered by the one batch_extraction_complete notification below, fired
-- once per batch. Without the extraction_batch_id is null guard, a
-- 20-item auto-inserting batch would produce 21 notifications (20 per-
-- item + 1 batch-level) for what the user experiences as one action.
-- actor_id null -- same "system/self" precedent notify_on_report_resolved
-- already established: the recipient IS the one who took the action,
-- there's no separate human actor to attribute this to.
create or replace function public.notify_on_movie_log_auto_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auto_inserted and new.extraction_batch_id is null then
    insert into public.notifications (recipient_id, actor_id, type, movie_log_id)
    values (new.user_id, null, 'auto_insert_complete', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_logs_auto_insert_notify on public.movie_logs;
create trigger trg_movie_logs_auto_insert_notify
after insert on public.movie_logs
for each row
execute function public.notify_on_movie_log_auto_insert();

-- batch_extraction_complete: fires exactly once, when a batch's status
-- leaves 'processing' -- regardless of whether every item succeeded
-- (batch-level 'completed' means "finished processing", not "zero
-- failures"; per-item status carries the real per-item outcome).
create or replace function public.notify_on_batch_extraction_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, extraction_batch_id)
  values (new.user_id, null, 'batch_extraction_complete', new.id);
  return new;
end;
$$;

drop trigger if exists trg_extraction_batches_notify on public.extraction_batches;
create trigger trg_extraction_batches_notify
after update on public.extraction_batches
for each row
when (old.status = 'processing' and new.status in ('completed', 'failed'))
execute function public.notify_on_batch_extraction_complete();

-- notifications_view: same view-owner-rights gotcha already documented
-- on this view's own definition (20260813000024_notifications_enriched_
-- view.sql) -- the recipient_id = auth.uid() filter below is what keeps
-- this join safe, not RLS (views run with the *owner's* rights). The
-- joined extraction_batches row is always "my own batch" by construction
-- (n.recipient_id was set from extraction_batches.user_id by the trigger
-- above), same reasoning already applied there to movie_logs/comments/
-- reports. New columns appended at the very end -- CREATE OR REPLACE
-- VIEW can only append, never insert/reorder existing column positions
-- (confirmed live: an earlier draft of this migration put the new
-- columns before read/created_at and failed with "cannot change name of
-- view column \"read\" to \"extraction_batch_id\"").
create or replace view public.notifications_view as
select
  n.id, n.recipient_id, n.actor_id,
  us.username as actor_username, us.avatar_path as actor_avatar_path,
  n.type,
  n.movie_log_id, ml.movie,
  n.comment_id, c.text as comment_preview,
  n.report_id, r.status as report_status,
  n.read, n.created_at,
  n.extraction_batch_id, eb.total_items as batch_total_items,
  eb.completed_items as batch_completed_items, eb.failed_items as batch_failed_items
from public.notifications n
left join public.user_settings us on us.user_id = n.actor_id
left join public.movie_logs ml on ml.id = n.movie_log_id
left join public.movie_log_comments c on c.id = n.comment_id
left join public.reports r on r.id = n.report_id
left join public.extraction_batches eb on eb.id = n.extraction_batch_id
where n.recipient_id = auth.uid();

revoke all on public.notifications_view from anon, authenticated;
grant select on public.notifications_view to authenticated;
