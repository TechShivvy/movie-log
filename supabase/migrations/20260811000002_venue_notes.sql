-- Migration 008 (venue_notes): private, per-user notes about a theatre or a
-- screen, independent of any specific visit/log. movie_logs.notes is about
-- one particular ticket ("great sound that night"); this is the opposite —
-- standing personal notes about the *venue itself* that outlive any one
-- visit ("always ask for row H", "AC's been broken the last two times").
--
-- One evolving note per (user, theatre) and separately per (user, screen)
-- — PUT overwrites in place, no history kept. Always private: unlike
-- movie_logs there's no visibility tier here at all, nothing ever surfaces
-- on a public/anonymous review — these never leave the owner's own account.

create table if not exists public.venue_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theatre_id uuid references public.theatres(id) on delete cascade,
  screen_id uuid references public.screens(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint venue_notes_note_not_blank check (btrim(note) <> ''),
  -- Exactly one of theatre_id/screen_id — a note is about one venue or the
  -- other, never both at once (a user who wants notes on both writes two
  -- rows, one of each kind, for the same physical location).
  constraint venue_notes_scope_check check (
    (theatre_id is not null and screen_id is null) or
    (theatre_id is null and screen_id is not null)
  ),
  -- Plain (non-partial) UNIQUE, relying on standard SQL null semantics:
  -- a screen-note row always has theatre_id = null, and null is never
  -- considered equal to null for uniqueness purposes, so those rows never
  -- collide with each other here — only real (user_id, theatre_id) pairs
  -- are deduplicated. Deliberately not a partial index: PostgREST's
  -- on_conflict= (used for the upsert below) can only target a real
  -- constraint/plain unique index, not a partial one with a WHERE clause.
  constraint venue_notes_user_theatre_key unique (user_id, theatre_id),
  constraint venue_notes_user_screen_key unique (user_id, screen_id)
);

create index if not exists idx_venue_notes_user on public.venue_notes (user_id);

drop trigger if exists trg_venue_notes_updated_at on public.venue_notes;
create trigger trg_venue_notes_updated_at
before update on public.venue_notes
for each row
execute function public.set_updated_at_timestamp();

-- ── RLS: fully private, owner-only, full CRUD (unlike visit_venue_ratings
--    there's no parent-row delete to cascade through for "clear my note" —
--    it needs its own delete policy). ────────────────────────────────────

alter table public.venue_notes enable row level security;

drop policy if exists "venue_notes_select_own" on public.venue_notes;
create policy "venue_notes_select_own"
on public.venue_notes
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "venue_notes_insert_own" on public.venue_notes;
create policy "venue_notes_insert_own"
on public.venue_notes
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "venue_notes_update_own" on public.venue_notes;
create policy "venue_notes_update_own"
on public.venue_notes
for update
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id)
with check (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "venue_notes_delete_own" on public.venue_notes;
create policy "venue_notes_delete_own"
on public.venue_notes
for delete
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

revoke all on public.venue_notes from anon, authenticated;
grant select, insert, update, delete on public.venue_notes to authenticated;
