-- Fixes a real bug in 20260813000009's two delta check constraints,
-- found live: `arrival_delta_minutes is null or (arrival_status in
-- ('early','late') and ...)` silently PASSED an invalid row
-- (arrival_status = null, arrival_delta_minutes = 7) instead of
-- rejecting it. Classic Postgres CHECK-constraint-with-NULL gotcha: a
-- CHECK only fails on a definite FALSE, not NULL/unknown -- and
-- `null in ('early','late')` evaluates to NULL, not FALSE, so
-- `NULL and (0<=7<=300)` is NULL, and `false or NULL` is still NULL,
-- which Postgres treats as satisfied. Confirmed live: a PATCH that
-- explicitly nulled arrival_status while leaving arrival_delta_minutes
-- set went through uncaught, and the row only got flagged afterward,
-- too late, when FastAPI's own response-model validation (which mirrors
-- this same rule at the Pydantic layer) rejected it on the way out --
-- a 500, and worse, an already-persisted invalid row. Rewritten with an
-- explicit CASE + `else false`, which always evaluates to a real
-- boolean, never NULL.

-- Repair first, constrain after -- adding the stricter constraint before
-- cleaning up the one row the old, buggy constraint already let through
-- would fail the migration outright (a live row still violating it at
-- ALTER TABLE time). An explicit null-out of arrival_status with a delta
-- still attached has no coherent meaning, so the delta goes too.
update public.movie_logs
set arrival_delta_minutes = null
where arrival_status is null and arrival_delta_minutes is not null;

update public.movie_logs
set screening_start_delta_minutes = null
where screening_start_status is null and screening_start_delta_minutes is not null;

alter table public.movie_logs
  drop constraint if exists movie_logs_arrival_delta_check,
  drop constraint if exists movie_logs_screening_start_delta_check;

alter table public.movie_logs
  add constraint movie_logs_arrival_delta_check
  check (
    case
      when arrival_delta_minutes is null then true
      when arrival_status in ('early', 'late') then arrival_delta_minutes between 0 and 300
      else false
    end
  );

alter table public.movie_logs
  add constraint movie_logs_screening_start_delta_check
  check (
    case
      when screening_start_delta_minutes is null then true
      when screening_start_status in ('early', 'delayed') then screening_start_delta_minutes between 0 and 300
      else false
    end
  );
