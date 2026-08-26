-- Phase 1 of plan.md: fuzzy multi-field search over the caller's own
-- movie_logs. Not security definer -- it only ever needs the caller's
-- own rows, which the existing movie_logs_select_own RLS policy already
-- allows directly (unlike search_public_users, which needs to bypass
-- RLS to read across users). auth.uid() resolves the same way inside
-- the dynamically-executed inner query as it would in a plain SELECT --
-- it's a session-level GUC read, unaffected by EXECUTE.
--
-- language plpgsql, not sql, because sorting needs to be dynamic
-- (relevance vs. a real column, asc vs. desc) -- ORDER BY can't be
-- parameterized in plain SQL. Safe despite the dynamic SQL: p_sort/
-- p_order only ever select from a fixed, hardcoded mapping (never
-- interpolated directly), and every actual value (p_query, the
-- filters, limit/offset) goes through EXECUTE ... USING as real bind
-- parameters, not string interpolation.
-- p_favorites_only is added in Phase 2's migration (20260813000008),
-- once favorite_position exists to filter on — kept out of this
-- signature for now rather than added dead/unused ahead of that column.
create or replace function public.search_movie_logs(
  p_query text,
  p_theatre_id uuid default null,
  p_screen_id uuid default null,
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
  screen_id uuid, movie_id uuid, visibility text,
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
           theatre_id, screen_id, movie_id, visibility,
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
    ) matches
    where array_length(matched_fields, 1) > 0
    order by %s
    limit $4 offset $5
    $q$,
    order_expr
  )
  using p_query, p_theatre_id, p_screen_id, p_limit, p_offset;
end;
$$;

revoke all on function public.search_movie_logs(text, uuid, uuid, text, text, int, int) from public;
grant execute on function public.search_movie_logs(text, uuid, uuid, text, text, int, int) to authenticated;
