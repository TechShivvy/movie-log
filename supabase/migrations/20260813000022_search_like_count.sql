-- Completes Phase 3 of plan.md: search_movie_logs' explicit output
-- column list needs like_count added now that it exists — the inner
-- `select ml.*` already carries it through, only the outer select list
-- needed the addition. Turns out CREATE OR REPLACE rejects *any*
-- RETURNS TABLE change, not just reordering — confirmed live
-- ("cannot change return type of existing function", SQLSTATE 42P13)
-- even for a same-parameters, append-only column addition; corrected
-- to DROP first, same as every actual parameter-list change here has
-- needed.

drop function if exists public.search_movie_logs(text, uuid, uuid, boolean, boolean, text, text, int, int);

create or replace function public.search_movie_logs(
  p_query text,
  p_theatre_id uuid default null,
  p_screen_id uuid default null,
  p_favorites_only boolean default false,
  p_archived_only boolean default false,
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
  is_fdfs boolean, is_first_day boolean, is_archived boolean, time_of_day text,
  created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  matched_fields text[], like_count int
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
           is_fdfs, is_first_day, is_archived,
           public.time_of_day_bucket(watched_time) as time_of_day,
           created_at, updated_at, edited_at, matched_fields, like_count
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
        and ml.is_archived = $5
    ) matches
    where array_length(matched_fields, 1) > 0
    order by %s
    limit $6 offset $7
    $q$,
    order_expr
  )
  using p_query, p_theatre_id, p_screen_id, p_favorites_only, p_archived_only, p_limit, p_offset;
end;
$$;

revoke all on function public.search_movie_logs(text, uuid, uuid, boolean, boolean, text, text, int, int) from public;
grant execute on function public.search_movie_logs(text, uuid, uuid, boolean, boolean, text, text, int, int) to authenticated;
