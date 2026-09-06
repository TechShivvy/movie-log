-- Tagged photos per movie log (up to 10), separate from the existing
-- single ticket_image_path column. Modeled on movie_log_comments'
-- visibility-gated SELECT (migration 20260813000016), not
-- visit_venue_ratings' — visit_venue_ratings stays owner-only even for a
-- public log (individual rows never surface, only the aggregate stats
-- do), but these photos ARE meant to be part of what a public/anonymous
-- log shows other people, same as its notes/rating/movie fields already
-- are.
--
-- The always-private ticket photo is untouched by this migration
-- (movie_logs.ticket_image_path, already excluded from
-- public_movie_log_entries) — this table is deliberately for everything
-- ELSE. The tag CHECK below has no 'ticket'-equivalent value on purpose:
-- as long as that stays true, no row in this table can ever represent a
-- ticket photo, which is what makes it safe to apply the same
-- visibility-gated SELECT policy to every row with no per-row exception.
-- Don't add a ticket-like tag value here without also reworking that
-- policy (and the matching storage policy below) to keep it owner-only.

create table if not exists public.movie_log_photos (
  id uuid primary key default gen_random_uuid(),
  movie_log_id uuid not null references public.movie_logs(id) on delete cascade,
  -- set null, not cascade, on account deletion — matches
  -- movie_logs.user_id / visit_venue_ratings.user_id (migration
  -- 20260813000001): a surviving public/anonymous log's photos survive
  -- anonymized right along with it, not vanish because the uploader's
  -- account is gone.
  user_id uuid references auth.users(id) on delete set null,
  storage_path text not null,
  tag text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint movie_log_photos_tag_check
    check (tag in ('food', 'theatre', 'ambiance', 'outside', 'inside', 'other'))
);

create index if not exists idx_movie_log_photos_log
  on public.movie_log_photos (movie_log_id, created_at);

alter table public.movie_log_photos enable row level security;

-- Max 10 photos per log. The router pre-checks this with a specific
-- PHOTO_LIMIT_REACHED error in the common case; this trigger is the real
-- backstop — a race between two concurrent uploads, or anyone hitting
-- PostgREST directly with a valid token, bypassing the FastAPI
-- pre-check entirely.
create or replace function public.check_movie_log_photos_max_count()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.movie_log_photos where movie_log_id = new.movie_log_id) >= 10 then
    raise exception 'a movie log may have at most 10 photos';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_log_photos_max_count on public.movie_log_photos;
create trigger trg_movie_log_photos_max_count
before insert on public.movie_log_photos
for each row
execute function public.check_movie_log_photos_max_count();

-- Own rows always visible (matches every other own-resource read in this
-- schema, including a surviving-but-anonymized row where user_id is now
-- null — auth.uid() never matches null, so that case falls through to
-- the visibility branch below, same as intended); otherwise visible
-- exactly when the parent log itself would be to someone else —
-- public/anonymous, not archived — same rule
-- movie_log_comments_select_visible already applies one table over.
drop policy if exists "movie_log_photos_select_visible" on public.movie_log_photos;
create policy "movie_log_photos_select_visible"
on public.movie_log_photos
for select
to anon, authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.movie_logs ml
    where ml.id = movie_log_photos.movie_log_id
      and ml.visibility in ('public', 'anonymous')
      and not ml.is_archived
  )
);

-- Insert/delete: own rows only, and the parent log must actually be the
-- caller's own too. The router already confirms this before calling in
-- (same as visit_venue_ratings' own policy comment notes) — this is
-- defense in depth for anyone hitting PostgREST directly.
drop policy if exists "movie_log_photos_insert_own" on public.movie_log_photos;
create policy "movie_log_photos_insert_own"
on public.movie_log_photos
for insert
to authenticated
with check (
  auth.uid() is not null and (select auth.uid()) = user_id
  and exists (
    select 1 from public.movie_logs ml
    where ml.id = movie_log_photos.movie_log_id and ml.user_id = auth.uid()
  )
);

drop policy if exists "movie_log_photos_delete_own" on public.movie_log_photos;
create policy "movie_log_photos_delete_own"
on public.movie_log_photos
for delete
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

revoke all on public.movie_log_photos from anon, authenticated;
grant select on public.movie_log_photos to anon, authenticated;
grant insert, delete on public.movie_log_photos to authenticated;

-- Separate bucket from ticket-images — a distinct, higher-volume,
-- non-ticket category, same own-prefix upload convention (client uploads
-- directly to Storage, backend only ever sees/validates the resulting
-- path string — schemas/_validators.py:validate_storage_path).
insert into storage.buckets (id, name, public)
values ('movie-log-photos', 'movie-log-photos', false)
on conflict (id) do nothing;

-- Unlike ticket-images (owner-only, full stop — that photo is never
-- shown to anyone else), read access here has to match the table's own
-- visibility-gated SELECT policy above, or the *row* would be visible
-- while the actual image bytes stayed 404 for everyone but the owner.
create policy "movie_log_photos_storage_read"
on storage.objects
for select
using (
  bucket_id = 'movie-log-photos'
  and (
    auth.uid()::text = split_part(name, '/', 1)
    or exists (
      select 1 from public.movie_log_photos p
      join public.movie_logs ml on ml.id = p.movie_log_id
      where p.storage_path = storage.objects.name
        and ml.visibility in ('public', 'anonymous')
        and not ml.is_archived
    )
  )
);

create policy "movie_log_photos_storage_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'movie-log-photos'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "movie_log_photos_storage_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'movie-log-photos'
  and auth.uid()::text = split_part(name, '/', 1)
);
