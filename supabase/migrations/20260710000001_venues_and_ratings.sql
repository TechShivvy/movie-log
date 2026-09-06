-- Migration 003 (venues_and_ratings): theatres/screens directory, per-visit
-- venue ratings, and the movie_logs/user_settings columns that back them.
--
-- NOTE: this schema was already applied directly against the live project
-- (outside of tracked migrations) in an earlier session — this migration
-- documents it for reproducibility. Everything is written idempotently
-- (`if not exists` / `or replace`) so running it against that project is a
-- safe no-op, while a fresh project (or `supabase db reset`) ends up in the
-- same state. The actual missing pieces (RLS policies, updated_at triggers
-- for these tables, stats compute) are in the next migration.

create extension if not exists pg_trgm with schema public;

-- ── Theatres / screens directory ────────────────────────────────────────

create table if not exists public.theatres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain text,
  city text not null,
  state text,
  country text not null default 'IN',
  lat numeric,
  lng numeric,
  place_id text,
  formatted_address text,
  created_by uuid references auth.users(id),
  stats_dirty boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint theatres_place_id_key unique (place_id)
);

create table if not exists public.screens (
  id uuid primary key default gen_random_uuid(),
  theatre_id uuid not null references public.theatres(id) on delete cascade,
  name text not null,
  screen_type text,
  created_by uuid references auth.users(id),
  stats_dirty boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint screens_theatre_id_name_key unique (theatre_id, name)
);

create index if not exists idx_theatres_city on public.theatres (city);
create index if not exists idx_theatres_name_trgm on public.theatres using gin (name public.gin_trgm_ops);

-- ── Per-visit venue ratings (screen/speaker/AC/seat, half-star 0.5-5.0) ──
-- One row per movie_log — the PK is movie_log_id itself, matching the
-- "PUT /movie-logs/{id}/venue-rating" upsert flow in routers/movie_logs.py.

create table if not exists public.visit_venue_ratings (
  movie_log_id uuid primary key references public.movie_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  screen_rating numeric(2,1),
  speaker_rating numeric(2,1),
  ac_rating numeric(2,1),
  seat_rating numeric(2,1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint visit_venue_ratings_screen_rating_check
    check (screen_rating is null or (screen_rating between 0.5 and 5 and mod(screen_rating * 2, 1) = 0)),
  constraint visit_venue_ratings_speaker_rating_check
    check (speaker_rating is null or (speaker_rating between 0.5 and 5 and mod(speaker_rating * 2, 1) = 0)),
  constraint visit_venue_ratings_ac_rating_check
    check (ac_rating is null or (ac_rating between 0.5 and 5 and mod(ac_rating * 2, 1) = 0)),
  constraint visit_venue_ratings_seat_rating_check
    check (seat_rating is null or (seat_rating between 0.5 and 5 and mod(seat_rating * 2, 1) = 0))
);

drop trigger if exists trg_visit_venue_ratings_updated_at on public.visit_venue_ratings;
create trigger trg_visit_venue_ratings_updated_at
before update on public.visit_venue_ratings
for each row
execute function public.set_updated_at_timestamp();

-- ── Aggregate rating stats. Populated by the trigger added in the next
--    migration — left empty here since this migration only establishes
--    shape, not behavior. ─────────────────────────────────────────────

create table if not exists public.theatre_rating_stats (
  theatre_id uuid primary key references public.theatres(id) on delete cascade,
  overall jsonb not null default '{}'::jsonb,
  computed_at timestamptz
);

create table if not exists public.screen_rating_stats (
  screen_id uuid primary key references public.screens(id) on delete cascade,
  categories jsonb not null default '{}'::jsonb,
  computed_at timestamptz
);

-- ── movie_logs: link to a theatre/screen, public sharing, admin verification ─

alter table public.movie_logs
  add column if not exists theatre_id uuid references public.theatres(id),
  add column if not exists screen_id uuid references public.screens(id),
  add column if not exists is_public boolean not null default false,
  add column if not exists verified boolean not null default false,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movie_logs_verified_source_check') then
    alter table public.movie_logs
      add constraint movie_logs_verified_source_check
      check (verified_source is null or verified_source in ('admin', 'automated'));
  end if;
end $$;

create index if not exists idx_movie_logs_theatre on public.movie_logs (theatre_id) where theatre_id is not null;
create index if not exists idx_movie_logs_screen on public.movie_logs (screen_id) where screen_id is not null;
create index if not exists idx_movie_logs_public on public.movie_logs (is_public) where is_public = true;

-- ── user_settings: public profile fields ─────────────────────────────

alter table public.user_settings
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists bio text,
  add column if not exists is_discoverable boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_username_key') then
    alter table public.user_settings add constraint user_settings_username_key unique (username);
  end if;
end $$;

-- Case-insensitive uniqueness (the constraint above is case-sensitive and
-- kept only for the explicit FK-able unique key PostgREST/clients may rely
-- on; this index is what actually prevents "Foo"/"foo" duplicates).
create unique index if not exists idx_user_settings_username_lower on public.user_settings (lower(username));

-- ── RPCs backing theatre matching + public user search ──────────────────

create or replace function public.match_theatres(p_query text, p_city text default null, p_limit int default 5)
returns table (id uuid, name text, chain text, city text, formatted_address text, similarity real)
language sql stable
as $$
  select t.id, t.name, t.chain, t.city, t.formatted_address,
         similarity(t.name, p_query) as similarity
  from public.theatres t
  where (p_city is null or t.city ilike p_city)
    and similarity(t.name, p_query) > 0.2
  order by similarity desc
  limit p_limit;
$$;

-- security definer: search must see discoverable users regardless of the
-- caller's own RLS visibility into user_settings (anon has none directly).
create or replace function public.search_public_users(p_query text, p_limit int default 20)
returns table (user_id uuid, username text, display_name text, bio text)
language sql stable security definer
set search_path = public
as $$
  select user_id, username, display_name, bio
  from public.user_settings
  where is_discoverable = true
    and (username ilike '%' || p_query || '%' or display_name ilike '%' || p_query || '%')
  order by case when username ilike p_query || '%' then 0 else 1 end, username
  limit p_limit;
$$;

revoke all on function public.match_theatres(text, text, int) from public;
grant execute on function public.match_theatres(text, text, int) to anon, authenticated;

revoke all on function public.search_public_users(text, int) from public;
grant execute on function public.search_public_users(text, int) to anon, authenticated;

-- ── Safety net: auto-enable RLS on any new table created in public, so a
--    forgotten migration can never leave a table wide open by omission.
--    (Already live on this project under the same name/function — this
--    just makes it reproducible.) ────────────────────────────────────

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null and cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception when others then
        raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- Explicit as well, so this migration is correct even replayed on a fresh
-- database where the event trigger above didn't exist yet when these
-- CREATE TABLE statements ran earlier in this same file.
alter table public.theatres enable row level security;
alter table public.screens enable row level security;
alter table public.visit_venue_ratings enable row level security;
alter table public.theatre_rating_stats enable row level security;
alter table public.screen_rating_stats enable row level security;
