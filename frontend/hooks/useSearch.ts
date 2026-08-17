import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_MOVIES, MOCK_VENUES } from "../lib/mockData";
import type { MovieSearchResult, Venue } from "../types";

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
 * Venue search / list.
 * Backend: GET /api/v1/venues  ?q=...
 */
export function useVenueSearch(q?: string) {
  return useQuery({
    queryKey: ["search", "venues", q],
    queryFn: async () => {
      if (DEMO_MODE) {
        return q
          ? MOCK_VENUES.filter((v) =>
              v.name.toLowerCase().includes((q ?? "").toLowerCase())
            )
          : MOCK_VENUES;
      }
      const { data } = await api.get<Venue[]>("/venues", {
        params: q ? { q } : undefined,
      });
      return data;
    },
  });
}
