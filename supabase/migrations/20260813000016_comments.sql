-- Phase 2 of plan.md: comments, one level of replies. Modeled on the
-- *behavior* of threaded discussion under a post, not copied
-- terminology or mechanics from any specific platform -- no upvote/
-- downvote (see the likes migration next), no infinite nesting, no
-- literal "[deleted]" sentinel (reuses the same nullable-timestamp
-- pattern movie_logs.edited_at already established, applied here to
-- both editing *and* deleting).

create table if not exists public.movie_log_comments (
  id uuid primary key default gen_random_uuid(),
  movie_log_id uuid not null references public.movie_logs(id) on delete cascade,
  -- set null, not cascade: every comment was necessarily made on an
  -- already-public/anonymous-visible log, so unlike movie_logs itself
  -- there's no "private comment" tier needing pre-deletion -- all of a
  -- deleted user's comments survive anonymized, same treatment the log
  -- content itself already gets.
  user_id uuid references auth.users(id) on delete set null,
  parent_comment_id uuid references public.movie_log_comments(id) on delete cascade,
  text text,
  like_count int not null default 0,
  edited_at timestamptz,
  -- Non-null means the text has been cleared -- by the author choosing
  -- to remove it. The row stays either way so replies underneath it
  -- never orphan; the frontend decides how to render a cleared comment,
  -- not a backend-dictated string.
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- CASE + explicit boolean result, not "deleted_at is not null or
  -- btrim(text) <> ''" -- that form was tried and caught live earlier in
  -- this project (movie_logs' own punctuality-delta constraints,
  -- migration 20260813000010): btrim(text) on a NULL text evaluates to
  -- NULL, not FALSE, and a plain "false or NULL" is still NULL, which a
  -- CHECK constraint treats as satisfied rather than rejecting.
  constraint movie_log_comments_text_or_deleted check (
    case
      when deleted_at is not null then true
      else btrim(coalesce(text, '')) <> ''
    end
  )
);

create index if not exists idx_movie_log_comments_log on public.movie_log_comments (movie_log_id, created_at);
create index if not exists idx_movie_log_comments_parent on public.movie_log_comments (parent_comment_id);

drop trigger if exists trg_movie_log_comments_updated_at on public.movie_log_comments;
create trigger trg_movie_log_comments_updated_at
before update on public.movie_log_comments
for each row
execute function public.set_updated_at_timestamp();

-- Same edited_at precision movie_logs.edited_at already has: set only
-- when the text itself actually changes, not on every row touch (the
-- account-deletion user_id nulling is exactly the kind of non-content
-- write this must not flag as an edit).
create or replace function public.mark_comment_edited()
returns trigger
language plpgsql
as $$
begin
  if new.text is distinct from old.text then
    new.edited_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_log_comments_mark_edited on public.movie_log_comments;
create trigger trg_movie_log_comments_mark_edited
before update on public.movie_log_comments
for each row
execute function public.mark_comment_edited();

-- Enforces one level of replies: a comment may only be a reply to a
-- top-level comment, never to another reply. Deliberately shallower
-- than infinite nesting.
create or replace function public.check_comment_reply_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_comment_id is not null then
    if exists (
      select 1 from public.movie_log_comments p
      where p.id = new.parent_comment_id and p.parent_comment_id is not null
    ) then
      raise exception 'cannot reply to a reply — one level of replies only';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_log_comments_check_depth on public.movie_log_comments;
create trigger trg_movie_log_comments_check_depth
before insert on public.movie_log_comments
for each row
execute function public.check_comment_reply_depth();

alter table public.movie_log_comments enable row level security;

-- Visible to anyone who can currently see the underlying log (its own
-- visibility already gates that — public/anonymous, not archived, same
-- rule public_movie_log_entries already applies) or the log's own owner.
drop policy if exists "movie_log_comments_select_visible" on public.movie_log_comments;
create policy "movie_log_comments_select_visible"
on public.movie_log_comments
for select
to anon, authenticated
using (
  exists (
    select 1 from public.movie_logs ml
    where ml.id = movie_log_comments.movie_log_id
      and (
        (ml.visibility in ('public', 'anonymous') and not ml.is_archived)
        or ml.user_id = auth.uid()
      )
  )
);

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
  )
);

-- Own comments only, for editing text or soft-deleting (clearing it) — same call either way.
drop policy if exists "movie_log_comments_update_own" on public.movie_log_comments;
create policy "movie_log_comments_update_own"
on public.movie_log_comments
for update
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id)
with check (auth.uid() is not null and (select auth.uid()) = user_id);

revoke all on public.movie_log_comments from anon, authenticated;
grant select on public.movie_log_comments to anon, authenticated;
grant insert, update on public.movie_log_comments to authenticated;
