-- Migration 009 (reports): lets any authenticated user flag a public/
-- anonymous review, a discoverable profile, a theatre, or a screen as
-- fake/wrong/abusive. No admin UI exists yet — this only makes misuse
-- reportable and queryable (via the service role, same as every other
-- ad-hoc admin action taken against this project so far) instead of
-- invisible. `status`/`reviewed_by`/`reviewed_at` are included now even
-- though nothing writes to them yet, so a future triage flow has
-- somewhere to record its outcome without another migration.
--
-- One target_id column (uuid) covers all four target types, since
-- movie_logs.id / user_settings.user_id / theatres.id / screens.id are
-- all uuid — target_type is the discriminator, same enum-via-text-plus-
-- check-constraint pattern used throughout this schema (verified_source,
-- visibility). Existence/visibility of the target is validated by the
-- API layer before insert (routers/reports.py), not by a DB-level FK —
-- a real FK per target_type isn't expressible as one column, and a
-- polymorphic FK is more trouble than it's worth here.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('movie_log', 'profile', 'theatre', 'screen')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reports_reason_not_blank check (btrim(reason) <> ''),
  -- One open report per (reporter, target) — reporting the same thing
  -- again updates the existing row (upsert, PUT-like semantics matching
  -- venue_notes/username/discoverability) instead of piling up duplicates
  -- from one person re-clicking "report".
  constraint reports_reporter_target_key unique (reporter_user_id, target_type, target_id)
);

create index if not exists idx_reports_target on public.reports (target_type, target_id);
create index if not exists idx_reports_status on public.reports (status) where status = 'open';

drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
before update on public.reports
for each row
execute function public.set_updated_at_timestamp();

alter table public.reports enable row level security;

-- Reporters can see, create, and amend their own reports (e.g. see it's
-- still 'open', or fix a typo'd reason) — never anyone else's, and never
-- the full queue. Triage is a service-role-only operation for now.
drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
on public.reports
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = reporter_user_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
on public.reports
for insert
to authenticated
with check (auth.uid() is not null and (select auth.uid()) = reporter_user_id);

drop policy if exists "reports_update_own" on public.reports;
create policy "reports_update_own"
on public.reports
for update
to authenticated
using (auth.uid() is not null and (select auth.uid()) = reporter_user_id)
with check (auth.uid() is not null and (select auth.uid()) = reporter_user_id);

revoke all on public.reports from anon, authenticated;
grant select, insert, update on public.reports to authenticated;
