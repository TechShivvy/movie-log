import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import type { Comment } from "../types";

// ─── Comments ────────────────────────────────────────────────────────────────

export function useComments(logId: string) {
  return useQuery({
    queryKey: ["comments", logId],
    queryFn: async () => {
      if (DEMO_MODE) return [] as Comment[];
      const { data } = await api.get<Comment[]>(`/movie-logs/${logId}/comments`);
      return data;
    },
    enabled: !!logId,
  });
}

export function useAddComment(logId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, parent_comment_id }: { content: string; parent_comment_id?: string }) => {
      if (DEMO_MODE) return;
      await api.post(`/movie-logs/${logId}/comments`, { content, parent_comment_id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", logId] }),
  });
}

export function useLikeComment(logId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, liked }: { commentId: string; liked: boolean }) => {
      if (DEMO_MODE) return;
      if (liked) {
        await api.delete(`/movie-logs/${logId}/comments/${commentId}/like`);
      } else {
        await api.post(`/movie-logs/${logId}/comments/${commentId}/like`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", logId] }),
  });
}

// ─── Log Likes ───────────────────────────────────────────────────────────────

export function useLikeLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, liked }: { logId: string; liked: boolean }) => {
      if (DEMO_MODE) return;
      if (liked) {
        await api.delete(`/movie-logs/${logId}/like`);
      } else {
        await api.post(`/movie-logs/${logId}/like`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["movie-logs"] }),
  });
}

// ─── Follow / Block ───────────────────────────────────────────────────────────

export function useFollowUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ username, following }: { username: string; following: boolean }) => {
      if (DEMO_MODE) return;
      if (following) {
        await api.delete(`/users/${username}/follow`);
      } else {
        await api.post(`/users/${username}/follow`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ username, blocked }: { username: string; blocked: boolean }) => {
      if (DEMO_MODE) return;
      if (blocked) {
        await api.delete(`/users/${username}/block`);
      } else {
        await api.post(`/users/${username}/block`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
