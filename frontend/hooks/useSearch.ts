import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_MOVIES, MOCK_VENUES } from "../lib/mockData";
import type { MovieSearchResult, Venue } from "../types";

export function useMovieSearch(q: string) {
  return useQuery({
    queryKey: ["search", "movies", q],
    queryFn: async () => {
      if (DEMO_MODE || !q) {
        return q
          ? MOCK_MOVIES.filter((m) => m.title.toLowerCase().includes(q.toLowerCase()))
          : MOCK_MOVIES;
      }
      const { data } = await api.get<MovieSearchResult[]>("/search/movies", { params: { q } });
      return data;
    },
    enabled: true,
  });
}

export function useVenueSearch(q?: string) {
  return useQuery({
    queryKey: ["search", "venues", q],
    queryFn: async () => {
      if (DEMO_MODE) {
        return q
          ? MOCK_VENUES.filter((v) => v.name.toLowerCase().includes((q ?? "").toLowerCase()))
          : MOCK_VENUES;
      }
      const { data } = await api.get<Venue[]>("/venues", { params: q ? { q } : undefined });
      return data;
    },
  });
}
