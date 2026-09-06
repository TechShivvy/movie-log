-- Movie Log initial schema + security

create extension if not exists pgcrypto;

create table if not exists public.movie_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie text,
  watched_date date,
  watched_time text,
  timezone_abbrv text,
  theater text,
  seats text[] not null default '{}',
  language text,
  screen text,
  booking_ref text,
  certificate text,
  notes text,
  rating int,
  ticket_image_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint movie_logs_rating_check check (rating between 1 and 10)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_fill boolean not null default false,
  preferred_model text not null default 'qwen/qwen2.5-vl-72b-instruct:free',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  count int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, usage_date),
  constraint daily_usage_count_non_negative check (count >= 0)
);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger trg_movie_logs_updated_at
before update on public.movie_logs
for each row
execute function public.set_updated_at_timestamp();

create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at_timestamp();

create trigger trg_daily_usage_updated_at
before update on public.daily_usage
for each row
execute function public.set_updated_at_timestamp();

create index if not exists idx_movie_logs_user_id_created_at
  on public.movie_logs (user_id, created_at desc);

create index if not exists idx_movie_logs_user_id_watched_date
  on public.movie_logs (user_id, watched_date desc);

alter table public.movie_logs enable row level security;
alter table public.user_settings enable row level security;
alter table public.daily_usage enable row level security;

create policy "movie_logs_select_own"
on public.movie_logs
for select
using (auth.uid() = user_id);

create policy "movie_logs_insert_own"
on public.movie_logs
for insert
with check (auth.uid() = user_id);

create policy "movie_logs_update_own"
on public.movie_logs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "movie_logs_delete_own"
on public.movie_logs
for delete
using (auth.uid() = user_id);

create policy "user_settings_select_own"
on public.user_settings
for select
using (auth.uid() = user_id);

create policy "user_settings_insert_own"
on public.user_settings
for insert
with check (auth.uid() = user_id);

create policy "user_settings_update_own"
on public.user_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_settings_delete_own"
on public.user_settings
for delete
using (auth.uid() = user_id);

-- No direct user access to quota table.
create policy "daily_usage_no_user_select"
on public.daily_usage
for select
using (false);

create policy "daily_usage_no_user_insert"
on public.daily_usage
for insert
with check (false);

create policy "daily_usage_no_user_update"
on public.daily_usage
for update
using (false)
with check (false);

create policy "daily_usage_no_user_delete"
on public.daily_usage
for delete
using (false);

create or replace function public.increment_daily_usage(p_user uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := timezone('utc', now())::date;
  v_count int;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into public.daily_usage (user_id, usage_date, count)
  values (p_user, v_today, 1)
  on conflict (user_id, usage_date)
  do update set count = public.daily_usage.count + 1,
                updated_at = timezone('utc', now())
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.increment_daily_usage(uuid, int) from public;
grant execute on function public.increment_daily_usage(uuid, int) to service_role;

insert into storage.buckets (id, name, public)
values ('ticket-images', 'ticket-images', false)
on conflict (id) do nothing;

create policy "ticket_images_read_own"
on storage.objects
for select
using (
  bucket_id = 'ticket-images'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "ticket_images_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'ticket-images'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "ticket_images_update_own"
on storage.objects
for update
using (
  bucket_id = 'ticket-images'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'ticket-images'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "ticket_images_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'ticket-images'
  and auth.uid()::text = split_part(name, '/', 1)
);
