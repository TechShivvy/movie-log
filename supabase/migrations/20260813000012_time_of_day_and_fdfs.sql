-- Phase B of plan.md: time_of_day is fully derivable from watched_time
-- alone -- a pure bucketing function, never stored (storing it would
-- just be a staleness risk with zero benefit over computing it on
-- read). FDFS/first-day can't be derived the same way (both need
-- external knowledge -- the movie's real release date, and "was this
-- literally the first show" isn't recoverable from a timestamp even
-- with a release date in hand) -- both stay explicit, manually-set
-- fields, with FDFS forcing first-day server-side rather than relying
-- on frontend discipline.

-- The actual bucketing logic, reusable everywhere via explicit call
-- (views, the search RPC).
create or replace function public.time_of_day_bucket(p_watched_time text)
returns text
language sql
immutable
as $$
  select case
    when p_watched_time is null then null
    when p_watched_time::time >= '00:00' and p_watched_time::time < '12:00' then 'morning'
    when p_watched_time::time >= '12:00' and p_watched_time::time < '17:00' then 'afternoon'
    when p_watched_time::time >= '17:00' and p_watched_time::time < '21:00' then 'evening'
    else 'night'
  end;
$$;

-- PostgREST computed-column wrapper (takes the row type as its sole
-- argument) -- lets GET /movie-logs?select=*,time_of_day:movie_logs_time_of_day
-- expose this without a stored column, same call as any real column.
create or replace function public.movie_logs_time_of_day(ml public.movie_logs)
returns text
language sql
immutable
as $$
  select public.time_of_day_bucket(ml.watched_time);
$$;

revoke all on function public.time_of_day_bucket(text) from public;
grant execute on function public.time_of_day_bucket(text) to anon, authenticated;
revoke all on function public.movie_logs_time_of_day(public.movie_logs) from public;
grant execute on function public.movie_logs_time_of_day(public.movie_logs) to anon, authenticated;

-- Appended at the end of each select list -- CREATE OR REPLACE VIEW
-- rejects inserting a column mid-list, same constraint every prior view
-- change in this project has had to work around.
create or replace view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at, ml.favorite_position,
  public.time_of_day_bucket(ml.watched_time) as time_of_day
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public');

create or replace view public.feed_entries as
select
  ml.id, ml.user_id, us.username, us.display_name, us.avatar_path,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at, ml.favorite_position,
  public.time_of_day_bucket(ml.watched_time) as time_of_day
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility = 'public'
  and auth.uid() is not null
  and ml.user_id <> auth.uid()
  and public.can_view_user_content(ml.user_id);

alter table public.movie_logs
  add column if not exists is_fdfs boolean not null default false,
  add column if not exists is_first_day boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movie_logs_fdfs_implies_first_day') then
    alter table public.movie_logs
      add constraint movie_logs_fdfs_implies_first_day
      check (not is_fdfs or is_first_day);
  end if;
end $$;

-- search_movie_logs: add time_of_day/is_fdfs/is_first_day now that
-- they exist. New computed-in-the-select column (time_of_day) inserted
-- ahead of the trailing matched_fields -- DROP first, same as last
-- time this signature changed (CREATE OR REPLACE only allows
-- appending, not repositioning).
drop function if exists public.search_movie_logs(text, uuid, uuid, boolean, text, text, int, int);

create or replace function public.search_movie_logs(
  p_query text,
  p_theatre_id uuid default null,
  p_screen_id uuid default null,
  p_favorites_only boolean default false,
  p_sort text default 'relevance',
  p_order text default 'desc',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid, user_id uuid, movie text, watched_date date, watched_time text,
  timezone_abbrv text, theater text, seats text[], language text, screen text,
  format text, price numeric, currency text, booking_ref text, certificate text,
  notes text, rating numeric, ticket_image_path text, theatre_id uuid,
  screen_id uuid, movie_id uuid, visibility text, favorite_position smallint,
  is_fdfs boolean, is_first_day boolean, time_of_day text,
  created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  matched_fields text[]
)
language plpgsql stable
as $$
declare
  order_expr text;
begin
  order_expr := (case p_sort
    when 'created_at' then 'created_at'
    when 'updated_at' then 'updated_at'
    when 'watched_date' then 'watched_date'
    when 'movie' then 'movie'
    else 'score'
  end) || ' ' || (case when lower(p_order) = 'asc' then 'asc' else 'desc' end) || ' nulls last';

  return query execute format(
    $q$
    select id, user_id, movie, watched_date, watched_time, timezone_abbrv,
           theater, seats, language, screen, format, price, currency,
           booking_ref, certificate, notes, rating, ticket_image_path,
           theatre_id, screen_id, movie_id, visibility, favorite_position,
           is_fdfs, is_first_day, public.time_of_day_bucket(watched_time) as time_of_day,
           created_at, updated_at, edited_at, matched_fields
    from (
      select ml.*,
        array_remove(array[
          case when similarity(coalesce(ml.movie,''), $1) > 0.15 then 'movie' end,
          case when similarity(coalesce(ml.theater,''), $1) > 0.15 then 'theater' end,
          case when similarity(coalesce(ml.screen,''), $1) > 0.15 then 'screen' end,
          case when similarity(coalesce(array_to_string(ml.seats,' '),''), $1) > 0.15 then 'seats' end,
          case when similarity(coalesce(ml.language,''), $1) > 0.15 then 'language' end,
          case when similarity(coalesce(ml.notes,''), $1) > 0.15 then 'notes' end
        ], null) as matched_fields,
        greatest(
          similarity(coalesce(ml.movie,''), $1),
          similarity(coalesce(ml.theater,''), $1),
          similarity(coalesce(ml.screen,''), $1),
          similarity(coalesce(array_to_string(ml.seats,' '),''), $1),
          similarity(coalesce(ml.language,''), $1),
          similarity(coalesce(ml.notes,''), $1)
        ) as score
      from public.movie_logs ml
      where ml.user_id = auth.uid()
        and ($2::uuid is null or ml.theatre_id = $2)
        and ($3::uuid is null or ml.screen_id = $3)
        and (not $4 or ml.favorite_position is not null)
    ) matches
    where array_length(matched_fields, 1) > 0
    order by %s
    limit $5 offset $6
    $q$,
    order_expr
  )
  using p_query, p_theatre_id, p_screen_id, p_favorites_only, p_limit, p_offset;
end;
$$;

revoke all on function public.search_movie_logs(text, uuid, uuid, boolean, text, text, int, int) from public;
grant execute on function public.search_movie_logs(text, uuid, uuid, boolean, text, text, int, int) to authenticated;
