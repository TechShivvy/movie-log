-- Phase 3 of plan.md: a single reaction, not a vote. No dislike/downvote
-- — matches Letterboxd's own model (this app's already-cited reference
-- point) and avoids the pile-on dynamics two-way voting invites on a
-- small app. Applies to both movie_logs and movie_log_comments.

alter table public.movie_logs
  add column if not exists like_count int not null default 0;

create table if not exists public.movie_log_likes (
  movie_log_id uuid not null references public.movie_logs(id) on delete cascade,
  -- Unlike authored content (a log, a comment), a like carries no content
  -- worth anonymizing-and-keeping once the liker's account is gone — it's
  -- simple engagement signal, removed cleanly rather than orphaned.
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (movie_log_id, user_id)
);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.movie_log_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (comment_id, user_id)
);

-- Trigger-maintained counters, not a COUNT(*) computed on read — avoids
-- an N+1 query per row when listing logs/comments, same reasoning that
-- already justified trigger-maintained venue stats over computing them
-- live. Much simpler than that trigger: a straight +1/-1.
create or replace function public.adjust_movie_log_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.movie_logs set like_count = like_count + 1 where id = new.movie_log_id;
    return new;
  else
    update public.movie_logs set like_count = greatest(like_count - 1, 0) where id = old.movie_log_id;
    return old;
  end if;
end;
$$;

drop trigger if exists trg_movie_log_likes_adjust_count on public.movie_log_likes;
create trigger trg_movie_log_likes_adjust_count
after insert or delete on public.movie_log_likes
for each row
execute function public.adjust_movie_log_like_count();

create or replace function public.adjust_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.movie_log_comments set like_count = like_count + 1 where id = new.comment_id;
    return new;
  else
    update public.movie_log_comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
    return old;
  end if;
end;
$$;

drop trigger if exists trg_comment_likes_adjust_count on public.comment_likes;
create trigger trg_comment_likes_adjust_count
after insert or delete on public.comment_likes
for each row
execute function public.adjust_comment_like_count();

alter table public.movie_log_likes enable row level security;
alter table public.comment_likes enable row level security;

-- Only the caller's own rows are readable (enough to compute
-- "liked_by_caller" per item) — no public "who liked this" list.
drop policy if exists "movie_log_likes_select_own" on public.movie_log_likes;
create policy "movie_log_likes_select_own"
on public.movie_log_likes
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "movie_log_likes_insert_own" on public.movie_log_likes;
create policy "movie_log_likes_insert_own"
on public.movie_log_likes
for insert
to authenticated
with check (
  auth.uid() is not null and (select auth.uid()) = user_id
  and public.is_log_commentable(movie_log_id)
  and not public.commentable_log_is_blocked(movie_log_id, auth.uid())
);

drop policy if exists "movie_log_likes_delete_own" on public.movie_log_likes;
create policy "movie_log_likes_delete_own"
on public.movie_log_likes
for delete
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "comment_likes_select_own" on public.comment_likes;
create policy "comment_likes_select_own"
on public.comment_likes
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
on public.comment_likes
for insert
to authenticated
with check (
  auth.uid() is not null and (select auth.uid()) = user_id
  and exists (
    select 1 from public.movie_log_comments c
    where c.id = comment_likes.comment_id
      and c.deleted_at is null
      and public.is_log_commentable(c.movie_log_id)
  )
);

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
on public.comment_likes
for delete
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

revoke all on public.movie_log_likes, public.comment_likes from anon, authenticated;
grant select, insert, delete on public.movie_log_likes to authenticated;
grant select, insert, delete on public.comment_likes to authenticated;
