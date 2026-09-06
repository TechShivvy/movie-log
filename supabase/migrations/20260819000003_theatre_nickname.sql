-- Venue nickname: an optional admin-set *alternate label* for a theatre —
-- NOT a correction to the Google-sourced name/formatted_address (those
-- stay untouched, same as today; a theatre's real-world identity is still
-- only ever resolved from place_id). Some theatres are known locally by a
-- name Google doesn't use (an old name, a colloquial shorthand) — this
-- lets an admin record that without touching the authoritative fields,
-- shown by the frontend only when present. Admin-only to set (PATCH
-- /venues/theatres/{id}/nickname, routers/venues.py) — same governance
-- reasoning as theatres.status (migration 20260813000013): shared
-- directory data referenced by many users' history.

alter table public.theatres
  add column if not exists nickname text,
  add column if not exists nickname_address text;

-- Partial index (only rows that actually have a nickname) -- same shape
-- as idx_theatres_name_trgm, just scoped down since most theatres will
-- never have one.
create index if not exists idx_theatres_nickname_trgm
  on public.theatres using gin (nickname public.gin_trgm_ops)
  where nickname is not null;

-- match_theatres now ranks on whichever of name/nickname is the closer
-- match, so a search against a theatre's colloquial nickname still
-- surfaces it for the "did you mean" prompt, not just a search against
-- its official Google name. coalesce(nickname, '') so similarity() never
-- has to deal with a null argument (similarity(x, null) is null, which
-- would make greatest() null too and silently drop the row from ranking
-- entirely for any theatre with no nickname set).
--
-- Adding an output column (`nickname`) is a return-type change --
-- CREATE OR REPLACE FUNCTION cannot do that in place (Postgres rejects it
-- with "cannot change return type of existing function"), so the old
-- signature has to be dropped first.
drop function if exists public.match_theatres(text, text, int);

create function public.match_theatres(p_query text, p_city text default null, p_limit int default 5)
returns table (id uuid, name text, chain text, city text, formatted_address text, nickname text, similarity real)
language sql stable
as $$
  select t.id, t.name, t.chain, t.city, t.formatted_address, t.nickname,
         greatest(similarity(t.name, p_query), similarity(coalesce(t.nickname, ''), p_query)) as similarity
  from public.theatres t
  where (p_city is null or t.city ilike p_city)
    and greatest(similarity(t.name, p_query), similarity(coalesce(t.nickname, ''), p_query)) > 0.2
  order by similarity desc
  limit p_limit;
$$;

revoke all on function public.match_theatres(text, text, int) from public;
grant execute on function public.match_theatres(text, text, int) to anon, authenticated;
