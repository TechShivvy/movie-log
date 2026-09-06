-- Live-verified bug: select * from match_theatres('PVR') against a real
-- theatre named "PVR VR Chennai Anna Nagar" returned an EMPTY array, while
-- the full name ('PVR VR Chennai Anna Nagar') returns similarity 1. Root
-- cause: plain similarity() compares the *whole* query against the *whole*
-- target's trigram set, so a short query gets heavily penalized against a
-- long target — similarity('PVR', 'PVR VR Chennai Anna Nagar') is only
-- ~0.17, well under the existing 0.2 threshold. word_similarity() is
-- pg_trgm's purpose-built fix for exactly this shape: it finds the best-
-- matching word-boundary substring within the target rather than
-- comparing the two strings as wholes —
-- word_similarity('PVR', 'PVR VR Chennai Anna Nagar') = 1.0.
--
-- Verified live against the one real theatre in the dev DB
-- (88cb3a5e-8f44-4c5f-9b3b-178496ffa140, "PVR VR Chennai Anna Nagar",
-- Chennai) plus synthetic probes for false-positive risk:
--   word_similarity('PVR', <that theatre's name>)   = 1.0
--   word_similarity('Chen', <that theatre's name>)  = 0.8
--   word_similarity('Pv', <that theatre's name>)    = 0.667  (2-char, the
--                                                     shortest TheatreMatchRequest.query allows)
--   word_similarity('INOX', <that theatre's name>)  = 0     (genuinely absent, correctly 0)
--   word_similarity('PVR'/'Pv'/'INOX'/'In', <4 unrelated real-shaped
--                    theatre names — "Inox Nexus Mall", "Cinepolis Forum
--                    Vijaya Mall", "AGS Cinemas", "Sathyam Cinemas">) = 0
--                    across every combination tried — no false-positive
--                    signal at this query length in the cases checked.
-- 0.3 sits comfortably between the observed noise floor (0.0) and the
-- observed signal for a genuine 2-4 char chain-name prefix (0.667-1.0).
--
-- Additive, not a replacement: the existing similarity()-based condition/
-- threshold is untouched (so nothing that matched before stops matching),
-- word_similarity() is OR'd in as a second way to pass the filter, and
-- both feed the same greatest(...) used for ranking. Same signature as
-- before (id, name, chain, city, formatted_address, nickname, similarity)
-- so this is a plain CREATE OR REPLACE, no drop needed.
create or replace function public.match_theatres(p_query text, p_city text default null, p_limit int default 5)
returns table (id uuid, name text, chain text, city text, formatted_address text, nickname text, similarity real)
language sql stable
as $$
  select t.id, t.name, t.chain, t.city, t.formatted_address, t.nickname,
         greatest(
           similarity(t.name, p_query),
           similarity(coalesce(t.nickname, ''), p_query),
           word_similarity(p_query, t.name),
           word_similarity(p_query, coalesce(t.nickname, ''))
         ) as similarity
  from public.theatres t
  where (p_city is null or t.city ilike p_city)
    and (
      greatest(similarity(t.name, p_query), similarity(coalesce(t.nickname, ''), p_query)) > 0.2
      or greatest(word_similarity(p_query, t.name), word_similarity(p_query, coalesce(t.nickname, ''))) > 0.3
    )
  order by similarity desc
  limit p_limit;
$$;

revoke all on function public.match_theatres(text, text, int) from public;
grant execute on function public.match_theatres(text, text, int) to anon, authenticated;
