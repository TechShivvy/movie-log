import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_MOVIES, MOCK_VENUES } from "../lib/mockData";
import type { MovieSearchResult, Theatre, TheatreMatchCandidate } from "../types";

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
