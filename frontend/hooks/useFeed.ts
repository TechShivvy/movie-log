import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_LOGS } from "../lib/mockData";
import type { MovieLog } from "../types";

/**
 * GET /public/feed — public logs from users the caller follows (never the
 * caller's own logs; visibility=public only, excludes archived — the
 * backend's own feed_entries view gating, not a client-side filter).
 * Requires sign-in, no anonymous variant. Optional movieId/theatreId/
 * screenId narrow this to entries about one movie/venue — the "Following"
 * section on MovieDetailScreen/VenueDetailScreen/ScreenDetailScreen, and
 * (with none of the three set) FeedScreen's actual global feed, replacing
 * its previous fake of just showing the caller's own logs.
 */
export function useFeed(params?: { movieId?: string; theatreId?: string; screenId?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["feed", params],
    queryFn: async () => {
      if (DEMO_MODE) return MOCK_LOGS;
      const { movieId, theatreId, screenId, ...rest } = params ?? {};
      const apiParams = {
        ...rest,
        ...(movieId ? { movie_id: movieId } : {}),
        ...(theatreId ? { theatre_id: theatreId } : {}),
        ...(screenId ? { screen_id: screenId } : {}),
      };
      const { data } = await api.get<MovieLog[]>("/public/feed", { params: apiParams });
      return data;
    },
  });
}
