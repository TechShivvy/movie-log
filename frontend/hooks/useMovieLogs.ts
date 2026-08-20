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
export function useMovieLogs(params?: { archived?: boolean; visibility?: string; movieId?: string; theatreId?: string; screenId?: string }) {
  return useQuery({
    queryKey: logKeys.list(params),
    queryFn: async () => {
      if (DEMO_MODE) return MOCK_LOGS;
      // The backend's actual query param is `archived_only` (and
      // `movie_id`/`theatre_id`/`screen_id`, snake_case) — this hook's own
      // params stay camelCase/`archived` to match this codebase's call-site
      // convention, translated here. Sending `archived` literally (the old
      // behavior) was silently ignored server-side: FastAPI just never
      // bound it to anything, so every caller — Library's filter chips,
      // Profile, Feed — always got the same default (non-archived-only)
      // set back regardless of what was actually asked for. That's why the
      // Library "Archived" filter chip never showed anything: the
      // underlying fetch never actually requested archived rows.
      const { archived, movieId, theatreId, screenId, ...rest } = params ?? {};
      const apiParams = {
        ...rest,
        ...(archived !== undefined ? { archived_only: archived } : {}),
        ...(movieId ? { movie_id: movieId } : {}),
        ...(theatreId ? { theatre_id: theatreId } : {}),
        ...(screenId ? { screen_id: screenId } : {}),
      };
      const { data } = await api.get<MovieLog[]>("/movie-logs", { params: apiParams });
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
    // The response already IS the full created log — priming its detail
    // key means whatever navigates to /log/{id} right after saving (see
    // LogFormScreen's post-save routing) renders instantly instead of a
    // real GET round-trip against a cache entry that doesn't exist yet.
    // List caches still just get invalidated: safely inserting the new
    // row into every currently-cached *filtered* list (by movie/theatre/
    // screen) would mean re-deriving each list's own filter criteria
    // here, which is exactly the kind of fragile duplication worth
    // avoiding — a background refetch is the correct source of truth for
    // "does this new log belong in this particular filtered view."
    onSuccess: (log) => {
      qc.setQueryData(logKeys.detail(log.id), log);
      qc.invalidateQueries({ queryKey: logKeys.all });
    },
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
    // Was invalidateQueries(logKeys.all) + invalidateQueries(logKeys.detail(id))
    // — the second call was always redundant (logKeys.all, ["movie-logs"],
    // already prefix-matches ["movie-logs","detail",id]) and neither one
    // used the `log` this handler is handed, which already IS the full
    // updated row straight from the PATCH response. This is the exact
    // "edit -> view takes 1-2s" bug: LogDetailScreen's useMovieLog(id)
    // rendered the now-stale cached copy first and only swapped in the
    // real values after a fresh GET landed. setQueryData makes the detail
    // view correct the instant this resolves; setQueriesData patches the
    // same row wherever it's already sitting in a cached list (a field
    // edit never changes *whether* a log belongs in an already-cached
    // list the way create/archive can, so an unconditional by-id
    // replace is safe here). invalidate still runs in the background to
    // reconcile anything this optimistic patch can't know about (sort
    // order, a list this log now belongs in that isn't cached yet).
    onSuccess: (log) => {
      qc.setQueryData(logKeys.detail(log.id), log);
      qc.setQueriesData<MovieLog[]>({ queryKey: [...logKeys.all, "list"] }, (old) =>
        old ? old.map((l) => (l.id === log.id ? log : l)) : old
      );
      qc.invalidateQueries({ queryKey: logKeys.all });
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
      // Strip the deleted log out of every cached list synchronously,
      // rather than only invalidating and waiting on a real refetch —
      // invalidateQueries alone left the just-deleted log visibly
      // sitting in the library grid for the full round-trip of that
      // background refetch (1-2s, more on a cold backend) after
      // navigating back from its now-gone detail screen. setQueriesData
      // updates what's on screen immediately; the invalidate below still
      // runs to reconcile with the server in the background.
      qc.setQueriesData<MovieLog[]>({ queryKey: [...logKeys.all, "list"] }, (old) =>
        old ? old.filter((l) => l.id !== id) : old
      );
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
      if (DEMO_MODE) return undefined;
      // Same endpoint/response shape as useUpdateLog (PATCH .../{id}) —
      // was discarding it entirely (bare `await`, no `data`) even though
      // it's the full updated log.
      const { data } = await api.patch<MovieLog>(`/movie-logs/${id}`, { is_archived: archive });
      return data;
    },
    // Only primes the detail cache, not list caches — unlike a plain
    // field edit (useUpdateLog), archiving changes exactly the field
    // most list views filter *on* (Library's default view excludes
    // archived; its Archived chip includes only archived), so an
    // unconditional by-id patch-in-place would leave the log sitting in
    // the wrong list until the background invalidate's refetch catches
    // up anyway — not worth hand-replicating every list's filter logic
    // here just to skip that one refetch. The detail view (where the
    // archive button and its toast actually live) is what benefits.
    onSuccess: (log) => {
      if (log) qc.setQueryData(logKeys.detail(log.id), log);
      qc.invalidateQueries({ queryKey: logKeys.all });
    },
  });
}
