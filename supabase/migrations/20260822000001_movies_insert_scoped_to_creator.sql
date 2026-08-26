-- movies_insert_authenticated (20260813000004) was created `with check (true)`
-- -- the only unconditioned write policy in the entire schema. Any
-- authenticated caller can insert arbitrary rows into the shared, globally-
-- readable movie catalog via a direct PostgREST call (the frontend's own
-- path dedupes by tmdb_id first via routers/movies.py, so this was only
-- reachable off-app, but RLS shouldn't rely on that). Mirrors
-- theatres_insert_own (20260710000002_venue_refinements.sql) exactly:
-- attribute the row to its creator and scope the insert policy to it.

alter table public.movies
  add column if not exists created_by uuid default auth.uid();

-- Backfill pre-existing rows (created before this column existed, so
-- their real creator was never recorded) before tightening to NOT NULL
-- below. Best-effort attribution from the one signal that survives: a
-- movie_logs row that links to this catalog entry carries the real
-- user_id that picked it. Rows nothing ever linked to (e.g. catalog
-- entries created via POST /movies but never logged) get a nil-uuid
-- sentinel instead of a guessed real user id.
update public.movies m
set created_by = coalesce(
  (select ml.user_id from public.movie_logs ml where ml.movie_id = m.id and ml.user_id is not null limit 1),
  '00000000-0000-0000-0000-000000000000'
)
where m.created_by is null;

alter table public.movies
  alter column created_by set not null;

drop policy if exists "movies_insert_authenticated" on public.movies;
drop policy if exists "movies_insert_own" on public.movies;
create policy "movies_insert_own"
on public.movies
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = created_by);
