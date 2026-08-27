import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
        if (e?.status === 404) return null;
        throw e;
      }
    },
    enabled: !!logId,
  });
  return data ?? undefined;
}

/**
 * PUT /movie-logs/{id}/venue-rating — upsert the caller's screen/speaker/
 * AC/seat rating for one log. Only meaningful once the log itself exists
 * (venue-rating rows are scoped to a movie_log_id), so LogFormScreen calls
 * this *after* create/update succeeds, never before.
 */
export function useUpsertVenueRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, rating }: { logId: string; rating: VenueRating }) => {
      const { data } = await api.put<VenueRating>(`/movie-logs/${logId}/venue-rating`, rating);
      return data;
    },
    // The PUT response already IS the saved rating — was named `_data`
    // and thrown away, forcing a real GET round-trip (this save sits on
    // the same LogFormScreen submit path as useUpdateLog, so it compounds
    // that screen's edit->view delay). Priming the cache directly skips
    // that round-trip entirely; invalidate stays as a background
    // reconciliation safety net.
    onSuccess: (data, { logId }) => {
      qc.setQueryData(["movie-logs", "venue-rating", logId], data);
      qc.invalidateQueries({ queryKey: ["movie-logs", "venue-rating", logId] });
    },
  });
}
