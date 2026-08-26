-- Profile banner image: same pattern as avatar_path/avatar-images
-- (migration 20260811000011) end to end — a second, independent Storage
-- path on user_settings, its own public bucket, the identical four
-- {user_id}/... path-prefix RLS policies. Detail-page-only concept (the
-- profile header banner on GET /public/users/{username}), unlike
-- avatar_path which also needs to show up in search_public_users' result
-- list — banner_path deliberately does NOT get added there.

alter table public.user_settings
  add column if not exists banner_path text;

-- Adding an output column is a return-type change — CREATE OR REPLACE
-- FUNCTION cannot do that in place (same reasoning as match_theatres in
-- 20260819000003), so the old signature has to be dropped first. Building
-- on top of 20260811000014's block/follow-aware shape (is_blocked,
-- can_view_content), not Phase 1's — that's the current live definition.
drop function if exists public.get_public_profile_by_username(text);
create function public.get_public_profile_by_username(p_username text)
returns table (
  user_id uuid, username text, display_name text, bio text,
  account_visibility text, avatar_path text, banner_path text, profile_links jsonb,
  is_blocked boolean, can_view_content boolean
)
language sql stable security definer
set search_path = public
as $$
  select
    us.user_id, us.username, us.display_name, us.bio,
    us.account_visibility, us.avatar_path, us.banner_path, us.profile_links,
    exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = us.user_id)
         or (b.blocker_id = us.user_id and b.blocked_id = auth.uid())
    ) as is_blocked,
    public.can_view_user_content(us.user_id) as can_view_content
  from public.user_settings us
  where lower(us.username) = lower(p_username)
  limit 1;
$$;
revoke all on function public.get_public_profile_by_username(text) from public;
grant execute on function public.get_public_profile_by_username(text) to anon, authenticated;

-- banner-images: PUBLIC bucket, same reasoning as avatar-images — banners
-- aren't sensitive, so the client renders the stored path as a direct
-- public URL with no backend signed-URL work. Same {user_id}/... path-
-- prefix ownership rule for writes; reads are open to anyone.
insert into storage.buckets (id, name, public)
values ('banner-images', 'banner-images', true)
on conflict (id) do nothing;

drop policy if exists "banner_images_read_all" on storage.objects;
create policy "banner_images_read_all"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'banner-images');

drop policy if exists "banner_images_insert_own" on storage.objects;
create policy "banner_images_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'banner-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "banner_images_update_own" on storage.objects;
create policy "banner_images_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'banner-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'banner-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "banner_images_delete_own" on storage.objects;
create policy "banner_images_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'banner-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);
