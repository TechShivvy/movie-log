-- Three independent fixes found by auditing CRUD completeness end to end:
--
-- 1. movie_logs.edited_at: a Reddit/GitHub-style "this was edited after
--    posting" signal. Deliberately its own column, not derived from
--    updated_at > created_at -- updated_at is bumped by every UPDATE,
--    including ones that aren't a content edit at all (e.g. the account-
--    deletion FK nulling movie_logs.user_id to null, migration
--    20260813000001 -- that would have falsely marked an anonymized log
--    as "edited"). A trigger sets edited_at only when a WRITABLE content
--    column actually changed value.
--
-- 2. visit_venue_ratings had no DELETE grant/policy at all -- the only
--    way to remove a venue rating was deleting the entire log (movie,
--    date, notes, everything) along with it. Own-row delete, matching
--    the existing select/insert/update policies.
--
-- 3. movie_rating_stats (20260813000005) aggregated through
--    public_movie_log_entries, which excludes `private` logs -- silently
--    inconsistent with theatre_rating_stats/screen_rating_stats, which
--    explicitly count a rating regardless of the log's visibility
--    ("venue quality signal, not review content", documented in
--    20260810000001). Redefined to aggregate straight from movie_logs
--    instead, matching that precedent.

alter table public.movie_logs
  add column if not exists edited_at timestamptz;

create or replace function public.mark_movie_log_edited()
returns trigger
language plpgsql
as $$
begin
  if (
    new.movie, new.watched_date, new.watched_time, new.timezone_abbrv,
    new.theater, new.seats, new.language, new.screen, new.format,
    new.price, new.currency, new.booking_ref, new.certificate, new.notes,
    new.rating, new.ticket_image_path, new.theatre_id, new.screen_id,
    new.movie_id, new.visibility
  ) is distinct from (
    old.movie, old.watched_date, old.watched_time, old.timezone_abbrv,
    old.theater, old.seats, old.language, old.screen, old.format,
    old.price, old.currency, old.booking_ref, old.certificate, old.notes,
    old.rating, old.ticket_image_path, old.theatre_id, old.screen_id,
    old.movie_id, old.visibility
  ) then
    new.edited_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movie_logs_mark_edited on public.movie_logs;
create trigger trg_movie_logs_mark_edited
before update on public.movie_logs
for each row
execute function public.mark_movie_log_edited();

create or replace view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public');

create or replace view public.feed_entries as
select
  ml.id, ml.user_id, us.username, us.display_name, us.avatar_path,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility = 'public'
  and auth.uid() is not null
  and ml.user_id <> auth.uid()
  and public.can_view_user_content(ml.user_id);

drop policy if exists "visit_venue_ratings_delete_own" on public.visit_venue_ratings;
create policy "visit_venue_ratings_delete_own"
on public.visit_venue_ratings
for delete
to authenticated
using (auth.uid() is not null and (select auth.uid()) = user_id);

grant delete on public.visit_venue_ratings to authenticated;

create or replace view public.movie_rating_stats as
select
  movie_id,
  avg(rating) as avg_rating,
  count(rating) as rating_count
from public.movie_logs
where movie_id is not null and rating is not null
group by movie_id;
