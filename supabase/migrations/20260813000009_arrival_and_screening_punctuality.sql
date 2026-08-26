-- Phase 3 of plan.md: two independent, optional punctuality facts —
-- how the caller's own arrival compared to their booked showtime, and
-- whether the screening itself started on time. Minutes, not full
-- HH:MM:SS: nobody tracks "3 minutes 22 seconds late" for this, a
-- smallint is simpler than a duration type and matches the granularity
-- anyone would actually enter.

alter table public.movie_logs
  add column if not exists arrival_status text,
  add column if not exists arrival_delta_minutes smallint,
  add column if not exists screening_start_status text,
  add column if not exists screening_start_delta_minutes smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movie_logs_arrival_status_check') then
    alter table public.movie_logs
      add constraint movie_logs_arrival_status_check
      check (arrival_status in ('early', 'on_time', 'late'));
  end if;

  -- delta is only meaningful alongside early/late, but still optional even
  -- then ("I was late" without saying by how much is a valid entry).
  if not exists (select 1 from pg_constraint where conname = 'movie_logs_arrival_delta_check') then
    alter table public.movie_logs
      add constraint movie_logs_arrival_delta_check
      check (
        arrival_delta_minutes is null
        or (arrival_status in ('early', 'late') and arrival_delta_minutes between 0 and 300)
      );
  end if;

  -- 'delayed', not 'late' -- reads naturally for a screening rather than a person.
  if not exists (select 1 from pg_constraint where conname = 'movie_logs_screening_start_status_check') then
    alter table public.movie_logs
      add constraint movie_logs_screening_start_status_check
      check (screening_start_status in ('early', 'on_time', 'delayed'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'movie_logs_screening_start_delta_check') then
    alter table public.movie_logs
      add constraint movie_logs_screening_start_delta_check
      check (
        screening_start_delta_minutes is null
        or (screening_start_status in ('early', 'delayed') and screening_start_delta_minutes between 0 and 300)
      );
  end if;
end $$;
