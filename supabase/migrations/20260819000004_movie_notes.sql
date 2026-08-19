-- Movie private notes: extends the existing venue_notes feature (theatre/
-- screen, migration 20260811000002) with a third scope, movie_id — same
-- "one evolving note per (user, entity), PUT overwrites in place, always
-- private" shape, just one more entity kind. NOT the same thing as
-- movie_logs.notes (a field on one specific log/visit) -- this is a
-- standing personal note about the *movie itself*, independent of any
-- one viewing, e.g. "wait for the OTT release, terrible in theatres" that
-- outlives any single log.
--
-- Reuses the venue_notes table rather than a parallel movie_notes table —
-- structurally identical (one row per (entity, user), owner-only RLS
-- that's already entity-agnostic, no visibility tiers) and the existing
-- RLS policies (auth.uid() = user_id) need no changes at all to cover
-- the new scope.

alter table public.venue_notes
  add column if not exists movie_id uuid references public.movies(id) on delete cascade;

-- Widen the scope check from "exactly one of theatre_id/screen_id" to
-- "exactly one of theatre_id/screen_id/movie_id".
alter table public.venue_notes drop constraint if exists venue_notes_scope_check;
alter table public.venue_notes add constraint venue_notes_scope_check check (
  (case when theatre_id is not null then 1 else 0 end
   + case when screen_id is not null then 1 else 0 end
   + case when movie_id is not null then 1 else 0 end) = 1
);

-- Same plain (non-partial) UNIQUE reasoning as venue_notes_user_theatre_key/
-- venue_notes_user_screen_key -- a movie-note row always has theatre_id =
-- screen_id = null, so it never collides with those; PostgREST's
-- on_conflict= needs a real constraint, not a partial index.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venue_notes_user_movie_key') then
    alter table public.venue_notes add constraint venue_notes_user_movie_key unique (user_id, movie_id);
  end if;
end $$;
