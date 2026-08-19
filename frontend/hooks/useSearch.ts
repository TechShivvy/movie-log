import { useMutation, useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_MOVIES, MOCK_VENUES } from "../lib/mockData";
import type {
  Movie,
  MovieSearchResult,
  Theatre,
  TheatreMatchCandidate,
  TheatrePlaceSuggestion,
} from "../types";

/**
 * TMDB movie catalog search.
 * Backend: POST /api/v1/movies/search  body: { query: string }
 * Returns an empty array while the query is blank.
 */
export function useMovieSearch(q: string) {
  return useQuery({
    queryKey: ["search", "movies", q],
    queryFn: async () => {
      if (DEMO_MODE || !q) {
        return q
          ? MOCK_MOVIES.filter((m) =>
              m.title.toLowerCase().includes(q.toLowerCase())
            )
          : MOCK_MOVIES;
      }
      const { data } = await api.post<MovieSearchResult[]>("/movies/search", {
        query: q,
      });
      return data;
    },
    enabled: true,
  });
}

/**
 * Dedupes-by-tmdb_id into our own movies catalog (POST /movies) so a log
 * can carry a real movie_id — without this there was no way to get from
 * "picked a TMDB search hit" to a linkable catalog row at all, so
 * LogFormScreen only ever filled the title text, never movie_id, and the
 * poster preview shown while picking never survived past the create form.
 * Safe to call again for a title the caller already has a catalog row for
 * (or another caller entirely has) — the backend returns the existing row
 * instead of creating a duplicate.
 */
export function useCreateMovie() {
  return useMutation({
    mutationFn: async (tmdbId: number): Promise<Movie | undefined> => {
      if (DEMO_MODE) return undefined;
      const { data } = await api.post<Movie>("/movies", { tmdb_id: tmdbId });
      return data;
    },
  });
}

/**
 * A catalog entry by id — title/language/release date/poster_path. Public,
 * no auth needed (matches the backend route). This is how a saved log's
 * real poster gets rendered instead of the hue-gradient placeholder:
 * MovieLog only ever carries movie_id, never the poster itself, so
 * anywhere a poster shows for a log with movie_id set needs this lookup.
 * React Query dedupes/caches by id, so five logs for the same film cost
 * one fetch, not five.
 */
export function useMovie(movieId: string | undefined) {
  return useQuery({
    queryKey: ["movies", movieId],
    queryFn: async () => {
      const { data } = await api.get<Movie>(`/movies/${movieId}`);
      return data;
    },
    enabled: !DEMO_MODE && !!movieId,
    staleTime: 10 * 60_000, // a catalog entry's poster/title never changes underneath it
  });
}

/**
 * Venue search — trigram "did you mean" match over our own theatres
 * directory, free (no Google Places call). There is no GET /venues
 * list/search endpoint at all; discovery is only via this match RPC or
 * POST /venues/theatres/search-places (Google Places autocomplete,
 * billed server-side, for picking a brand-new theatre to create).
 * Backend: POST /api/v1/venues/theatres/match  body: { query }
 */
export function useVenueSearch(q?: string) {
  return useQuery({
    queryKey: ["search", "venues", q],
    queryFn: async (): Promise<TheatreMatchCandidate[]> => {
      if (DEMO_MODE) {
        const matches = q
          ? MOCK_VENUES.filter((v) => v.name.toLowerCase().includes((q ?? "").toLowerCase()))
          : MOCK_VENUES;
        return matches.map((v) => ({ id: v.id, name: v.name, city: v.city, similarity: 1 }));
      }
      if (!q || q.trim().length < 3) return [];
      const { data } = await api.post<TheatreMatchCandidate[]>("/venues/theatres/match", {
        query: q,
      });
      return data;
    },
  });
}

/**
 * Google Places autocomplete, for when useVenueSearch's free trigram match
 * comes up empty — our own theatres directory only ever grows from
 * someone actually creating a row via useCreateTheatre below, so an empty
 * table (or just a theatre nobody's logged yet) means /theatres/match can
 * only ever return [], with no way to break that loop from the UI. This
 * is the fallback: real Google results to pick from instead.
 *
 * A mutation, not a query — deliberately NOT wired to fire on every
 * keystroke like useVenueSearch. Unlike /theatres/match, this one calls
 * the real Google Places API (billed server-side past its monthly
 * credit), so it only ever runs on an explicit "search Google" tap, never
 * an idle debounce that could bill for a query someone's still typing.
 * Backend: POST /api/v1/venues/theatres/search-places  body: {query, session_token}
 */
export function useSearchPlaces() {
  return useMutation({
    mutationFn: async ({ query, sessionToken }: { query: string; sessionToken: string }): Promise<TheatrePlaceSuggestion[]> => {
      if (DEMO_MODE) return [];
      const { data } = await api.post<TheatrePlaceSuggestion[]>("/venues/theatres/search-places", {
        query,
        session_token: sessionToken,
      });
      return data;
    },
  });
}

/**
 * Creates (or, if this place_id already exists, returns the existing)
 * theatre from a picked Google Places suggestion — the other half of the
 * useSearchPlaces fallback above. place_id is the real dedup key the
 * backend matches on; name/city here are best-effort from the
 * autocomplete result's own text (Google's autocomplete response is only
 * ever a free-text description, never structured address components) —
 * the backend re-fetches the place server-side from place_id and
 * overwrites these with the real name/address/lat-lng whenever that
 * lookup succeeds, so they only ever end up as the final stored value in
 * the (rare) case that lookup fails.
 */
export function useCreateTheatre() {
  return useMutation({
    mutationFn: async (place: TheatrePlaceSuggestion): Promise<Theatre | undefined> => {
      if (DEMO_MODE) return undefined;
      const { data } = await api.post<Theatre>("/venues/theatres", {
        name: place.main_text ?? place.description ?? "Unknown theatre",
        city: place.secondary_text?.split(",")[0]?.trim() || "Unknown",
        place_id: place.place_id,
        formatted_address: place.description,
      });
      return data;
    },
  });
}
