-- Phase 1 of plan.md: profile picture, bio/links (bio already existed but
-- was never settable — routers/public_profile.py now has PATCH /me/profile
-- for it), and account_visibility replacing the boolean is_public with a
-- 3-state tier. followers_only/private both behave like today's private
-- for now (empty logs) — becoming genuinely follow-aware is Phase 2/4
-- (supabase/migrations/20260811000012, 20260811000014), once the follows
-- table and can_view_user_content exist. Splitting it this way keeps each
-- migration/commit independently applicable and testable.

alter table public.user_settings
  add column if not exists account_visibility text;

update public.user_settings
  set account_visibility = case when is_public then 'public' else 'private' end
  where account_visibility is null;

alter table public.user_settings
  alter column account_visibility set not null,
  alter column account_visibility set default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_account_visibility_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_account_visibility_check
      check (account_visibility in ('public', 'followers_only', 'private'));
  end if;
end $$;

alter table public.user_settings
  add column if not exists avatar_path text;

alter table public.user_settings
  add column if not exists profile_links jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_profile_links_shape'
  ) then
    alter table public.user_settings
      add constraint user_settings_profile_links_shape
      check (jsonb_typeof(profile_links) = 'array' and jsonb_array_length(profile_links) <= 5);
  end if;
end $$;

-- Function bodies can't keep referencing is_public past this point — drop
-- it now that account_visibility fully replaces it.
alter table public.user_settings drop column if exists is_public;

-- Re-created (not yet block/follow-aware — that's 20260811000014) purely to
-- surface the new columns; return shape changed so this needs drop+create.
drop function if exists public.get_public_profile_by_username(text);
create function public.get_public_profile_by_username(p_username text)
returns table (
  user_id uuid, username text, display_name text, bio text,
  account_visibility text, avatar_path text, profile_links jsonb
)
language sql stable security definer
set search_path = public
as $$
  select user_id, username, display_name, bio, account_visibility, avatar_path, profile_links
  from public.user_settings
  where lower(username) = lower(p_username)
  limit 1;
$$;
revoke all on function public.get_public_profile_by_username(text) from public;
grant execute on function public.get_public_profile_by_username(text) to anon, authenticated;

drop function if exists public.search_public_users(text, int);
create function public.search_public_users(p_query text, p_limit int default 20)
returns table (
  user_id uuid, username text, display_name text, bio text,
  account_visibility text, avatar_path text
)
language sql stable security definer
set search_path = public
as $$
  select user_id, username, display_name, bio, account_visibility, avatar_path
  from public.user_settings
  where username ilike '%' || p_query || '%' or display_name ilike '%' || p_query || '%'
  order by case when username ilike p_query || '%' then 0 else 1 end, username
  limit p_limit;
$$;
revoke all on function public.search_public_users(text, int) from public;
grant execute on function public.search_public_users(text, int) to anon, authenticated;

-- avatar-images: PUBLIC bucket (unlike the private ticket-images bucket) —
-- avatars aren't sensitive, so the client renders the stored path as a
-- direct public URL with no backend signed-URL work. Same {user_id}/...
-- path-prefix ownership rule as ticket-images for writes; reads are open
-- to anyone, matching the bucket's own public=true setting.
insert into storage.buckets (id, name, public)
values ('avatar-images', 'avatar-images', true)
on conflict (id) do nothing;

drop policy if exists "avatar_images_read_all" on storage.objects;
create policy "avatar_images_read_all"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'avatar-images');

drop policy if exists "avatar_images_insert_own" on storage.objects;
create policy "avatar_images_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatar-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "avatar_images_update_own" on storage.objects;
create policy "avatar_images_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatar-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'avatar-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "avatar_images_delete_own" on storage.objects;
create policy "avatar_images_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatar-images'
  and auth.uid() is not null
  and auth.uid()::text = split_part(name, '/', 1)
);
