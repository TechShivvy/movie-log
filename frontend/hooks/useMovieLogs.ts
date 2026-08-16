import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { MOCK_LOGS } from "../lib/mockData";
import type { MovieLog, CreateMovieLogPayload } from "../types";

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
export function useCreateLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateMovieLogPayload) => {
      if (DEMO_MODE) {
        const fake: MovieLog = {
          id: `demo-${Date.now()}`,
          user_id: "u1",
          ...payload,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          like_count: 0,
          comment_count: 0,
          is_liked: false,
          visibility: payload.visibility ?? "public",
          movie_title: payload.movie_title,
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
export function useUpdateLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<CreateMovieLogPayload> }) => {
      if (DEMO_MODE) return { id, ...payload } as MovieLog;
      const { data } = await api.put<MovieLog>(`/movie-logs/${id}`, payload);
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
    onSuccess: () => qc.invalidateQueries({ queryKey: logKeys.all }),
  });
}

// ─── Archive / unarchive ──────────────────────────────────────────────────────
export function useArchiveLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      if (DEMO_MODE) return;
      if (archive) {
        await api.post(`/movie-logs/${id}/archive`);
      } else {
        await api.delete(`/movie-logs/${id}/archive`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: logKeys.all }),
  });
}
