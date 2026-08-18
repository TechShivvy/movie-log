import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_LOGS } from "../lib/mockData";
import type { MovieLog, MovieLogInput } from "../types";

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const logKeys = {
  all: ["movie-logs"] as const,
  list: (params?: object) => [...logKeys.all, "list", params] as const,
  detail: (id: string) => [...logKeys.all, "detail", id] as const,
};

// ─── Fetch all logs ───────────────────────────────────────────────────────────
export function useMovieLogs(params?: { archived?: boolean; visibility?: string }) {
  return useQuery({
    queryKey: logKeys.list(params),
    queryFn: async () => {
      if (DEMO_MODE) return MOCK_LOGS;
      const { data } = await api.get<MovieLog[]>("/movie-logs", { params });
      return data;
    },
  });
}

// ─── Fetch single log ─────────────────────────────────────────────────────────
export function useMovieLog(id: string) {
  return useQuery({
    queryKey: logKeys.detail(id),
    queryFn: async () => {
      if (DEMO_MODE) {
        const log = MOCK_LOGS.find((l) => l.id === id);
        if (!log) throw new Error("Log not found");
        return log;
      }
      const { data } = await api.get<MovieLog>(`/movie-logs/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// ─── Create log ───────────────────────────────────────────────────────────────
// `movie` is the only field the backend actually requires (routers/
// movie_logs.py's own create_log docstring) — everything else is optional,
// same as MovieLogInput below allows.
export function useCreateLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MovieLogInput & { movie: string }) => {
      if (DEMO_MODE) {
        const fake: MovieLog = {
          id: `demo-${Date.now()}`,
          user_id: "u1",
          seats: [],
          is_fdfs: false,
          is_first_day: false,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          like_count: 0,
          visibility: payload.visibility ?? "private",
          ...payload,
        };
        return fake;
      }
      const { data } = await api.post<MovieLog>("/movie-logs", payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: logKeys.all }),
  });
}

// ─── Update log ───────────────────────────────────────────────────────────────
// PATCH, not PUT — a partial update, only the fields actually sent are
// changed (MovieLogUpdate's own "extra='ignore'" exclude-unset convention).
export function useUpdateLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: MovieLogInput }) => {
      if (DEMO_MODE) return { id, ...payload } as MovieLog;
      const { data } = await api.patch<MovieLog>(`/movie-logs/${id}`, payload);
      return data;
    },
    onSuccess: (log) => {
      qc.invalidateQueries({ queryKey: logKeys.all });
      qc.invalidateQueries({ queryKey: logKeys.detail(log.id) });
    },
  });
}

// ─── Delete log ───────────────────────────────────────────────────────────────
export function useDeleteLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (DEMO_MODE) return;
      await api.delete(`/movie-logs/${id}`);
    },
    // Was invalidateQueries({queryKey: logKeys.all}) — which also invalidates
    // this exact log's own detail query (logKeys.detail(id)), now 404ing
    // since the row is gone. invalidateQueries awaits the refetch of every
    // active query it touches, and the default queryClient retries a failed
    // query once with backoff (app/_layout.tsx's retry:1) before settling —
    // so deleting a log while its own detail screen was open made this
    // mutation's returned promise (and anything awaiting it, e.g. a
    // "delete then navigate away" flow) hang for several seconds on a
    // pointless refetch-of-something-that-no-longer-exists. Removing the
    // detail query outright — not invalidating it — is also the more
    // correct action for a deleted resource: there's nothing left to
    // refetch. List queries still get a real invalidate-and-refetch, same
    // as before.
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: logKeys.detail(id) });
      // logKeys.all (not logKeys.list()) — invalidateQueries prefix-matches
      // on the queryKey array, and logKeys.list() with no params produces
      // [...all, "list", undefined], which isn't a structural prefix of the
      // real cached keys (logKeys.list({archived: false}), etc.). all is
      // the broadest key that still correctly prefix-matches every list
      // variant — same as the pre-existing behavior, just without the one
      // query already removed above.
      qc.invalidateQueries({ queryKey: logKeys.all });
    },
  });
}

// ─── Archive / unarchive ──────────────────────────────────────────────────────
// No dedicated /archive sub-resource exists on the backend — archiving is
// just PATCH /movie-logs/{id} { is_archived }, same endpoint as any other
// field update.
export function useArchiveLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      if (DEMO_MODE) return;
      await api.patch(`/movie-logs/${id}`, { is_archived: archive });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: logKeys.all }),
  });
}
