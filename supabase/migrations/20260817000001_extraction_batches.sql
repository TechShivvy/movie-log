-- Batch ticket extraction: POST /movie-metadata/extract-batch accepts up
-- to settings.max_batch_size images, resolves provider/model/key once for
-- the whole batch, and processes them as an in-process background task
-- (this app has no Celery/Redis/task queue — see backend/scripts/
-- docker-entry.sh's gunicorn config) that outlives the initiating request.
-- Progress has to live here, not in memory: gunicorn runs 4 worker
-- processes, and a GET .../extract-batch/{id} poll can land on any of
-- them, only one of which is actually running the batch.
--
-- All writes (create, per-item progress, the staleness flip) go through
-- the backend's own service-role key (services/extraction_batches.py) —
-- never the caller's token, since the background task must not depend on
-- a JWT staying valid for the batch's whole runtime. Reads go through the
-- caller's own token under the RLS policies below, same as everything
-- else in this schema. Same "writes are service-role-only, RLS only
-- gates reads" shape as reports_select_own (20260811000003_reports.sql).

create table if not exists public.extraction_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  provider text not null check (provider in ('openrouter', 'openai', 'gemini')),
  model text not null,
  auto_fallback boolean not null default false,
  auto_insert boolean not null default false,
  total_items int not null check (total_items > 0),
  completed_items int not null default 0,
  failed_items int not null default 0,
  -- Bumped after every item finishes, success or failure — what the
  -- staleness detector (GET .../extract-batch/{id}) reads to notice a
  -- batch whose worker process died mid-run (a PROD redeploy or crash;
  -- the in-process background task has no way to signal that itself).
  last_progress_at timestamptz not null default timezone('utc', now()),
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create table if not exists public.extraction_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.extraction_batches(id) on delete cascade,
  position int not null,
  filename text,
  status text not null default 'queued' check (status in ('queued', 'completed', 'failed')),
  image_hash text,
  result jsonb,
  used_provider text,
  used_model text,
  requested_model text,
  fallback_occurred boolean,
  error_code text,
  error_message text,
  auto_insert_status text check (auto_insert_status in ('inserted', 'skipped_no_title', 'failed')),
  movie_log_id uuid references public.movie_logs(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint extraction_batch_items_batch_position_key unique (batch_id, position)
);

create index if not exists idx_extraction_batches_user on public.extraction_batches (user_id, created_at desc);
create index if not exists idx_extraction_batch_items_batch on public.extraction_batch_items (batch_id, position);

alter table public.extraction_batches enable row level security;
alter table public.extraction_batch_items enable row level security;

drop policy if exists "extraction_batches_select_own" on public.extraction_batches;
create policy "extraction_batches_select_own"
on public.extraction_batches
for select
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

drop policy if exists "extraction_batch_items_select_own" on public.extraction_batch_items;
create policy "extraction_batch_items_select_own"
on public.extraction_batch_items
for select
to authenticated
using (
  exists (
    select 1 from public.extraction_batches b
    where b.id = extraction_batch_items.batch_id and b.user_id = auth.uid()
  )
);

-- No insert/update/delete grants at all for authenticated/anon — every
-- write is service-role-only, same reasoning update_theatre_status's own
-- comment already documents for theatres (services/supabase_admin.py).
revoke all on public.extraction_batches, public.extraction_batch_items from anon, authenticated;
grant select on public.extraction_batches, public.extraction_batch_items to authenticated;
