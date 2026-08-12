-- Phase 3 of plan.md: an optional canonical movie catalog, backed by
-- TMDB. movie_logs.movie (free text, OCR'd or hand-typed) stays the
-- display source of truth either way -- movie_id is only set when the
-- caller picked a TMDB search result via POST /movies (see
-- routers/movies.py), same optional-linking shape as theatre_id/screen_id
-- already have alongside the free-typed theater/screen text columns.

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer unique,
  title text not null,
  original_language text,
  release_date date,
  poster_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_movies_title_trgm
  on public.movies using gin (title public.gin_trgm_ops);

drop trigger if exists trg_movies_updated_at on public.movies;
create trigger trg_movies_updated_at
before update on public.movies
for each row
execute function public.set_updated_at_timestamp();

alter table public.movies enable row level security;

-- Public directory, same read/write shape as theatres: everyone
-- (including anon) can read, only authenticated can create.
drop policy if exists "movies_select_all" on public.movies;
create policy "movies_select_all"
on public.movies
for select
to anon, authenticated
using (true);

drop policy if exists "movies_insert_authenticated" on public.movies;
create policy "movies_insert_authenticated"
on public.movies
for insert
to authenticated
with check (true);

-- New tables start with zero grants (default privileges revoked
-- project-wide in 20260710000002) -- explicit grant required.
revoke all on public.movies from anon, authenticated;
grant select on public.movies to anon, authenticated;
grant insert on public.movies to authenticated;

-- movie_logs.movie_id: optional link into the catalog above, nullable so
-- every existing free-typed log (and every future one that never touches
-- this feature) is entirely unaffected.
alter table public.movie_logs
  add column if not exists movie_id uuid references public.movies(id);

create index if not exists idx_movie_logs_movie_id on public.movie_logs (movie_id);
