-- Migration 011 (screen_match_rpc): a "did you mean" prompt for screens,
-- scoped to one theatre — same idea and same trigram approach as
-- match_theatres (migration 003), just one level down. Lets the client
-- nudge a user typing "Scrn 4" toward the theatre's existing "Screen 4"
-- before they create a near-duplicate, the same structural fix
-- match_theatres already gives theatres. No ground truth exists for what
-- screens *should* exist at a theatre (nothing publishes that data), so
-- this can only reduce accidental duplicates, not validate correctness.

create or replace function public.match_screens(p_theatre_id uuid, p_query text, p_limit int default 5)
returns table (id uuid, name text, screen_type text, similarity real)
language sql stable
as $$
  select s.id, s.name, s.screen_type,
         similarity(s.name, p_query) as similarity
  from public.screens s
  where s.theatre_id = p_theatre_id
    and similarity(s.name, p_query) > 0.2
  order by similarity desc
  limit p_limit;
$$;

revoke all on function public.match_screens(uuid, text, int) from public;
grant execute on function public.match_screens(uuid, text, int) to anon, authenticated;
