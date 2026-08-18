import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import type { VenueRating } from "../types";

/**
 * GET /movie-logs/{id}/venue-rating — the caller's own screen/speaker/AC/
 * seat rating for one log, 404 when none exists yet. 404 is treated as "no
 * rating," not an error: LogDetailScreen hides the whole venue-ratings
 * section when this returns undefined, same hide-if-empty rule as every
 * other optional field on that screen — a log with no rating is the
 * overwhelmingly common case (only screenings you bothered to rate the
 * venue on have one at all), not a failure.
 */
export function useVenueRating(logId: string): VenueRating | undefined {
  const { data } = useQuery({
    queryKey: ["movie-logs", "venue-rating", logId],
    // React Query treats a queryFn resolving to `undefined` as an error
    // ("Query data cannot be undefined") — it's reserved to mean "no data
    // yet," not a valid result. `null` is the value to return for a real,
    // confirmed "no rating exists" outcome; the hook's own return type
    // still exposes `undefined` to callers (via the destructure below)
    // since LogDetailScreen's hide-if-empty checks already read as
    // `!rating`/`rating?.x`, which null and undefined satisfy identically.
    queryFn: async (): Promise<VenueRating | null> => {
      if (DEMO_MODE) return null;
      try {
        const { data } = await api.get<VenueRating>(`/movie-logs/${logId}/venue-rating`);
        return data;
      } catch (e: any) {
        if (e?.response?.status === 404) return null;
        throw e;
      }
    },
    enabled: !!logId,
  });
  return data ?? undefined;
}
