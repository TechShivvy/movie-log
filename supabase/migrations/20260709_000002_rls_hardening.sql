-- Migration 002: RLS hardening
-- Drops and recreates all RLS policies using:
--   TO authenticated (skips policy for anon, big perf win)
--   (select auth.uid()) = user_id (wrapped form caches per-statement)
--   auth.uid() IS NOT NULL guard (explicit safety)

-- movie_logs
drop policy if exists "movie_logs_select_own" on public.movie_logs;
drop policy if exists "movie_logs_insert_own" on public.movie_logs;
drop policy if exists "movie_logs_update_own" on public.movie_logs;
drop policy if exists "movie_logs_delete_own" on public.movie_logs;

create policy "movie_logs_select_own"
on public.movie_logs
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

create policy "movie_logs_insert_own"
on public.movie_logs
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = user_id);

create policy "movie_logs_update_own"
on public.movie_logs
for update
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id)
with check (auth.uid() is not null and (select auth.uid()) = user_id);

create policy "movie_logs_delete_own"
on public.movie_logs
for delete
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

-- user_settings
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;

create policy "user_settings_select_own"
on public.user_settings
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

create policy "user_settings_insert_own"
on public.user_settings
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = user_id);

create policy "user_settings_update_own"
on public.user_settings
for update
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id)
with check (auth.uid() is not null and (select auth.uid()) = user_id);

create policy "user_settings_delete_own"
on public.user_settings
for delete
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

-- storage.objects (ticket-images)
drop policy if exists "ticket_images_read_own" on storage.objects;
drop policy if exists "ticket_images_insert_own" on storage.objects;
drop policy if exists "ticket_images_update_own" on storage.objects;
drop policy if exists "ticket_images_delete_own" on storage.objects;

create policy "ticket_images_read_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ticket-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "ticket_images_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ticket-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "ticket_images_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'ticket-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'ticket-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "ticket_images_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ticket-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);
