-- Phase 2 of plan.md: up to 4 favorite logs, Letterboxd-style, surfaced
-- on the profile. favorite_position IS the favorite flag -- non-null
-- means favorited, no separate boolean -- and its own uniqueness
-- constraint IS the 4-slot cap, no separate count-trigger needed.

alter table public.movie_logs
  add column if not exists favorite_position smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'movie_logs_favorite_position_check'
  ) then
    alter table public.movie_logs
      add constraint movie_logs_favorite_position_check
      check (favorite_position between 1 and 4);
  end if;
end $$;

create unique index if not exists idx_movie_logs_favorite_position_unique
  on public.movie_logs (user_id, favorite_position)
  where favorite_position is not null;

-- set_favorite_position: atomically moves a log into a slot, vacating
-- whichever other log of the caller's currently holds it -- a "move",
-- not a 409 forcing the client to clear the old slot first. Not security
-- definer: both UPDATEs are already scoped to auth.uid(), which RLS
-- (movie_logs_update_own) already allows directly; the two statements
-- are atomic together as one function call regardless.
create or replace function public.set_favorite_position(p_log_id uuid, p_position smallint)
returns public.movie_logs
language plpgsql
as $$
declare
  result public.movie_logs;
begin
  if p_position is null or p_position < 1 or p_position > 4 then
    raise exception 'favorite_position must be between 1 and 4';
  end if;

  update public.movie_logs
  set favorite_position = null
  where user_id = auth.uid() and favorite_position = p_position and id <> p_log_id;

  update public.movie_logs
  set favorite_position = p_position
  where id = p_log_id and user_id = auth.uid()
  returning * into result;

  if result.id is null then
    raise exception 'movie log not found or not owned by caller';
  end if;

  return result;
end;
$$;

revoke all on function public.set_favorite_position(uuid, smallint) from public;
grant execute on function public.set_favorite_position(uuid, smallint) to authenticated;

-- favorite_position on public_movie_log_entries: backs the profile's
-- public `favorites` showcase (routers/public_profile.py). A `private`
-- favorite never appears here regardless -- this view already excludes
-- private rows entirely, same rule as everything else on it; the favorite
-- still occupies its slot for the owner (visible via their own
-- GET /movie-logs?favorites_only=true), it just doesn't show publicly.
create or replace view public.public_movie_log_entries as
select
  ml.id,
  case when ml.visibility = 'public' then ml.user_id else null end as user_id,
  case when ml.visibility = 'public' then us.username else null end as username,
  ml.movie, ml.watched_date, ml.watched_time, ml.timezone_abbrv,
  ml.theater, ml.theatre_id, ml.language, ml.screen, ml.screen_id,
  ml.certificate, ml.notes, ml.rating, ml.created_at, ml.format,
  ml.movie_id, ml.edited_at, ml.favorite_position
from public.movie_logs ml
left join public.user_settings us on us.user_id = ml.user_id
where ml.visibility in ('anonymous', 'public');

-- search_movie_logs: add p_favorites_only now that favorite_position
-- exists to filter on. Signature change (new parameter inserted rather
-- than appended) needs DROP first -- CREATE OR REPLACE only allows
-- appending parameters at the end, not repositioning them.
drop function if exists public.search_movie_logs(text, uuid, uuid, text, text, int, int);

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
